import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PtyManager } from '../pty/PtyManager'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import type { Layout, Bookmark, Preferences, SmokeConfig } from '../config/ConfigStore'
import { terminalOutputBuffer } from '../ai/TerminalOutputBuffer'
import { AiService } from '../ai/AiService'
import { AgentManager } from '../ai/AgentManager'
import { FileWatcher } from '../watcher/FileWatcher'
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
  BOOKMARK_SAVE,
  BOOKMARK_LIST,
  BOOKMARK_DELETE,
  CONFIG_GET,
  CONFIG_SET,
  FS_READDIR,
  FS_READFILE,
  FS_READFILE_BASE64,
  FS_WRITEFILE,
  FS_WATCH,
  FS_UNWATCH,
  TERMINAL_BUFFER_READ,
  TERMINAL_BUFFER_READ_LINES,
  RECORDING_FLUSH,
  RECORDING_LIST,
  RECORDING_LOAD,
  RECORDING_EXPORT,
  RECORDING_IMPORT,
  AI_SEND,
  AI_ABORT,
  AI_CLEAR,
  AI_CONFIG,
  AGENT_CREATE,
  AGENT_REMOVE,
  AGENT_LIST,
  AGENT_ASSIGN_GROUP,
  AGENT_SET_ROLE,
  AGENT_UPDATE_SCOPE,
  CANVAS_EXPORT_PNG,
  APP_GET_LAUNCH_CWD,
  PtySpawnRequest,
  PtySpawnResponse,
  PtyDataToPty,
  PtyResizeMessage,
  PtyKillMessage,
  LayoutSaveRequest,
  LayoutLoadRequest,
  LayoutDeleteRequest,
  BookmarkSaveRequest,
  BookmarkDeleteRequest,
  ConfigSetRequest,
  FsReaddirRequest,
  FsReaddirEntry,
  FsReadfileRequest,
  FsReadfileResponse,
  FsReadfileBase64Request,
  FsReadfileBase64Response,
  FsWritefileRequest,
  FsWritefileResponse,
  FsWatchRequest,
  FsUnwatchRequest,
  TerminalBufferReadRequest,
  TerminalBufferReadLinesRequest,
  RecordingFlushRequest,
  RecordingListEntry,
  RecordingLoadRequest,
  RecordingExportRequest,
  RecordingExportResponse,
  RecordingImportResponse,
  AiSendRequest,
  AiSendResponse,
  AiAbortRequest,
  AiClearRequest,
  AiConfigSetRequest,
  AiConfigGetResponse,
  AgentCreateRequest,
  AgentCreateResponse,
  AgentRemoveRequest,
  AgentAssignGroupRequest,
  AgentSetRoleRequest,
  AgentUpdateScopeRequest,
  CanvasExportPngRequest,
  CanvasExportPngResponse,
} from './channels'
import type { AgentInfo } from '../../preload/types'

let agentManagerInstance: AgentManager | null = null

/** Get the shared AgentManager (available after registerIpcHandlers is called). */
export function getAgentManager(): AgentManager | null {
  return agentManagerInstance
}

export function registerIpcHandlers(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string
): void {
  // Instantiate the agent manager for multi-agent support
  const agentManager = new AgentManager(getMainWindow)
  agentManager.setPtyManager(ptyManager)
  agentManagerInstance = agentManager
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

    // Determine startup command: per-session > global preference > legacy autoLaunchClaude
    const startupCmd = request.startupCommand
      || preferences.startupCommand
      || (preferences.autoLaunchClaude && preferences.claudeCommand ? preferences.claudeCommand : '')

    if (startupCmd) {
      setTimeout(() => {
        pty.write(startupCmd + '\n')
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

  // Bookmark persistence handlers
  ipcMain.handle(BOOKMARK_SAVE, (_event, request: BookmarkSaveRequest): void => {
    const bookmarks = configStore.get('canvasBookmarks', {})
    bookmarks[request.name] = request.bookmark
    configStore.set('canvasBookmarks', bookmarks)
  })

  ipcMain.handle(BOOKMARK_LIST, (): Bookmark[] => {
    const bookmarks = configStore.get('canvasBookmarks', {})
    return Object.values(bookmarks)
  })

  ipcMain.handle(BOOKMARK_DELETE, (_event, request: BookmarkDeleteRequest): void => {
    const bookmarks = configStore.get('canvasBookmarks', {})
    delete bookmarks[request.name]
    configStore.set('canvasBookmarks', bookmarks)
  })

  // Config handlers
  ipcMain.handle(CONFIG_GET, (): Preferences => {
    return configStore.get('preferences', defaultPreferences)
  })

  ipcMain.handle(CONFIG_SET, (_event, request: ConfigSetRequest): void => {
    const validKeys: Array<keyof Preferences> = [
      'defaultShell', 'autoLaunchClaude', 'claudeCommand', 'startupCommand',
      'gridSize', 'sidebarPosition', 'sidebarWidth', 'sidebarSectionSizes',
      'theme', 'defaultCwd', 'aiApiKey', 'aiModel',
      'terminalOpacity', 'fontFamily', 'fontSize', 'lineHeight',
    ]
    if (!validKeys.includes(request.key as keyof Preferences)) return
    const key = `preferences.${request.key}` as keyof SmokeConfig
    configStore.set(key, request.value as never)

    // Invalidate all agents' client cache when API key changes
    if (request.key === 'aiApiKey') {
      for (const agent of agentManager.listAgents()) {
        agentManager.getAgent(agent.id)?.setConfig('aiApiKey', request.value)
      }
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

  const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  }

  ipcMain.handle(FS_READFILE_BASE64, async (_event, request: FsReadfileBase64Request): Promise<FsReadfileBase64Response> => {
    const filePath = path.resolve(request.path)
    const maxSize = request.maxSize ?? MAX_FILE_SIZE

    const stat = await fs.stat(filePath)
    if (stat.size > maxSize) {
      throw new Error(`File too large: ${stat.size} bytes (max ${maxSize})`)
    }

    const ext = path.extname(filePath).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

    const buffer = await fs.readFile(filePath)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    return { dataUrl, size: stat.size, mimeType }
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

  // File watcher handlers
  const fileWatcher = new FileWatcher(getMainWindow)

  ipcMain.handle(FS_WATCH, (_event, request: FsWatchRequest): void => {
    fileWatcher.watch(request.path)
  })

  ipcMain.handle(FS_UNWATCH, (_event, request: FsUnwatchRequest): void => {
    fileWatcher.unwatch(request.path)
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

  // Recording handler — export a recording as .smoke-replay file
  ipcMain.handle(RECORDING_EXPORT, async (_event, request: RecordingExportRequest): Promise<RecordingExportResponse> => {
    const { app, dialog } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')

    // Read the source recording
    const sourcePath = path.join(recordingsDir, request.filename)
    let log: RecordingFlushRequest
    try {
      const content = await fs.readFile(sourcePath, 'utf-8')
      log = JSON.parse(content) as RecordingFlushRequest
    } catch {
      throw new Error(`Failed to read recording: ${request.filename}`)
    }

    // Build the export payload with metadata
    const exportData = {
      format: 'smoke-replay',
      version: log.version,
      exportedAt: Date.now(),
      startedAt: log.startedAt,
      eventCount: log.events.length,
      events: log.events,
    }

    const defaultName = request.filename.replace(/\.json$/, '.smoke-replay')
    const win = getMainWindow()
    if (!win) return { filePath: null }
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Recording',
      defaultPath: defaultName,
      filters: [
        { name: 'Smoke Replay', extensions: ['smoke-replay'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { filePath: null }
    }

    await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
    return { filePath: result.filePath }
  })

  // Recording handler — import a .smoke-replay or JSON recording
  ipcMain.handle(RECORDING_IMPORT, async (): Promise<RecordingImportResponse | null> => {
    const { app, dialog } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    await fs.mkdir(recordingsDir, { recursive: true })

    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Recording',
      filters: [
        { name: 'Smoke Replay', extensions: ['smoke-replay', 'json'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const importPath = result.filePaths[0]
    let data: Record<string, unknown>
    try {
      const content = await fs.readFile(importPath, 'utf-8')
      data = JSON.parse(content) as Record<string, unknown>
    } catch {
      throw new Error(`Failed to parse recording file: ${path.basename(importPath)}`)
    }

    // Normalize: accept both smoke-replay format and raw EventLog format
    const events: Array<{ timestamp: number; type: string; payload: unknown }> = data.events || []
    const startedAt: number = data.startedAt || (events.length > 0 ? events[0].timestamp : Date.now())
    const version: number = data.version || 1

    // Generate a unique filename for the imported recording
    const filename = `recording-imported-${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}-${Date.now().toString(36)}.json`
    const destPath = path.join(recordingsDir, filename)

    const normalized: RecordingFlushRequest = { version, startedAt, events }
    await fs.writeFile(destPath, JSON.stringify(normalized, null, 2), 'utf-8')

    const durationMs = events.length > 0
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0

    return {
      filename,
      startedAt,
      eventCount: events.length,
      durationMs,
    }
  })

  // Canvas export handler — capture canvas area as PNG
  ipcMain.handle(CANVAS_EXPORT_PNG, async (_event, request: CanvasExportPngRequest): Promise<CanvasExportPngResponse> => {
    const { dialog } = await import('electron')
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

  // Agent management handlers
  ipcMain.handle(
    AGENT_CREATE,
    (_event, request: AgentCreateRequest): AgentCreateResponse => {
      const agentId = agentManager.createAgent(request.name)
      const color = agentManager.getAgentColor(agentId)
      return { agentId, color }
    }
  )

  ipcMain.handle(AGENT_REMOVE, (_event, request: AgentRemoveRequest): void => {
    agentManager.removeAgent(request.agentId)
  })

  ipcMain.handle(AGENT_LIST, (): AgentInfo[] => {
    return agentManager.listAgents()
  })

  ipcMain.handle(AGENT_ASSIGN_GROUP, (_event, request: AgentAssignGroupRequest): void => {
    agentManager.assignGroup(request.agentId, request.groupId, request.memberSessionIds)
  })

  ipcMain.handle(AGENT_SET_ROLE, (_event, request: AgentSetRoleRequest): void => {
    agentManager.setAgentRole(request.agentId, request.role)
  })

  ipcMain.handle(AGENT_UPDATE_SCOPE, (_event, request: AgentUpdateScopeRequest): void => {
    agentManager.updateScope(request.agentId, request.sessionIds)
  })

  // AI handlers — route to the correct agent via agentId
  ipcMain.handle(
    AI_SEND,
    async (_event, request: AiSendRequest): Promise<AiSendResponse> => {
      const agent = agentManager.getAgent(request.agentId)
      if (!agent) {
        return { conversationId: '', error: `Agent ${request.agentId} not found` }
      }
      try {
        const conversationId = await agent.sendMessage(
          request.message,
          request.conversationId
        )
        return { conversationId }
      } catch (err: unknown) {
        return { conversationId: request.conversationId ?? '', error: err instanceof Error ? err.message : 'AI request failed' }
      }
    }
  )

  ipcMain.handle(AI_ABORT, (_event, request: AiAbortRequest): void => {
    const agent = agentManager.getAgent(request.agentId)
    agent?.abort(request.conversationId)
  })

  ipcMain.handle(AI_CLEAR, (_event, request: AiClearRequest): void => {
    const agent = agentManager.getAgent(request.agentId)
    agent?.clear(request.conversationId)
  })

  ipcMain.handle(AI_CONFIG, (_event, request?: AiConfigSetRequest): AiConfigGetResponse | void => {
    if (request && request.key) {
      // Apply config to all agents
      for (const info of agentManager.listAgents()) {
        agentManager.getAgent(info.id)?.setConfig(request.key, request.value)
      }
      return
    }
    // Config is global — use any agent or create a temp service to read it
    const agents = agentManager.listAgents()
    if (agents.length > 0) {
      return agentManager.getAgent(agents[0].id)!.getConfig()
    }
    // No agents yet — read config directly
    const tempService = new AiService(() => null)
    return tempService.getConfig()
  })
}
