// IPC channel constants for PTY communication

export const PTY_SPAWN = 'pty:spawn' as const
export const PTY_DATA_TO_PTY = 'pty:data:to-pty' as const
export const PTY_DATA_FROM_PTY = 'pty:data:from-pty' as const
export const PTY_RESIZE = 'pty:resize' as const
export const PTY_KILL = 'pty:kill' as const
export const PTY_EXIT = 'pty:exit' as const

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
