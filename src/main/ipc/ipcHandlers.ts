import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PtyManager } from '../pty/PtyManager'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import type { Layout, Preferences, SmokeConfig } from '../config/ConfigStore'
import { terminalOutputBuffer } from '../ai/TerminalOutputBuffer'
import { AiService } from '../ai/AiService'
import { registerTools } from '../ai/tools'
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
  FS_WRITEFILE,
  TERMINAL_BUFFER_READ,
  TERMINAL_BUFFER_READ_LINES,
  RECORDING_FLUSH,
  RECORDING_LIST,
  RECORDING_LOAD,
  AI_SEND,
  AI_ABORT,
  AI_CLEAR,
  AI_CONFIG,
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
  FsWritefileRequest,
  FsWritefileResponse,
  TerminalBufferReadRequest,
  TerminalBufferReadLinesRequest,
  RecordingFlushRequest,
  RecordingListEntry,
  RecordingLoadRequest,
  AiSendRequest,
  AiSendResponse,
  AiAbortRequest,
  AiClearRequest,
  AiConfigSetRequest,
  AiConfigGetResponse,
} from './channels'

let aiServiceInstance: AiService | null = null

/** Get the shared AiService (available after registerIpcHandlers is called). */
export function getAiService(): AiService | null {
  return aiServiceInstance
}

export function registerIpcHandlers(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string
): void {
  // Instantiate the AI service and register tools
  const aiService = new AiService(getMainWindow)
  aiServiceInstance = aiService
  registerTools(aiService, ptyManager, getMainWindow)
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
      'theme', 'defaultCwd', 'aiApiKey', 'aiModel',
    ]
    if (!validKeys.includes(request.key as keyof Preferences)) return
    const key = `preferences.${request.key}` as keyof SmokeConfig
    configStore.set(key, request.value as never)

    // Invalidate AiService client cache when API key changes
    if (request.key === 'aiApiKey') {
      aiService.setConfig('aiApiKey', request.value)
    }
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

  ipcMain.handle(FS_WRITEFILE, async (_event, request: FsWritefileRequest): Promise<FsWritefileResponse> => {
    const filePath = path.resolve(request.path)

    // Safety: reject absolute paths outside the user's home directory
    const homedir = require('os').homedir()
    if (!filePath.startsWith(homedir)) {
      throw new Error(`Write denied: path must be within the user home directory`)
    }

    // Safety: reject writes to dotfiles/hidden config directories at the home root
    const relToHome = path.relative(homedir, filePath)
    const topSegment = relToHome.split(path.sep)[0]
    if (topSegment.startsWith('.') && topSegment !== '.') {
      throw new Error(`Write denied: cannot write to hidden config directories`)
    }

    const content = Buffer.from(request.content, 'utf-8')
    if (content.length > MAX_FILE_SIZE) {
      throw new Error(`Content too large: ${content.length} bytes (max ${MAX_FILE_SIZE})`)
    }

    await fs.writeFile(filePath, request.content, 'utf-8')
    return { size: content.length }
  })

  // Terminal output buffer handlers (AI orchestrator)
  ipcMain.handle(TERMINAL_BUFFER_READ, (_event, request: TerminalBufferReadRequest): string => {
    return terminalOutputBuffer.read(request.sessionId)
  })

  ipcMain.handle(TERMINAL_BUFFER_READ_LINES, (_event, request: TerminalBufferReadLinesRequest): string => {
    return terminalOutputBuffer.readLines(request.sessionId, request.lineCount)
  })

  // Recording handler — flush event log to disk
  ipcMain.handle(RECORDING_FLUSH, async (_event, request: RecordingFlushRequest): Promise<string> => {
    const { app } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    await fs.mkdir(recordingsDir, { recursive: true })
    const filename = `recording-${new Date(request.startedAt).toISOString().replace(/[:.]/g, '-')}.json`
    const filePath = path.join(recordingsDir, filename)
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf-8')
    return filePath
  })

  // Recording handler — list saved recordings
  ipcMain.handle(RECORDING_LIST, async (): Promise<RecordingListEntry[]> => {
    const { app } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    try {
      const files = await fs.readdir(recordingsDir)
      const entries: RecordingListEntry[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const content = await fs.readFile(path.join(recordingsDir, file), 'utf-8')
          const log = JSON.parse(content) as RecordingFlushRequest
          const events = log.events || []
          const duration = events.length > 0
            ? events[events.length - 1].timestamp - events[0].timestamp
            : 0
          entries.push({
            filename: file,
            startedAt: log.startedAt,
            eventCount: events.length,
            durationMs: duration,
          })
        } catch {
          // Skip malformed files
        }
      }
      return entries.sort((a, b) => b.startedAt - a.startedAt)
    } catch {
      return []
    }
  })

  // Recording handler — load a specific recording
  ipcMain.handle(RECORDING_LOAD, async (_event, request: RecordingLoadRequest): Promise<RecordingFlushRequest | null> => {
    const { app } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    try {
      const content = await fs.readFile(path.join(recordingsDir, request.filename), 'utf-8')
      return JSON.parse(content) as RecordingFlushRequest
    } catch {
      return null
    }
  })

  // App info handlers
  ipcMain.handle(APP_GET_LAUNCH_CWD, (): string => {
    return launchCwd
  })

  // AI handlers
  ipcMain.handle(
    AI_SEND,
    async (_event, request: AiSendRequest): Promise<AiSendResponse> => {
      const conversationId = await aiService.sendMessage(
        request.message,
        request.conversationId
      )
      return { conversationId }
    }
  )

  ipcMain.handle(AI_ABORT, (_event, request: AiAbortRequest): void => {
    aiService.abort(request.conversationId)
  })

  ipcMain.handle(AI_CLEAR, (_event, request: AiClearRequest): void => {
    aiService.clear(request.conversationId)
  })

  ipcMain.handle(AI_CONFIG, (_event, request?: AiConfigSetRequest): AiConfigGetResponse | void => {
    if (request && request.key) {
      aiService.setConfig(request.key, request.value)
      return
    }
    return aiService.getConfig()
  })
}
