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

export interface Preferences {
  defaultShell: string
  autoLaunchClaude: boolean
  claudeCommand: string
  gridSize: number
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number
  theme: string
  defaultCwd: string
  aiApiKey: string
  aiModel: string
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

export interface AiStreamTextDelta {
  type: 'text_delta'
  conversationId: string
  delta: string
}

export interface AiStreamToolUse {
  type: 'tool_use'
  conversationId: string
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
}

export interface AiStreamToolResult {
  type: 'tool_result'
  conversationId: string
  toolUseId: string
  result: unknown
  isError?: boolean
}

export interface AiStreamCanvasAction {
  type: 'canvas_action'
  conversationId: string
  action: CanvasActionType
  payload: Record<string, unknown>
}

export interface AiStreamMessageComplete {
  type: 'message_complete'
  conversationId: string
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
}

export interface AiStreamError {
  type: 'error'
  conversationId: string
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
  ai: {
    send: (message: string, conversationId?: string) => Promise<{ conversationId: string }>
    abort: (conversationId?: string) => Promise<void>
    clear: (conversationId?: string) => Promise<void>
    getConfig: () => Promise<AiConfig>
    setConfig: (key: string, value: unknown) => Promise<void>
    onStream: (callback: (event: AiStreamEvent) => void) => () => void
    onCanvasAction: (callback: (event: AiStreamCanvasAction) => void) => () => void
  }
}

declare global {
  interface Window {
    smokeAPI: SmokeAPI
  }
}
