export interface PtySpawnOptions {
  id: string
  cwd: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cols?: number
  rows?: number
  startupCommand?: string
}

export interface PtySpawnResult {
  id: string
  pid: number
}

export interface ShellInfo {
  path: string
  name: string
}

export interface PtyDataEvent {
  id: string
  data: string
}

export interface PtyExitEvent {
  id: string
  exitCode: number
  signal?: number
}

export type BuiltinLayoutElementType = 'terminal' | 'file' | 'note' | 'webview' | 'image' | 'snippet'
export type LayoutElementType = BuiltinLayoutElementType | `plugin:${string}`

export interface LayoutSession {
  type?: LayoutElementType
  title: string
  cwd: string
  shell?: string
  filePath?: string
  language?: string
  content?: string
  color?: string
  url?: string
  aspectRatio?: number
  startupCommand?: string
  pluginId?: string
  locked?: boolean
  isPinned?: boolean
  pinnedViewportPos?: { x: number; y: number }
  pluginData?: Record<string, unknown>
  position: { x: number; y: number }
  size: { width: number; height: number; cols: number; rows: number }
}

export interface LayoutRegion {
  name: string
  color: string
  position: { x: number; y: number }
  size: { width: number; height: number }
}

export interface Layout {
  name: string
  sessions: LayoutSession[]
  viewport: { panX: number; panY: number; zoom: number }
  gridSize: number
  regions?: LayoutRegion[]
}

export interface Bookmark {
  name: string
  panX: number
  panY: number
  zoom: number
}

export interface TabInfo {
  id: string
  name: string
}

export interface TabState {
  tabs: TabInfo[]
  activeTabId: string
}

export interface SidebarSectionSizes {
  fileTree?: number
  layouts?: number
  bookmarks?: number
  recordings?: number
}

export interface ShortcutBindingPref {
  key: string
  mod: boolean
  shift: boolean
}

export interface Preferences {
  defaultShell: string
  autoLaunchClaude: boolean
  claudeCommand: string
  gridSize: number
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number
  sidebarSectionSizes: SidebarSectionSizes
  theme: string
  defaultCwd: string
  terminalOpacity: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  customShortcuts: Record<string, ShortcutBindingPref | null>
  startupCommand: string
  skipAssemblyPreview: boolean
  sidebarCollapsed: boolean
}

export interface FsReaddirEntry {
  name: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
}

export interface FsReadfileResult {
  content: string
  size: number
}

export interface FsReadfileBase64Result {
  dataUrl: string
  size: number
  mimeType: string
}

export interface FsWritefileResult {
  size: number
}

export type CanvasActionType =
  | 'session_created'
  | 'session_moved'
  | 'session_resized'
  | 'session_closed'
  | 'viewport_panned'
  | 'note_created'
  | 'connector_created'
  | 'group_created'
  | 'group_member_added'
  | 'group_broadcast'
  | 'file_edited'
  | 'plugin_session_created'

export interface AiStreamTextDelta {
  type: 'text_delta'
  conversationId: string
  agentId?: string
  delta: string
}

export interface AiStreamToolUse {
  type: 'tool_use'
  conversationId: string
  agentId?: string
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
}

export interface AiStreamToolResult {
  type: 'tool_result'
  conversationId: string
  agentId?: string
  toolUseId: string
  result: unknown
  isError?: boolean
}

export interface AiStreamCanvasAction {
  type: 'canvas_action'
  conversationId: string
  agentId?: string
  action: CanvasActionType
  payload: Record<string, unknown>
}

export interface AiStreamMessageComplete {
  type: 'message_complete'
  conversationId: string
  agentId?: string
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
}

export interface AiStreamError {
  type: 'error'
  conversationId: string
  agentId?: string
  error: string
  code?: string
}

export type AiStreamEvent =
  | AiStreamTextDelta
  | AiStreamToolUse
  | AiStreamToolResult
  | AiStreamCanvasAction
  | AiStreamMessageComplete
  | AiStreamError

export interface EventLogData {
  version: number
  startedAt: number
  events: Array<{ timestamp: number; type: string; payload: unknown }>
}

export interface AgentInfo {
  id: string
  name: string
  groupId: string | null
  role: string | null
  color: string
}

export interface RecordingListEntry {
  filename: string
  startedAt: number
  eventCount: number
  durationMs: number
}

export interface CanvasExportRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ProjectIndexBuildResult {
  fileCount: number
  basenameCount: number
}

export interface ProjectIndexStats {
  fileCount: number
  basenameCount: number
  rootPath: string | null
}

export interface ProjectIndexUpdatedEvent {
  fileCount: number
  basenameCount: number
}

// Full-text search types
export interface SearchResult {
  filePath: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
  score: number
}

export interface SearchResponse {
  results: SearchResult[]
  totalMatches: number
  durationMs: number
}

export interface SearchBuildResult {
  fileCount: number
  tokenCount: number
}

export interface SearchStats {
  fileCount: number
  tokenCount: number
  rootPath: string | null
  indexing: boolean
}

export interface SearchIndexProgressEvent {
  indexed: number
  total: number
}

// Structure analyzer types
export type ModuleType =
  | 'workspace-root'
  | 'package'
  | 'go-module'
  | 'rust-crate'
  | 'python-package'
  | 'service'
  | 'library'
  | 'config'
  | 'tests'
  | 'source'

export interface StructureModuleInfo {
  id: string
  name: string
  rootPath: string
  entryPoint: string | null
  type: ModuleType | string
  children: string[]
  keyFiles: string[]
}

export interface StructureMap {
  projectRoot: string
  modules: Record<string, StructureModuleInfo>
  topLevelDirs: Array<{ name: string; type: string; path: string }>
}

// Code graph types
export interface CodeGraphNode {
  filePath: string
  imports: string[]
  importedBy: string[]
  moduleGroup?: string
  depth: number
}

export interface CodeGraphEdge {
  from: string
  to: string
  type: 'import' | 'require' | 'use'
}

export interface CodeGraphPosition {
  filePath: string
  x: number
  y: number
  depth: number
}

export interface CodeGraphBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CodeGraphResult {
  graph: {
    nodes: CodeGraphNode[]
    edges: CodeGraphEdge[]
  }
  rootPath: string
  fileCount: number
  edgeCount: number
  layout: {
    positions: CodeGraphPosition[]
    bounds: CodeGraphBounds
  }
}

export interface CodeGraphImportEntry {
  specifier: string
  type: 'import' | 'require' | 'use'
}

export interface CodeGraphIndexStats {
  root: string
  fileCount: number
}

// Relevance scoring types
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

export interface RelevanceScoringResult {
  rankedFiles: RelevanceScoredFile[]
  keywords: string[]
}

// Task parser types
export type TaskIntent = 'fix' | 'add' | 'refactor' | 'investigate' | 'test' | 'document' | 'configure' | 'style'
export type FileCategory = 'source' | 'test' | 'config' | 'style' | 'docs' | 'types'

export interface ParsedTask {
  intent: TaskIntent
  keywords: string[]
  filePatterns: string[]
  includeFileTypes: FileCategory[]
  usedAi: boolean
}

// Context collector types
export interface ContextFile {
  filePath: string
  relevance: number
  imports: string[]
  importedBy: string[]
  source: 'search' | 'import-graph' | 'structure' | 'file-pattern'
  moduleId?: string
}

export interface ContextCollectResult {
  files: ContextFile[]
  parsedTask: ParsedTask
  structureMap: StructureMap | null
  timing: {
    parse: number
    search: number
    structure: number
    graph: number
    scoring: number
    total: number
  }
}

// Workspace layout planner types
export interface WorkspaceFileInput {
  filePath: string
  relevance: number
  imports: string[]
  importedBy: string[]
}

export interface WorkspaceArrow {
  from: string
  to: string
  type: 'import' | 'require' | 'use'
}

export interface WorkspaceRegion {
  name: string
  position: { x: number; y: number }
  size: { width: number; height: number }
}

export interface WorkspaceLayoutResult {
  positions: CodeGraphPosition[]
  arrows: WorkspaceArrow[]
  regions: WorkspaceRegion[]
  bounds: CodeGraphBounds
}

// Plugin loader types
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
}

export interface PluginLoadError {
  pluginDir: string
  error: string
}

export interface PluginChangedEvent {
  plugins: PluginInfo[]
  errors: PluginLoadError[]
}

// Plugin IPC bridge types
export type PluginContextPermission =
  | 'fs:read'
  | 'fs:write'
  | 'shell:execute'
  | 'terminal:spawn'
  | 'canvas:modify'
  | 'network:fetch'

export type ManifestPermission =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'network'
  | 'pty'
  | 'clipboard'
  | 'notifications'
  | 'shell'

export interface PluginFsReadResult {
  content: string
  size: number
}

export interface PluginFsWriteResult {
  size: number
}

export interface PluginFsDirEntry {
  name: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
}

export interface PluginCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface SmokeAPI {
  pty: {
    spawn: (options: PtySpawnOptions) => Promise<PtySpawnResult>
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    kill: (id: string) => void
    onData: (callback: (event: PtyDataEvent) => void) => () => void
    onExit: (callback: (event: PtyExitEvent) => void) => () => void
  }
  layout: {
    save: (name: string, layout: Layout) => Promise<void>
    load: (name: string) => Promise<Layout | null>
    list: () => Promise<string[]>
    delete: (name: string) => Promise<void>
  }
  bookmark: {
    save: (name: string, bookmark: Bookmark) => Promise<void>
    list: () => Promise<Bookmark[]>
    delete: (name: string) => Promise<void>
  }
  config: {
    get: () => Promise<Preferences>
    set: (key: string, value: unknown) => Promise<void>
  }
  fs: {
    readdir: (path: string) => Promise<FsReaddirEntry[]>
    readfile: (path: string, maxSize?: number) => Promise<FsReadfileResult>
    readfileBase64: (path: string, maxSize?: number) => Promise<FsReadfileBase64Result>
    writefile: (path: string, content: string) => Promise<FsWritefileResult>
    watch: (path: string) => Promise<void>
    unwatch: (path: string) => Promise<void>
    onFileChanged: (callback: (event: { path: string }) => void) => () => void
  }
  app: {
    getLaunchCwd: () => Promise<string>
    getGitBranch: () => Promise<string | null>
  }
  recording: {
    flush: (log: EventLogData) => Promise<string>
    list: () => Promise<RecordingListEntry[]>
    load: (filename: string) => Promise<EventLogData | null>
    exportRecording: (filename: string) => Promise<{ filePath: string | null }>
    importRecording: () => Promise<RecordingListEntry | null>
  }
  ai: {
    send: (agentId: string, message: string, conversationId?: string) => Promise<{ conversationId: string; error?: string }>
    abort: (agentId: string, conversationId?: string) => Promise<void>
    clear: (agentId: string, conversationId?: string) => Promise<void>
    onStream: (callback: (event: AiStreamEvent) => void) => () => void
    onCanvasAction: (callback: (event: AiStreamCanvasAction) => void) => () => void
  }
  canvas: {
    exportPng: (rect: CanvasExportRect) => Promise<{ filePath: string | null }>
  }
  project: {
    buildIndex: (rootPath: string) => Promise<ProjectIndexBuildResult>
    lookup: (basename: string) => Promise<string[]>
    getStats: () => Promise<ProjectIndexStats>
    onIndexUpdated: (callback: (event: ProjectIndexUpdatedEvent) => void) => () => void
  }
  agent: {
    create: (name: string) => Promise<{ agentId: string; color: string }>
    remove: (agentId: string) => Promise<void>
    list: () => Promise<AgentInfo[]>
    assignGroup: (agentId: string, groupId: string | null, memberSessionIds?: string[]) => Promise<void>
    setRole: (agentId: string, role: string | null) => Promise<void>
    updateScope: (agentId: string, sessionIds: string[]) => Promise<void>
  }
  task: {
    parse: (taskDescription: string, useAi?: boolean) => Promise<ParsedTask>
  }
  relevance: {
    score: (
      taskDescription: string,
      candidateFiles: string[],
      projectRoot: string,
      seedFiles?: string[],
      limit?: number
    ) => Promise<RelevanceScoringResult>
  }
  codegraph: {
    build: (filePath: string, projectRoot: string, maxDepth?: number) => Promise<CodeGraphResult>
    expand: (
      existingGraph: CodeGraphResult['graph'],
      existingPositions: CodeGraphPosition[],
      expandPath: string,
      projectRoot: string,
      maxDepth?: number
    ) => Promise<CodeGraphResult>
    getImports: (filePath: string) => Promise<CodeGraphImportEntry[]>
    resolveImport: (specifier: string, importerPath: string, projectRoot: string) => Promise<string | null>
    indexStats: () => Promise<CodeGraphIndexStats | null>
    invalidateIndex: () => Promise<void>
    planWorkspace: (files: WorkspaceFileInput[]) => Promise<WorkspaceLayoutResult>
    getDependents: (filePath: string, projectRoot: string) => Promise<string[]>
    buildDependents: (filePath: string, projectRoot: string) => Promise<CodeGraphResult>
  }
  tab: {
    getState: () => Promise<TabState>
    saveState: (state: TabState) => Promise<void>
  }
  search: {
    build: (rootPath: string) => Promise<SearchBuildResult>
    query: (query: string, maxResults?: number) => Promise<SearchResponse>
    getStats: () => Promise<SearchStats>
    onProgress: (callback: (event: SearchIndexProgressEvent) => void) => () => void
  }
  structure: {
    analyze: (rootPath: string) => Promise<StructureMap>
    get: () => Promise<StructureMap | null>
    getModule: (moduleId: string) => Promise<StructureModuleInfo | null>
  }
  context: {
    collect: (
      taskDescription: string,
      projectRoot: string,
      maxFiles?: number,
      useAi?: boolean,
      graphDepth?: number,
    ) => Promise<ContextCollectResult>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    platform: string
  }
  shell: {
    list: () => Promise<ShellInfo[]>
  }
  plugin: {
    // Plugin loader
    list: () => Promise<{ plugins: PluginInfo[] }>
    get: (name: string) => Promise<PluginInfo | null>
    reload: () => Promise<{ plugins: PluginInfo[]; errors: PluginLoadError[] }>
    onChanged: (callback: (event: PluginChangedEvent) => void) => () => void
    // Plugin install/uninstall
    install: (source: string) => Promise<{ success: boolean; pluginName?: string; error?: string }>
    uninstall: (name: string, force?: boolean) => Promise<{ success: boolean; error?: string }>
    // Plugin IPC bridge
    register: (pluginId: string, permissions: ManifestPermission[], sandboxRoot: string) => Promise<void>
    unregister: (pluginId: string) => Promise<void>
    readFile: (pluginId: string, path: string) => Promise<PluginFsReadResult>
    writeFile: (pluginId: string, path: string, content: string) => Promise<PluginFsWriteResult>
    readDir: (pluginId: string, path: string) => Promise<PluginFsDirEntry[]>
    executeCommand: (pluginId: string, command: string, args?: string[]) => Promise<PluginCommandResult>
    getState: (pluginId: string, key: string) => Promise<unknown>
    setState: (pluginId: string, key: string, value: unknown) => Promise<void>
    requestPermission: (pluginId: string, permission: PluginContextPermission) => Promise<boolean>
  }
}

declare global {
  interface Window {
    smokeAPI: SmokeAPI
  }
}
