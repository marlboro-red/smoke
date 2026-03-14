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

export interface LayoutSession {
  title: string
  cwd: string
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
  }
  app: {
    getLaunchCwd: () => Promise<string>
  }
}

declare global {
  interface Window {
    smokeAPI: SmokeAPI
  }
}
