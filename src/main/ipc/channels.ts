// IPC channel constants for PTY communication

export const PTY_SPAWN = 'pty:spawn' as const
export const PTY_DATA_TO_PTY = 'pty:data:to-pty' as const
export const PTY_DATA_FROM_PTY = 'pty:data:from-pty' as const
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

// Terminal output buffer channels (AI orchestrator)
export const TERMINAL_BUFFER_READ = 'terminal-buffer:read' as const
export const TERMINAL_BUFFER_READ_LINES = 'terminal-buffer:read-lines' as const

// AI channels
export const AI_SEND = 'ai:send' as const
export const AI_ABORT = 'ai:abort' as const
export const AI_CLEAR = 'ai:clear' as const
export const AI_STREAM = 'ai:stream' as const
export const AI_CONFIG = 'ai:config' as const
export const AI_CANVAS_ACTION = 'ai:canvas-action' as const

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
export const AGENT_UPDATE_SCOPE = 'agent:update-scope' as const

// Canvas export channels
export const CANVAS_EXPORT_PNG = 'canvas:export-png' as const

// App channels
export const APP_GET_LAUNCH_CWD = 'app:get-launch-cwd' as const

// Message types

export interface PtySpawnRequest {
  id: string
  cwd: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cols?: number
  rows?: number
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

export interface AgentUpdateScopeRequest {
  agentId: string
  sessionIds: string[]
}

export interface AgentInfo {
  id: string
  name: string
  groupId: string | null
  role: string | null
  color: string
}

export interface AiConfigGetResponse {
  model: string
  apiKey: string
  maxTokens: number
}

export interface AiConfigSetRequest {
  key: string
  value: unknown
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
