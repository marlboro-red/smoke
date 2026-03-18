import { ipcMain, dialog, type BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { configStore, defaultPreferences } from '../../config/ConfigStore'
import { memoizeAsyncWithTTL } from '../../utils/memoizeWithTTL'
import {
  APP_GET_LAUNCH_CWD,
  APP_GET_GIT_BRANCH,
  WINDOW_MINIMIZE,
  WINDOW_MAXIMIZE,
  WINDOW_CLOSE,
  WINDOW_IS_MAXIMIZED,
  CANVAS_EXPORT_PNG,
  SHELL_LIST,
  WORKSPACE_OPEN_DIALOG,
  WORKSPACE_SET_TITLE,
  WORKSPACE_GET_RECENT,
  WORKSPACE_ADD_RECENT,
  type CanvasExportPngRequest,
  type CanvasExportPngResponse,
  type ShellInfo,
} from '../channels'

const execFileAsync = promisify(execFile)

export function registerAppHandlers(
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string,
  onMenuRebuild?: () => void,
): void {
  // Canvas export handler — capture canvas area as PNG
  ipcMain.handle(CANVAS_EXPORT_PNG, async (_event, request: CanvasExportPngRequest): Promise<CanvasExportPngResponse> => {
    const win = getMainWindow()
    if (!win) return { filePath: null }

    const image = await win.webContents.capturePage({
      x: request.x,
      y: request.y,
      width: request.width,
      height: request.height,
    })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Canvas as PNG',
      defaultPath: `smoke-canvas-${timestamp}.png`,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    })

    if (result.canceled || !result.filePath) {
      return { filePath: null }
    }

    await fs.writeFile(result.filePath, image.toPNG())
    return { filePath: result.filePath }
  })

  // App info handlers
  ipcMain.handle(APP_GET_LAUNCH_CWD, (): string => {
    return launchCwd
  })

  // Git branch: 10s TTL with stale-while-revalidate (returns stale value instantly, refreshes in background)
  const gitBranchCache = memoizeAsyncWithTTL(
    async (): Promise<string | null> => {
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: launchCwd,
          timeout: 3000,
        })
        return stdout.trim()
      } catch (err) {
        console.warn('[ipc] Failed to detect git branch:', err)
        return null
      }
    },
    { ttlMs: 10_000, staleWhileRevalidate: true }
  )

  ipcMain.handle(APP_GET_GIT_BRANCH, (): Promise<string | null> => {
    return gitBranchCache.get()
  })

  // Window control handlers (for frameless window on Windows/Linux)
  ipcMain.handle(WINDOW_MINIMIZE, (): void => {
    const win = getMainWindow()
    if (win) win.minimize()
  })

  ipcMain.handle(WINDOW_MAXIMIZE, (): void => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.handle(WINDOW_CLOSE, (): void => {
    const win = getMainWindow()
    if (win) win.close()
  })

  ipcMain.handle(WINDOW_IS_MAXIMIZED, (): boolean => {
    const win = getMainWindow()
    return win ? win.isMaximized() : false
  })

  // Shell detection: 5min TTL, invalidated on preferences change (shells rarely change at runtime)
  const shellListCache = memoizeAsyncWithTTL(
    async (): Promise<ShellInfo[]> => {
      const shells: ShellInfo[] = []
      const seen = new Set<string>()

      if (process.platform === 'win32') {
        const candidates = [
          { path: 'powershell.exe', name: 'PowerShell' },
          { path: 'pwsh.exe', name: 'PowerShell Core' },
          { path: 'cmd.exe', name: 'Command Prompt' },
          { path: 'nu.exe', name: 'Nushell' },
          { path: 'bash.exe', name: 'Bash (WSL)' },
          { path: 'wsl.exe', name: 'WSL' },
        ]
        const checks = candidates.map(async (c) => {
          try {
            await execFileAsync('where', [c.path], { timeout: 2000 })
            return c
          } catch (err) {
            console.warn(`[ipc] Shell not found: ${c.path}`, err)
            return null
          }
        })
        const results = await Promise.all(checks)
        for (const r of results) {
          if (r) shells.push(r)
        }
      } else {
        // Unix: read /etc/shells for known shell paths
        try {
          const etcShells = await fs.readFile('/etc/shells', 'utf-8')
          for (const line of etcShells.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            if (seen.has(trimmed)) continue
            try {
              await fs.access(trimmed, fs.constants.X_OK)
              seen.add(trimmed)
              const name = path.basename(trimmed)
              shells.push({ path: trimmed, name })
            } catch (err) {
              console.warn(`[ipc] Shell not accessible: ${trimmed}`, err)
            }
          }
        } catch (err) {
          console.warn('[ipc] Could not read /etc/shells, falling back to common paths:', err)
          const fallbacks = ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/bin/fish', '/usr/bin/nu']
          for (const p of fallbacks) {
            try {
              await fs.access(p, fs.constants.X_OK)
              shells.push({ path: p, name: path.basename(p) })
            } catch (err2) {
              console.warn(`[ipc] Fallback shell not accessible: ${p}`, err2)
            }
          }
        }
      }

      return shells
    },
    { ttlMs: 300_000 } // 5 minutes
  )

  // Invalidate shell cache when preferences change (e.g. defaultShell updated)
  configStore.onDidChange('preferences', () => {
    shellListCache.invalidate()
  })

  ipcMain.handle(SHELL_LIST, (): Promise<ShellInfo[]> => {
    return shellListCache.get()
  })

  // Workspace handlers
  ipcMain.handle(WORKSPACE_OPEN_DIALOG, async (): Promise<string | null> => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open Workspace',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(WORKSPACE_SET_TITLE, (_event, title: string): void => {
    const win = getMainWindow()
    if (win) win.setTitle(title)
  })

  const MAX_RECENT_WORKSPACES = 10

  ipcMain.handle(WORKSPACE_GET_RECENT, (): string[] => {
    return configStore.get('recentWorkspaces', [])
  })

  ipcMain.handle(WORKSPACE_ADD_RECENT, (_event, workspacePath: string): string[] => {
    const recent = configStore.get('recentWorkspaces', []) as string[]
    const filtered = recent.filter((p) => p !== workspacePath)
    const updated = [workspacePath, ...filtered].slice(0, MAX_RECENT_WORKSPACES)
    configStore.set('recentWorkspaces', updated)
    onMenuRebuild?.()
    return updated
  })
}
