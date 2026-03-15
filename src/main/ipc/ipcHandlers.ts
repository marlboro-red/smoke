import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PtyManager } from '../pty/PtyManager'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import type { Layout, Preferences, SmokeConfig } from '../config/ConfigStore'
import { terminalOutputBuffer } from '../ai/TerminalOutputBuffer'
import {
  PTY_SPAWN,
  PTY_DATA_TO_PTY,
  PTY_DATA_FROM_PTY,
  PTY_RESIZE,
  PTY_KILL,
  PTY_EXIT,
  LAYOUT_SAVE,
  LAYOUT_LOAD,
  LAYOUT_LIST,
  LAYOUT_DELETE,
  CONFIG_GET,
  CONFIG_SET,
  FS_READDIR,
  FS_READFILE,
  TERMINAL_BUFFER_READ,
  TERMINAL_BUFFER_READ_LINES,
  APP_GET_LAUNCH_CWD,
  PtySpawnRequest,
  PtySpawnResponse,
  PtyDataToPty,
  PtyResizeMessage,
  PtyKillMessage,
  LayoutSaveRequest,
  LayoutLoadRequest,
  LayoutDeleteRequest,
  ConfigSetRequest,
  FsReaddirRequest,
  FsReaddirEntry,
  FsReadfileRequest,
  FsReadfileResponse,
  TerminalBufferReadRequest,
  TerminalBufferReadLinesRequest,
} from './channels'

export function registerIpcHandlers(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string
): void {
  ipcMain.handle(PTY_SPAWN, (_event, request: PtySpawnRequest): PtySpawnResponse => {
    const preferences = configStore.get('preferences', defaultPreferences)

    // Use configured default shell if no shell specified in request
    const shell = request.shell || (preferences.defaultShell || undefined)

    const pty = ptyManager.spawn({
      id: request.id,
      cwd: request.cwd,
      shell,
      args: request.args,
      env: request.env,
      cols: request.cols,
      rows: request.rows
    })

    pty.on('data', (data: string) => {
      terminalOutputBuffer.append(pty.id, data)
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PTY_DATA_FROM_PTY, { id: pty.id, data })
      }
    })

    pty.on('exit', (exitCode: number, signal?: number) => {
      terminalOutputBuffer.delete(pty.id)
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PTY_EXIT, { id: pty.id, exitCode, signal })
      }
    })

    // Auto-launch Claude Code if enabled
    if (preferences.autoLaunchClaude && preferences.claudeCommand) {
      setTimeout(() => {
        pty.write(preferences.claudeCommand + '\n')
      }, 100)
    }

    return { id: pty.id, pid: pty.pid }
  })

  ipcMain.on(PTY_DATA_TO_PTY, (_event, message: PtyDataToPty) => {
    ptyManager.write(message.id, message.data)
  })

  ipcMain.on(PTY_RESIZE, (_event, message: PtyResizeMessage) => {
    ptyManager.resize(message.id, message.cols, message.rows)
  })

  ipcMain.on(PTY_KILL, (_event, message: PtyKillMessage) => {
    ptyManager.kill(message.id)
  })

  // Layout persistence handlers
  ipcMain.handle(LAYOUT_SAVE, (_event, request: LayoutSaveRequest): void => {
    if (request.name === '__default__') {
      configStore.set('defaultLayout', request.layout)
    } else {
      const layouts = configStore.get('namedLayouts', {})
      layouts[request.name] = request.layout
      configStore.set('namedLayouts', layouts)
    }
  })

  ipcMain.handle(LAYOUT_LOAD, (_event, request: LayoutLoadRequest): Layout | null => {
    if (request.name === '__default__') {
      return configStore.get('defaultLayout', null)
    }
    const layouts = configStore.get('namedLayouts', {})
    return layouts[request.name] ?? null
  })

  ipcMain.handle(LAYOUT_LIST, (): string[] => {
    const layouts = configStore.get('namedLayouts', {})
    return Object.keys(layouts)
  })

  ipcMain.handle(LAYOUT_DELETE, (_event, request: LayoutDeleteRequest): void => {
    const layouts = configStore.get('namedLayouts', {})
    delete layouts[request.name]
    configStore.set('namedLayouts', layouts)
  })

  // Config handlers
  ipcMain.handle(CONFIG_GET, (): Preferences => {
    return configStore.get('preferences', defaultPreferences)
  })

  ipcMain.handle(CONFIG_SET, (_event, request: ConfigSetRequest): void => {
    const validKeys: Array<keyof Preferences> = [
      'defaultShell', 'autoLaunchClaude', 'claudeCommand',
      'gridSize', 'sidebarPosition', 'sidebarWidth',
      'theme', 'defaultCwd',
    ]
    if (!validKeys.includes(request.key as keyof Preferences)) return
    const key = `preferences.${request.key}` as keyof SmokeConfig
    configStore.set(key, request.value as never)
  })

  // File system handlers
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB default max

  ipcMain.handle(FS_READDIR, async (_event, request: FsReaddirRequest): Promise<FsReaddirEntry[]> => {
    const dirPath = path.resolve(request.path)
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const results: FsReaddirEntry[] = []

    for (const entry of entries) {
      let type: FsReaddirEntry['type'] = 'other'
      let size = 0

      if (entry.isFile()) {
        type = 'file'
        try {
          const stat = await fs.stat(path.join(dirPath, entry.name))
          size = stat.size
        } catch {
          // stat may fail for broken symlinks, etc.
        }
      } else if (entry.isDirectory()) {
        type = 'directory'
      } else if (entry.isSymbolicLink()) {
        type = 'symlink'
      }

      results.push({ name: entry.name, type, size })
    }

    return results
  })

  ipcMain.handle(FS_READFILE, async (_event, request: FsReadfileRequest): Promise<FsReadfileResponse> => {
    const filePath = path.resolve(request.path)
    const maxSize = request.maxSize ?? MAX_FILE_SIZE

    const stat = await fs.stat(filePath)
    if (stat.size > maxSize) {
      throw new Error(`File too large: ${stat.size} bytes (max ${maxSize})`)
    }

    const content = await fs.readFile(filePath, 'utf-8')
    return { content, size: stat.size }
  })

  // Terminal output buffer handlers (AI orchestrator)
  ipcMain.handle(TERMINAL_BUFFER_READ, (_event, request: TerminalBufferReadRequest): string => {
    return terminalOutputBuffer.read(request.sessionId)
  })

  ipcMain.handle(TERMINAL_BUFFER_READ_LINES, (_event, request: TerminalBufferReadLinesRequest): string => {
    return terminalOutputBuffer.readLines(request.sessionId, request.lineCount)
  })

  // App info handlers
  ipcMain.handle(APP_GET_LAUNCH_CWD, (): string => {
    return launchCwd
  })
}
