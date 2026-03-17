// IPC channel constants for PTY communication

export const PTY_SPAWN = 'pty:spawn' as const
export const PTY_DATA_TO_PTY = 'pty:data:to-pty' as const
export const PTY_DATA_FROM_PTY = 'pty:data:from-pty' as const
export const PTY_DATA_ACK = 'pty:data:ack' as const
export const PTY_RESIZE = 'pty:resize' as const
export const PTY_KILL = 'pty:kill' as const
export const PTY_EXIT = 'pty:exit' as const

// Layout persistence channels
export const LAYOUT_SAVE = 'layout:save' as const
export const LAYOUT_LOAD = 'layout:load' as const
export const LAYOUT_LIST = 'layout:list' as const
export const LAYOUT_DELETE = 'layout:delete' as const

// Bookmark channels
export const BOOKMARK_SAVE = 'bookmark:save' as const
export const BOOKMARK_LIST = 'bookmark:list' as const
export const BOOKMARK_DELETE = 'bookmark:delete' as const

// Config channels
export const CONFIG_GET = 'config:get' as const
export const CONFIG_SET = 'config:set' as const

// File system channels
export const FS_READDIR = 'fs:readdir' as const
export const FS_READFILE = 'fs:readfile' as const
export const FS_READFILE_BASE64 = 'fs:readfile-base64' as const
export const FS_WRITEFILE = 'fs:writefile' as const
export const FS_WATCH = 'fs:watch' as const
export const FS_UNWATCH = 'fs:unwatch' as const
export const FS_FILE_CHANGED = 'fs:file-changed' as const

// Terminal output buffer channels (AI orchestrator)
export const TERMINAL_BUFFER_READ = 'terminal-buffer:read' as const
export const TERMINAL_BUFFER_READ_LINES = 'terminal-buffer:read-lines' as const

// AI channels
export const AI_SEND = 'ai:send' as const
export const AI_ABORT = 'ai:abort' as const
export const AI_CLEAR = 'ai:clear' as const
export const AI_STREAM = 'ai:stream' as const
export const AI_CANVAS_ACTION = 'ai:canvas-action' as const
export const AI_DIAGNOSTICS = 'ai:diagnostics' as const

// Recording channels
export const RECORDING_FLUSH = 'recording:flush' as const
export const RECORDING_LIST = 'recording:list' as const
export const RECORDING_LOAD = 'recording:load' as const
export const RECORDING_EXPORT = 'recording:export' as const
export const RECORDING_IMPORT = 'recording:import' as const

// Agent management channels
export const AGENT_CREATE = 'agent:create' as const
export const AGENT_REMOVE = 'agent:remove' as const
export const AGENT_LIST = 'agent:list' as const
export const AGENT_ASSIGN_GROUP = 'agent:assign-group' as const
export const AGENT_SET_ROLE = 'agent:set-role' as const
export const AGENT_SET_MODEL = 'agent:set-model' as const
export const AGENT_UPDATE_SCOPE = 'agent:update-scope' as const

// Canvas export channels
export const CANVAS_EXPORT_PNG = 'canvas:export-png' as const

// Project index channels
export const PROJECT_INDEX_BUILD = 'project:index-build' as const
export const PROJECT_INDEX_LOOKUP = 'project:index-lookup' as const
export const PROJECT_INDEX_STATS = 'project:index-stats' as const
export const PROJECT_INDEX_UPDATED = 'project:index-updated' as const

// Tab channels
export const TAB_GET_STATE = 'tab:get-state' as const
export const TAB_SAVE_STATE = 'tab:save-state' as const

// App channels
export const APP_GET_LAUNCH_CWD = 'app:get-launch-cwd' as const
export const APP_GET_GIT_BRANCH = 'app:get-git-branch' as const

// Workspace channels
export const WORKSPACE_OPEN_DIALOG = 'workspace:open-dialog' as const
export const WORKSPACE_SET_TITLE = 'workspace:set-title' as const
export const WORKSPACE_GET_RECENT = 'workspace:get-recent' as const
export const WORKSPACE_ADD_RECENT = 'workspace:add-recent' as const
export const WORKSPACE_OPENED = 'workspace:opened' as const

// Window control channels
export const WINDOW_MINIMIZE = 'window:minimize' as const
export const WINDOW_MAXIMIZE = 'window:maximize' as const
export const WINDOW_CLOSE = 'window:close' as const
export const WINDOW_IS_MAXIMIZED = 'window:is-maximized' as const

// Full-text search channels
export const SEARCH_BUILD = 'search:build' as const
export const SEARCH_QUERY = 'search:query' as const
export const SEARCH_STATS = 'search:stats' as const
export const SEARCH_INDEX_PROGRESS = 'search:index-progress' as const

// Structure analyzer channels
export const STRUCTURE_ANALYZE = 'structure:analyze' as const
export const STRUCTURE_GET = 'structure:get' as const
export const STRUCTURE_GET_MODULE = 'structure:get-module' as const

// Code graph channels
export const CODEGRAPH_BUILD = 'codegraph:build' as const
export const CODEGRAPH_EXPAND = 'codegraph:expand' as const
export const CODEGRAPH_GET_IMPORTS = 'codegraph:get-imports' as const
export const CODEGRAPH_RESOLVE_IMPORT = 'codegraph:resolve-import' as const
export const CODEGRAPH_INDEX_STATS = 'codegraph:index-stats' as const
export const CODEGRAPH_INVALIDATE = 'codegraph:invalidate' as const
export const CODEGRAPH_PLAN_WORKSPACE = 'codegraph:plan-workspace' as const
export const CODEGRAPH_GET_DEPENDENTS = 'codegraph:get-dependents' as const
export const CODEGRAPH_BUILD_DEPENDENTS = 'codegraph:build-dependents' as const

// Task parsing channels
export const TASK_PARSE = 'task:parse' as const

// Relevance scoring channels
export const RELEVANCE_SCORE = 'relevance:score' as const

// Context collector channels
export const CONTEXT_COLLECT = 'context:collect' as const

// Shell detection channels
export const SHELL_LIST = 'shell:list' as const

// Plugin loader channels
export const PLUGIN_LIST = 'plugin:list' as const
export const PLUGIN_GET = 'plugin:get' as const
export const PLUGIN_RELOAD = 'plugin:reload' as const
export const PLUGIN_CHANGED = 'plugin:changed' as const

// Plugin install/uninstall channels
export const PLUGIN_INSTALL = 'plugin:install' as const
export const PLUGIN_UNINSTALL = 'plugin:uninstall' as const

// Plugin config channels
export const PLUGIN_CONFIG_GET = 'plugin:config:get' as const
export const PLUGIN_CONFIG_SET = 'plugin:config:set' as const
export const PLUGIN_SET_ENABLED = 'plugin:set-enabled' as const
export const PLUGIN_GET_DISABLED = 'plugin:get-disabled' as const

// Plugin IPC bridge channels
export const PLUGIN_REGISTER = 'plugin:register' as const
export const PLUGIN_UNREGISTER = 'plugin:unregister' as const
export const PLUGIN_FS_READ_FILE = 'plugin:fs:read-file' as const
export const PLUGIN_FS_WRITE_FILE = 'plugin:fs:write-file' as const
export const PLUGIN_FS_READ_DIR = 'plugin:fs:read-dir' as const
export const PLUGIN_EXECUTE_COMMAND = 'plugin:execute-command' as const
export const PLUGIN_GET_STATE = 'plugin:get-state' as const
export const PLUGIN_SET_STATE = 'plugin:set-state' as const
export const PLUGIN_REQUEST_PERMISSION = 'plugin:request-permission' as const

// Message types

export interface PtySpawnRequest {
  id: string
  cwd: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cols?: number
  rows?: number
  startupCommand?: string
}

export interface PtySpawnResponse {
  id: string
  pid: number
}

export interface PtyDataToRenderer {
  id: string
  data: string
}

export interface PtyDataToPty {
  id: string
  data: string
}

export interface PtyResizeMessage {
  id: string
  cols: number
  rows: number
}

export interface PtyKillMessage {
  id: string
}

export interface PtyExitMessage {
  id: string
  exitCode: number
  signal?: number
  userInitiated?: boolean
}

// Layout message types
export interface LayoutSaveRequest {
  name: string
  layout: import('../config/ConfigStore').Layout
}

export interface LayoutLoadRequest {
  name: string
}

export interface LayoutDeleteRequest {
  name: string
}

// Bookmark message types
export interface BookmarkSaveRequest {
  name: string
  bookmark: import('../config/ConfigStore').Bookmark
}

export interface BookmarkDeleteRequest {
  name: string
}

// Config message types
export interface ConfigSetRequest {
  key: string
  value: unknown
}

// File system message types
export interface FsReaddirRequest {
  path: string
}

export interface FsReaddirEntry {
  name: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
}

export interface FsReadfileRequest {
  path: string
  maxSize?: number
}

export interface FsReadfileResponse {
  content: string
  size: number
}

export interface FsReadfileBase64Request {
  path: string
  maxSize?: number
}

export interface FsReadfileBase64Response {
  dataUrl: string
  size: number
  mimeType: string
}

export interface FsWritefileRequest {
  path: string
  content: string
}

export interface FsWritefileResponse {
  size: number
}

export interface FsWatchRequest {
  path: string
}

export interface FsUnwatchRequest {
  path: string
}

export interface FsFileChangedEvent {
  path: string
}

// Terminal output buffer message types
export interface TerminalBufferReadRequest {
  sessionId: string
}

export interface TerminalBufferReadLinesRequest {
  sessionId: string
  lineCount: number
}

// AI message types

export interface AiSendRequest {
  agentId: string
  message: string
  conversationId?: string
}

export interface AiSendResponse {
  conversationId: string
  error?: string
}

export interface AiAbortRequest {
  agentId: string
  conversationId?: string
}

export interface AiClearRequest {
  agentId: string
  conversationId?: string
}

// Agent management message types

export interface AgentCreateRequest {
  name: string
}

export interface AgentCreateResponse {
  agentId: string
  color: string
}

export interface AgentRemoveRequest {
  agentId: string
}

export interface AgentAssignGroupRequest {
  agentId: string
  groupId: string | null
  memberSessionIds?: string[]
}

export interface AgentSetRoleRequest {
  agentId: string
  role: string | null
}

export interface AgentSetModelRequest {
  agentId: string
  model: string | null
}

export interface AgentUpdateScopeRequest {
  agentId: string
  sessionIds: string[]
}

export interface AgentInfo {
  id: string
  name: string
  groupId: string | null
  role: string | null
  model: string | null
  color: string
}


// Recording message types
export interface RecordingFlushRequest {
  version: number
  startedAt: number
  events: Array<{ timestamp: number; type: string; payload: unknown }>
}

export interface RecordingListEntry {
  filename: string
  startedAt: number
  eventCount: number
  durationMs: number
}

export interface RecordingLoadRequest {
  filename: string
}

export interface RecordingExportRequest {
  filename: string
}

export interface RecordingExportResponse {
  filePath: string | null
}

export interface RecordingImportResponse {
  filename: string
  startedAt: number
  eventCount: number
  durationMs: number
}

// Project index message types
export interface ProjectIndexBuildRequest {
  rootPath: string
}

export interface ProjectIndexBuildResponse {
  fileCount: number
  basenameCount: number
}

export interface ProjectIndexLookupRequest {
  basename: string
}

export interface ProjectIndexLookupResponse {
  paths: string[]
}

export interface ProjectIndexStatsResponse {
  fileCount: number
  basenameCount: number
  rootPath: string | null
}

export interface ProjectIndexUpdatedEvent {
  fileCount: number
  basenameCount: number
}

// Canvas export message types
export interface CanvasExportPngRequest {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasExportPngResponse {
  filePath: string | null
}

// Code graph message types
export interface CodeGraphBuildRequest {
  filePath: string
  projectRoot: string
  maxDepth?: number
}

export interface CodeGraphBuildResponse {
  graph: {
    nodes: Array<{
      filePath: string
      imports: string[]
      importedBy: string[]
      moduleGroup?: string
      depth: number
    }>
    edges: Array<{
      from: string
      to: string
      type: 'import' | 'require' | 'use'
    }>
  }
  rootPath: string
  fileCount: number
  edgeCount: number
  layout: {
    positions: Array<{
      filePath: string
      x: number
      y: number
      depth: number
    }>
    bounds: {
      minX: number
      minY: number
      maxX: number
      maxY: number
    }
  }
}

export interface CodeGraphExpandRequest {
  existingGraph: CodeGraphBuildResponse['graph']
  existingPositions: CodeGraphBuildResponse['layout']['positions']
  expandPath: string
  projectRoot: string
  maxDepth?: number
}

export interface CodeGraphGetImportsRequest {
  filePath: string
}

export interface CodeGraphGetImportsResponse {
  imports: Array<{
    specifier: string
    type: 'import' | 'require' | 'use'
  }>
}

export interface CodeGraphResolveImportRequest {
  specifier: string
  importerPath: string
  projectRoot: string
}

export interface CodeGraphResolveImportResponse {
  resolvedPath: string | null
}

export interface CodeGraphIndexStats {
  root: string
  fileCount: number
}

export interface CodeGraphGetDependentsRequest {
  filePath: string
  projectRoot: string
}

export interface CodeGraphGetDependentsResponse {
  dependents: string[]
}

export interface CodeGraphBuildDependentsRequest {
  filePath: string
  projectRoot: string
}

// Tab message types
export interface TabStateData {
  tabs: Array<{ id: string; name: string }>
  activeTabId: string
}

// Task parsing message types
export interface TaskParseRequest {
  taskDescription: string
  useAi?: boolean
}

export type TaskIntent = 'fix' | 'add' | 'refactor' | 'investigate' | 'test' | 'document' | 'configure' | 'style'
export type FileCategory = 'source' | 'test' | 'config' | 'style' | 'docs' | 'types'

export interface TaskParseResponse {
  intent: TaskIntent
  keywords: string[]
  filePatterns: string[]
  includeFileTypes: FileCategory[]
  usedAi: boolean
}

// Relevance scoring message types
export interface RelevanceScoringRequest {
  taskDescription: string
  candidateFiles: string[]
  projectRoot: string
  seedFiles?: string[]
  limit?: number
}

export interface RelevanceScoredFile {
  filePath: string
  score: number
  signals: {
    pathKeyword: number
    contentKeyword: number
    importProximity: number
    fileTypeBoost: number
    recency: number
  }
}

export interface RelevanceScoringResponse {
  rankedFiles: RelevanceScoredFile[]
  keywords: string[]
}

// Full-text search message types
export interface SearchBuildRequest {
  rootPath: string
}

export interface SearchBuildResponse {
  fileCount: number
  tokenCount: number
}

export interface SearchQueryRequest {
  query: string
  maxResults?: number
}

export interface SearchQueryResponse {
  results: Array<{
    filePath: string
    lineNumber: number
    lineContent: string
    matchStart: number
    matchEnd: number
    score: number
  }>
  totalMatches: number
  durationMs: number
}

export interface SearchStatsResponse {
  fileCount: number
  tokenCount: number
  rootPath: string | null
  indexing: boolean
}

export interface SearchIndexProgressEvent {
  indexed: number
  total: number
}

// Structure analyzer message types
export interface StructureAnalyzeRequest {
  rootPath: string
}

export interface StructureModuleInfo {
  id: string
  name: string
  rootPath: string
  entryPoint: string | null
  type: string
  children: string[]
  keyFiles: string[]
}

export interface StructureAnalyzeResponse {
  projectRoot: string
  modules: Record<string, StructureModuleInfo>
  topLevelDirs: Array<{ name: string; type: string; path: string }>
}

export interface StructureGetModuleRequest {
  moduleId: string
}

// Context collector message types
export interface ContextCollectRequest {
  taskDescription: string
  projectRoot: string
  maxFiles?: number
  useAi?: boolean
  graphDepth?: number
}

export interface ContextFileResponse {
  filePath: string
  relevance: number
  imports: string[]
  importedBy: string[]
  source: 'search' | 'import-graph' | 'structure' | 'file-pattern'
  moduleId?: string
}

export interface ContextCollectResponse {
  files: ContextFileResponse[]
  parsedTask: TaskParseResponse
  structureMap: StructureAnalyzeResponse | null
  timing: {
    parse: number
    search: number
    structure: number
    graph: number
    scoring: number
    total: number
  }
}

export interface ShellInfo {
  path: string
  name: string
}

// Plugin config message types
export interface PluginConfigGetRequest {
  pluginName: string
}

export interface PluginConfigSetRequest {
  pluginName: string
  key: string
  value: unknown
}

export interface PluginSetEnabledRequest {
  pluginName: string
  enabled: boolean
}

// Plugin loader message types
export interface PluginGetRequest {
  name: string
}

export interface PluginInfo {
  name: string
  version: string
  description: string
  author: string
  icon?: string
  defaultSize: { width: number; height: number }
  entryPointPath: string
  permissions: string[]
  pluginDir: string
  source: 'global' | 'project'
  /** How this plugin was installed (npm, url, or local/undefined for manually placed). */
  installSource?: 'npm' | 'url' | 'local'
  configSchema?: Record<string, import('../plugin/pluginManifest').PluginConfigField>
}

export interface PluginInstallRequest {
  /** npm package name or URL */
  source: string
}

export interface PluginInstallResponse {
  success: boolean
  pluginName?: string
  pluginDir?: string
  error?: string
}

export interface PluginUninstallRequest {
  name: string
  force?: boolean
}

export interface PluginUninstallResponse {
  success: boolean
  error?: string
}

export interface PluginListResponse {
  plugins: PluginInfo[]
}

export interface PluginReloadResponse {
  plugins: PluginInfo[]
  errors: Array<{ pluginDir: string; error: string }>
}

export interface PluginChangedEvent {
  plugins: PluginInfo[]
  errors: Array<{ pluginDir: string; error: string }>
}

// Plugin IPC bridge message types

export interface PluginRegisterRequest {
  pluginId: string
  permissions: import('../plugin/pluginManifest').PluginPermission[]
  sandboxRoot: string
}

export interface PluginFsReadFileRequest {
  pluginId: string
  path: string
}

export interface PluginFsReadFileResponse {
  content: string
  size: number
}

export interface PluginFsWriteFileRequest {
  pluginId: string
  path: string
  content: string
}

export interface PluginFsWriteFileResponse {
  size: number
}

export interface PluginFsReadDirRequest {
  pluginId: string
  path: string
}

export interface PluginFsReadDirEntry {
  name: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
}

export interface PluginExecuteCommandRequest {
  pluginId: string
  command: string
  args?: string[]
}

export interface PluginExecuteCommandResponse {
  exitCode: number
  stdout: string
  stderr: string
}

export interface PluginGetStateRequest {
  pluginId: string
  key: string
}

export interface PluginSetStateRequest {
  pluginId: string
  key: string
  value: unknown
}

/** Context-level permission names (as used by PluginContext in the renderer). */
export type PluginContextPermission =
  | 'fs:read'
  | 'fs:write'
  | 'shell:execute'
  | 'terminal:spawn'
  | 'canvas:modify'
  | 'network:fetch'

export interface PluginRequestPermissionRequest {
  pluginId: string
  permission: PluginContextPermission
}

// AI stream event types — defined in preload/types.ts for cross-process sharing
export type {
  AiStreamEvent,
  AiStreamTextDelta,
  AiStreamToolUse,
  AiStreamToolResult,
  AiStreamCanvasAction,
  AiStreamMessageComplete,
  AiStreamError,
  CanvasActionType,
} from '../../preload/types'
