export interface PtySpawnOptions {
  id: string
  cwd: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface PtySpawnResult {
  id: string
  pid: number
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

export type LayoutElementType = 'terminal' | 'file' | 'note'

export interface LayoutSession {
  type?: LayoutElementType
  title: string
  cwd: string
  filePath?: string
  language?: string
  content?: string
  color?: string
  position: { x: number; y: number }
  size: { width: number; height: number; cols: number; rows: number }
}

export interface Layout {
  name: string
  sessions: LayoutSession[]
  viewport: { panX: number; panY: number; zoom: number }
  gridSize: number
}

export interface SidebarSectionSizes {
  fileTree?: number
  layouts?: number
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
  aiApiKey: string
  aiModel: string
  terminalOpacity: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  customShortcuts: Record<string, ShortcutBindingPref | null>
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

export interface FsWritefileResult {
  size: number
}

// AI types — defined here so both main and renderer can import them

export interface AiConfig {
  model: string
  apiKey: string
  maxTokens: number
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
  config: {
    get: () => Promise<Preferences>
    set: (key: string, value: unknown) => Promise<void>
  }
  fs: {
    readdir: (path: string) => Promise<FsReaddirEntry[]>
    readfile: (path: string, maxSize?: number) => Promise<FsReadfileResult>
    writefile: (path: string, content: string) => Promise<FsWritefileResult>
  }
  app: {
    getLaunchCwd: () => Promise<string>
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
    getConfig: () => Promise<AiConfig>
    setConfig: (key: string, value: unknown) => Promise<void>
    onStream: (callback: (event: AiStreamEvent) => void) => () => void
    onCanvasAction: (callback: (event: AiStreamCanvasAction) => void) => () => void
  }
  agent: {
    create: (name: string) => Promise<{ agentId: string; color: string }>
    remove: (agentId: string) => Promise<void>
    list: () => Promise<AgentInfo[]>
    assignGroup: (agentId: string, groupId: string | null, memberSessionIds?: string[]) => Promise<void>
    setRole: (agentId: string, role: string | null) => Promise<void>
    updateScope: (agentId: string, sessionIds: string[]) => Promise<void>
  }
}

declare global {
  interface Window {
    smokeAPI: SmokeAPI
  }
}
