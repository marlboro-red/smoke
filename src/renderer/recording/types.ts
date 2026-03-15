// Canvas event types for session replay recording

export type CanvasEventType =
  | 'session_created'
  | 'session_closed'
  | 'session_moved'
  | 'session_resized'
  | 'terminal_snapshot'
  | 'ai_message'
  | 'viewport_changed'

export interface CanvasEvent<T extends CanvasEventType = CanvasEventType> {
  timestamp: number
  type: T
  payload: CanvasEventPayloadMap[T]
}

export interface CanvasEventPayloadMap {
  session_created: {
    sessionId: string
    type: 'terminal' | 'file' | 'note' | 'webview' | 'image'
    title: string
    cwd?: string
    filePath?: string
    url?: string
    position: { x: number; y: number }
    size: { cols: number; rows: number; width: number; height: number }
  }
  session_closed: {
    sessionId: string
    exitCode?: number
  }
  session_moved: {
    sessionId: string
    from: { x: number; y: number }
    to: { x: number; y: number }
  }
  session_resized: {
    sessionId: string
    from: { cols: number; rows: number; width: number; height: number }
    to: { cols: number; rows: number; width: number; height: number }
  }
  terminal_snapshot: {
    sessionId: string
    lines: string[]
  }
  ai_message: {
    conversationId: string
    role: 'user' | 'assistant'
    text: string
  }
  viewport_changed: {
    panX: number
    panY: number
    zoom: number
  }
}

export interface EventLog {
  version: 1
  startedAt: number
  events: CanvasEvent[]
}
