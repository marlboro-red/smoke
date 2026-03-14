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

export interface SmokeAPI {
  pty: {
    spawn: (options: PtySpawnOptions) => Promise<PtySpawnResult>
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    kill: (id: string) => void
    onData: (callback: (event: PtyDataEvent) => void) => () => void
    onExit: (callback: (event: PtyExitEvent) => void) => () => void
  }
}

declare global {
  interface Window {
    smokeAPI: SmokeAPI
  }
}
