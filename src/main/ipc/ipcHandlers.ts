import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
import { PtyManager } from '../pty/PtyManager'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import type { Layout, Bookmark, Preferences, SmokeConfig } from '../config/ConfigStore'
import { terminalOutputBuffer } from '../ai/TerminalOutputBuffer'
import { AgentManager } from '../ai/AgentManager'
import { FileWatcher } from '../watcher/FileWatcher'
import { assertWithinHome } from './pathBoundary'
import { FilenameIndex } from '../index/FilenameIndex'
import { buildCodeGraph, expandCodeGraph, buildDependentsGraph, getDependents, ensureIndex, getIndexStats, invalidateIndex, parseImports, detectLanguage, resolveImport, loadPathAliases, computeLayout, computeIncrementalLayout, scoreRelevance, computeWorkspaceLayout, parseTask, collectContext } from '../codegraph'
import { SearchIndex } from '../codegraph/SearchIndex'
import { StructureAnalyzer } from '../codegraph/StructureAnalyzer'
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
  AGENT_CREATE,
  AGENT_REMOVE,
  AGENT_LIST,
  AGENT_ASSIGN_GROUP,
  AGENT_SET_ROLE,
  AGENT_UPDATE_SCOPE,
  PROJECT_INDEX_BUILD,
  PROJECT_INDEX_LOOKUP,
  PROJECT_INDEX_STATS,
  CANVAS_EXPORT_PNG,
  TAB_GET_STATE,
  TAB_SAVE_STATE,
  APP_GET_LAUNCH_CWD,
  APP_GET_GIT_BRANCH,
  WINDOW_MINIMIZE,
  WINDOW_MAXIMIZE,
  WINDOW_CLOSE,
  WINDOW_IS_MAXIMIZED,
  SEARCH_BUILD,
  SEARCH_QUERY,
  SEARCH_STATS,
  STRUCTURE_ANALYZE,
  STRUCTURE_GET,
  STRUCTURE_GET_MODULE,
  CODEGRAPH_BUILD,
  CODEGRAPH_EXPAND,
  CODEGRAPH_GET_IMPORTS,
  CODEGRAPH_RESOLVE_IMPORT,
  CODEGRAPH_INDEX_STATS,
  CODEGRAPH_INVALIDATE,
  CODEGRAPH_GET_DEPENDENTS,
  CODEGRAPH_BUILD_DEPENDENTS,
  TASK_PARSE,
  RELEVANCE_SCORE,
  CODEGRAPH_PLAN_WORKSPACE,
  CONTEXT_COLLECT,
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
  AgentCreateRequest,
  AgentCreateResponse,
  AgentRemoveRequest,
  AgentAssignGroupRequest,
  AgentSetRoleRequest,
  AgentUpdateScopeRequest,
  ProjectIndexBuildRequest,
  ProjectIndexBuildResponse,
  ProjectIndexLookupRequest,
  ProjectIndexLookupResponse,
  ProjectIndexStatsResponse,
  CanvasExportPngRequest,
  CanvasExportPngResponse,
  SearchBuildRequest,
  SearchBuildResponse,
  SearchQueryRequest,
  SearchQueryResponse,
  SearchStatsResponse,
  StructureAnalyzeRequest,
  StructureAnalyzeResponse,
  StructureGetModuleRequest,
  StructureModuleInfo,
  CodeGraphBuildRequest,
  CodeGraphBuildResponse,
  CodeGraphExpandRequest,
  CodeGraphGetImportsRequest,
  CodeGraphGetImportsResponse,
  CodeGraphResolveImportRequest,
  CodeGraphResolveImportResponse,
  CodeGraphIndexStats,
  CodeGraphGetDependentsRequest,
  CodeGraphGetDependentsResponse,
  CodeGraphBuildDependentsRequest,
  TabStateData,
  TaskParseRequest,
  TaskParseResponse,
  RelevanceScoringRequest,
  RelevanceScoringResponse,
  ContextCollectRequest,
  ContextCollectResponse,
  SHELL_LIST,
  ShellInfo,
  PLUGIN_LIST,
  PLUGIN_GET,
  PLUGIN_RELOAD,
  PLUGIN_CHANGED,
  PLUGIN_INSTALL,
  PLUGIN_UNINSTALL,
  PLUGIN_CONFIG_GET,
  PLUGIN_CONFIG_SET,
  PLUGIN_SET_ENABLED,
  PLUGIN_GET_DISABLED,
  PluginGetRequest,
  PluginInfo,
  PluginListResponse,
  PluginReloadResponse,
  PluginInstallRequest,
  PluginInstallResponse,
  PluginUninstallRequest,
  PluginUninstallResponse,
  PluginConfigGetRequest,
  PluginConfigSetRequest,
  PluginSetEnabledRequest,
} from './channels'
import type { AgentInfo } from '../../preload/types'
import { PluginLoader, type LoadedPlugin } from '../plugin/PluginLoader'
import { PluginInstaller } from '../plugin/PluginInstaller'
import { registerPluginIpcHandlers } from '../plugin/pluginIpcHandlers'
import { memoizeAsyncWithTTL } from '../utils/memoizeWithTTL'

let agentManagerInstance: AgentManager | null = null

/** Get the shared AgentManager (available after registerIpcHandlers is called). */
export function getAgentManager(): AgentManager | null {
  return agentManagerInstance
}

export interface IpcCleanup {
  dispose: () => void
}

export async function registerIpcHandlers(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string
): Promise<IpcCleanup> {
  // Instantiate the agent manager for multi-agent support
  const agentManager = new AgentManager(getMainWindow)
  await agentManager.setPtyManager(ptyManager)
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
      try {
        terminalOutputBuffer.append(pty.id, data)
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(PTY_DATA_FROM_PTY, { id: pty.id, data })
        }
      } catch (err) {
        console.error(`[pty:data] Error forwarding data for ${pty.id}:`, err)
      }
    })

    pty.on('exit', (exitCode: number, signal?: number) => {
      try {
        terminalOutputBuffer.delete(pty.id)
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(PTY_EXIT, { id: pty.id, exitCode, signal })
        }
      } catch (err) {
        console.error(`[pty:exit] Error handling exit for ${pty.id}:`, err)
      }
    })

    // Determine startup command: per-session > global preference > legacy autoLaunchClaude
    const startupCmd = request.startupCommand
      || preferences.startupCommand
      || (preferences.autoLaunchClaude && preferences.claudeCommand ? preferences.claudeCommand : '')

    if (startupCmd) {
      // Wait for the shell to emit its first output (prompt/motd) before sending
      // the startup command. This is more reliable than a fixed delay because
      // different shells take varying amounts of time to initialize.
      let sent = false
      const sendStartupCommand = (): void => {
        if (sent) return
        sent = true
        setTimeout(() => {
          pty.write(startupCmd + '\n')
        }, 50)
      }

      pty.once('data', sendStartupCommand)

      // Safety fallback: if the shell never emits data within 3s, send anyway
      setTimeout(() => {
        if (!sent) {
          pty.removeListener('data', sendStartupCommand)
          sendStartupCommand()
        }
      }, 3000)
    }

    return { id: pty.id, pid: pty.pid }
  })

  ipcMain.on(PTY_DATA_TO_PTY, (_event, message: PtyDataToPty) => {
    try {
      ptyManager.write(message.id, message.data)
    } catch (err) {
      console.error('[pty:data:to-pty] Error writing to PTY:', err)
    }
  })

  ipcMain.on(PTY_RESIZE, (_event, message: PtyResizeMessage) => {
    try {
      ptyManager.resize(message.id, message.cols, message.rows)
    } catch (err) {
      console.error('[pty:resize] Error resizing PTY:', err)
    }
  })

  ipcMain.on(PTY_KILL, (_event, message: PtyKillMessage) => {
    try {
      ptyManager.kill(message.id)
    } catch (err) {
      console.error('[pty:kill] Error killing PTY:', err)
    }
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
      'theme', 'defaultCwd',
      'terminalOpacity', 'fontFamily', 'fontSize', 'lineHeight',
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
    const CONCURRENCY = 16

    const mapEntry = async (entry: import('fs').Dirent): Promise<FsReaddirEntry> => {
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

      return { name: entry.name, type, size }
    }

    // Process entries with bounded concurrency
    const results: FsReaddirEntry[] = new Array(entries.length)
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(batch.map(mapEntry))
      for (let j = 0; j < batchResults.length; j++) {
        results[i + j] = batchResults[j]
      }
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
    await assertWithinHome(filePath, homedir)

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

  // Project filename index handlers
  const filenameIndex = new FilenameIndex(getMainWindow)

  ipcMain.handle(PROJECT_INDEX_BUILD, async (_event, request: ProjectIndexBuildRequest): Promise<ProjectIndexBuildResponse> => {
    return filenameIndex.build(request.rootPath)
  })

  ipcMain.handle(PROJECT_INDEX_LOOKUP, (_event, request: ProjectIndexLookupRequest): ProjectIndexLookupResponse => {
    return { paths: filenameIndex.lookup(request.basename) }
  })

  ipcMain.handle(PROJECT_INDEX_STATS, (): ProjectIndexStatsResponse => {
    return filenameIndex.getStats()
  })

  // Full-text search index handlers
  const searchIndex = new SearchIndex(getMainWindow)

  ipcMain.handle(SEARCH_BUILD, async (_event, request: SearchBuildRequest): Promise<SearchBuildResponse> => {
    return searchIndex.build(request.rootPath)
  })

  ipcMain.handle(SEARCH_QUERY, (_event, request: SearchQueryRequest): SearchQueryResponse => {
    return searchIndex.search(request.query, request.maxResults)
  })

  ipcMain.handle(SEARCH_STATS, (): SearchStatsResponse => {
    return searchIndex.getStats()
  })

  // Structure analyzer handlers
  const structureAnalyzer = new StructureAnalyzer()

  // Wire codegraph deps to the agent manager so assemble_workspace is available
  agentManager.setCodegraphDeps({ searchIndex, structureAnalyzer })

  // Wire plugin deps to the agent manager so plugin-aware tools are available
  agentManager.setPluginDeps({
    getPlugins: () => pluginLoader.getPlugins(),
    getPlugin: (name: string) => pluginLoader.getPlugin(name),
  })

  ipcMain.handle(STRUCTURE_ANALYZE, async (_event, request: StructureAnalyzeRequest): Promise<StructureAnalyzeResponse> => {
    return structureAnalyzer.analyze(request.rootPath)
  })

  ipcMain.handle(STRUCTURE_GET, (): StructureAnalyzeResponse | null => {
    return structureAnalyzer.getCached()
  })

  ipcMain.handle(STRUCTURE_GET_MODULE, (_event, request: StructureGetModuleRequest): StructureModuleInfo | null => {
    return structureAnalyzer.getModule(request.moduleId)
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

  // Tab state handlers
  ipcMain.handle(TAB_GET_STATE, (): TabStateData => {
    const tabs = configStore.get('tabs', [{ id: 'default', name: 'Canvas 1' }])
    const activeTabId = configStore.get('activeTabId', 'default')
    return { tabs, activeTabId }
  })

  ipcMain.handle(TAB_SAVE_STATE, (_event, state: TabStateData): void => {
    configStore.set('tabs', state.tabs)
    configStore.set('activeTabId', state.activeTabId)
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
      } catch {
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


  // Code graph handlers
  ipcMain.handle(
    CODEGRAPH_BUILD,
    async (_event, request: CodeGraphBuildRequest): Promise<CodeGraphBuildResponse> => {
      const result = await buildCodeGraph(request)
      const layout = computeLayout(result.graph, result.rootPath)
      return { ...result, layout }
    }
  )

  ipcMain.handle(
    CODEGRAPH_EXPAND,
    async (_event, request: CodeGraphExpandRequest): Promise<CodeGraphBuildResponse> => {
      const result = await expandCodeGraph(
        request.existingGraph,
        request.expandPath,
        request.projectRoot,
        request.maxDepth
      )
      const layout = computeIncrementalLayout(
        result.graph,
        request.existingPositions
      )
      return { ...result, layout }
    }
  )

  ipcMain.handle(
    CODEGRAPH_GET_IMPORTS,
    async (_event, request: CodeGraphGetImportsRequest): Promise<CodeGraphGetImportsResponse> => {
      const filePath = path.resolve(request.filePath)
      const language = detectLanguage(filePath)
      if (language === 'text') return { imports: [] }

      const content = await fs.readFile(filePath, 'utf-8')
      const imports = parseImports(content, language)
      return { imports }
    }
  )

  ipcMain.handle(
    CODEGRAPH_RESOLVE_IMPORT,
    async (_event, request: CodeGraphResolveImportRequest): Promise<CodeGraphResolveImportResponse> => {
      const importerPath = path.resolve(request.importerPath)
      const language = detectLanguage(importerPath)
      if (language === 'text') return { resolvedPath: null }

      const index = await ensureIndex(request.projectRoot)
      const aliases = await loadPathAliases(request.projectRoot)
      const result = resolveImport(
        { specifier: request.specifier, type: 'import' },
        importerPath,
        language,
        index,
        aliases
      )
      return { resolvedPath: result.resolvedPath }
    }
  )

  ipcMain.handle(CODEGRAPH_INDEX_STATS, (): CodeGraphIndexStats | null => {
    return getIndexStats()
  })

  ipcMain.handle(CODEGRAPH_INVALIDATE, (): void => {
    invalidateIndex()
  })

  ipcMain.handle(
    CODEGRAPH_GET_DEPENDENTS,
    async (_event, request: CodeGraphGetDependentsRequest): Promise<CodeGraphGetDependentsResponse> => {
      const dependents = await getDependents(request.filePath, request.projectRoot)
      return { dependents }
    }
  )

  ipcMain.handle(
    CODEGRAPH_BUILD_DEPENDENTS,
    async (_event, request: CodeGraphBuildDependentsRequest): Promise<CodeGraphBuildResponse> => {
      const result = await buildDependentsGraph(request)
      const layout = computeLayout(result.graph, result.rootPath)
      return { ...result, layout }
    }
  )

  // Task parsing handler
  ipcMain.handle(
    TASK_PARSE,
    async (_event, request: TaskParseRequest): Promise<TaskParseResponse> => {
      return parseTask(request)
    }
  )

  // Relevance scoring handler
  ipcMain.handle(
    RELEVANCE_SCORE,
    async (_event, request: RelevanceScoringRequest): Promise<RelevanceScoringResponse> => {
      return scoreRelevance(request)
    }
  )

  ipcMain.handle(
    CODEGRAPH_PLAN_WORKSPACE,
    (_event, request: { files: Array<{ filePath: string; relevance: number; imports: string[]; importedBy: string[] }> }) => {
      return computeWorkspaceLayout(request.files)
    }
  )

  // Context collector handler
  ipcMain.handle(
    CONTEXT_COLLECT,
    async (_event, request: ContextCollectRequest): Promise<ContextCollectResponse> => {
      return collectContext(request, searchIndex, structureAnalyzer)
    }
  )

  // Plugin IPC bridge handlers
  registerPluginIpcHandlers(getMainWindow)

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
          { path: 'bash.exe', name: 'Bash (WSL)' },
          { path: 'wsl.exe', name: 'WSL' },
        ]
        const checks = candidates.map(async (c) => {
          try {
            await execFileAsync('where', [c.path], { timeout: 2000 })
            return c
          } catch {
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
            } catch {
              // not executable or doesn't exist
            }
          }
        } catch {
          // /etc/shells not readable — fall back to common paths
          const fallbacks = ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/bin/fish']
          for (const p of fallbacks) {
            try {
              await fs.access(p, fs.constants.X_OK)
              shells.push({ path: p, name: path.basename(p) })
            } catch {
              // not available
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

  // ── Plugin loader ──────────────────────────────────────────────────────

  const pluginLoader = new PluginLoader(launchCwd)
  const initialLoad = await pluginLoader.loadAll()

  // Log plugin load errors as warnings
  for (const err of initialLoad.errors) {
    console.warn(`[plugin] Skipped ${err.pluginDir}: ${err.error}`)
  }
  if (initialLoad.plugins.length > 0) {
    console.log(`[plugin] Loaded ${initialLoad.plugins.length} plugin(s): ${initialLoad.plugins.map((p) => p.manifest.name).join(', ')}`)
  }

  // Dev mode: watch for changes and push updates to renderer
  if (process.env.NODE_ENV !== 'production') {
    pluginLoader.startWatching((result) => {
      for (const err of result.errors) {
        console.warn(`[plugin] Skipped ${err.pluginDir}: ${err.error}`)
      }
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PLUGIN_CHANGED, {
          plugins: result.plugins.map(toPluginInfo),
          errors: result.errors,
        })
      }
    })
  }

  ipcMain.handle(PLUGIN_LIST, (): PluginListResponse => {
    return { plugins: pluginLoader.getPlugins().map(toPluginInfo) }
  })

  ipcMain.handle(PLUGIN_GET, (_event, request: PluginGetRequest): PluginInfo | null => {
    const plugin = pluginLoader.getPlugin(request.name)
    return plugin ? toPluginInfo(plugin) : null
  })

  // Plugin reload: 2s TTL with in-flight dedup to coalesce rapid successive calls
  const pluginReloadCache = memoizeAsyncWithTTL(
    () => pluginLoader.loadAll(),
    { ttlMs: 2_000 }
  )

  ipcMain.handle(PLUGIN_RELOAD, async (): Promise<PluginReloadResponse> => {
    const result = await pluginReloadCache.get()
    return {
      plugins: result.plugins.map(toPluginInfo),
      errors: result.errors,
    }
  })

  // ── Plugin install/uninstall ─────────────────────────────────────────────

  const pluginInstaller = new PluginInstaller()

  ipcMain.handle(
    PLUGIN_INSTALL,
    async (_event, request: PluginInstallRequest): Promise<PluginInstallResponse> => {
      const { source } = request

      // Determine if this is a URL or an npm package name
      let result
      if (source.startsWith('http://') || source.startsWith('https://')) {
        result = await pluginInstaller.installFromUrl(source)
      } else {
        result = await pluginInstaller.installFromNpm(source)
      }

      if (result.success) {
        // Reload plugins so the new one is discovered
        pluginReloadCache.invalidate()
        const loadResult = await pluginReloadCache.get()
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(PLUGIN_CHANGED, {
            plugins: loadResult.plugins.map(toPluginInfo),
            errors: loadResult.errors,
          })
        }
      }

      return result
    }
  )

  ipcMain.handle(
    PLUGIN_UNINSTALL,
    async (_event, request: PluginUninstallRequest): Promise<PluginUninstallResponse> => {
      const result = await pluginInstaller.uninstall(request.name, request.force)

      if (result.success) {
        // Reload plugins so the removed one is dropped
        pluginReloadCache.invalidate()
        const loadResult = await pluginReloadCache.get()
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(PLUGIN_CHANGED, {
            plugins: loadResult.plugins.map(toPluginInfo),
            errors: loadResult.errors,
          })
        }
      }

      return result
    }
  )

  // ── Plugin config ────────────────────────────────────────────────────

  ipcMain.handle(PLUGIN_CONFIG_GET, (_event, request: PluginConfigGetRequest): Record<string, unknown> => {
    const allSettings = configStore.get('pluginSettings', {})
    return allSettings[request.pluginName] ?? {}
  })

  ipcMain.handle(PLUGIN_CONFIG_SET, (_event, request: PluginConfigSetRequest): void => {
    const allSettings = configStore.get('pluginSettings', {})
    if (!allSettings[request.pluginName]) {
      allSettings[request.pluginName] = {}
    }
    allSettings[request.pluginName][request.key] = request.value
    configStore.set('pluginSettings', allSettings)
  })

  ipcMain.handle(PLUGIN_SET_ENABLED, (_event, request: PluginSetEnabledRequest): void => {
    const disabled = configStore.get('disabledPlugins', [])
    if (request.enabled) {
      configStore.set('disabledPlugins', disabled.filter((n: string) => n !== request.pluginName))
    } else {
      if (!disabled.includes(request.pluginName)) {
        configStore.set('disabledPlugins', [...disabled, request.pluginName])
      }
    }
  })

  ipcMain.handle(PLUGIN_GET_DISABLED, (): string[] => {
    return configStore.get('disabledPlugins', [])
  })

  return {
    dispose(): void {
      fileWatcher.dispose()
    },
  }
}

function toPluginInfo(p: LoadedPlugin): PluginInfo {
  return {
    name: p.manifest.name,
    version: p.manifest.version,
    description: p.manifest.description,
    author: p.manifest.author,
    icon: p.manifest.icon,
    defaultSize: p.manifest.defaultSize,
    entryPointPath: p.entryPointPath,
    permissions: p.manifest.permissions,
    pluginDir: p.pluginDir,
    source: p.source,
    installSource: p.installSource,
    configSchema: p.manifest.configSchema,
  }
}
