/**
 * PluginContext — the stable contract between Smoke and plugins.
 *
 * Plugins receive a PluginContext instance when activated. All interaction
 * with the host app flows through this interface. Methods are scoped to the
 * plugin's declared permissions and sandboxed root directory.
 *
 * @version 1
 */

// ---------------------------------------------------------------------------
// Re-export types plugins need to consume without importing internals
// ---------------------------------------------------------------------------

import type { CanvasActionType } from '../../preload/types'

/** Plugin API version. Bump when breaking changes are introduced. */
export const PLUGIN_API_VERSION = 1

// ---------------------------------------------------------------------------
// Shared value types (stable, minimal projections of internal types)
// ---------------------------------------------------------------------------

export type SessionType = 'terminal' | 'file' | 'note' | 'webview' | 'image' | 'snippet'

export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface SessionInfo {
  id: string
  type: SessionType
  title: string
  position: Position
  size: Size
  zIndex: number
  groupId?: string
  locked?: boolean
  /** Type-specific metadata (cwd for terminals, filePath for files, etc.) */
  meta: Record<string, unknown>
}

export interface CanvasState {
  panX: number
  panY: number
  zoom: number
  gridSize: number
}

export interface CanvasEvent {
  action: CanvasActionType
  payload: Record<string, unknown>
}

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error'

export interface ThemeInfo {
  id: string
  name: string
}

export interface PluginPreferences {
  theme: string
  gridSize: number
  sidebarPosition: 'left' | 'right'
  fontFamily: string
  fontSize: number
  terminalOpacity: number
}

// ---------------------------------------------------------------------------
// File system (scoped to plugin's declared root)
// ---------------------------------------------------------------------------

export interface FileEntry {
  name: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
}

export interface FileReadResult {
  content: string
  size: number
}

export interface FileWriteResult {
  size: number
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

// ---------------------------------------------------------------------------
// Terminal spawning
// ---------------------------------------------------------------------------

export interface SpawnTerminalOptions {
  cwd?: string
  shell?: string
  position?: Position
  startupCommand?: string
}

// ---------------------------------------------------------------------------
// Permission system
// ---------------------------------------------------------------------------

/** Permissions a plugin can request at runtime beyond its manifest grants. */
export type PluginPermission =
  | 'fs:read'
  | 'fs:write'
  | 'shell:execute'
  | 'terminal:spawn'
  | 'canvas:modify'
  | 'network:fetch'

// ---------------------------------------------------------------------------
// Disposable (for event unsubscription)
// ---------------------------------------------------------------------------

export interface Disposable {
  dispose: () => void
}

// ---------------------------------------------------------------------------
// PluginContext — the main API surface
// ---------------------------------------------------------------------------

export interface PluginContext {
  /** The unique plugin identifier from the manifest. */
  readonly pluginId: string

  /** API version this context conforms to. */
  readonly apiVersion: number

  // -- File System (scoped) -------------------------------------------------

  /**
   * Read a file relative to the plugin's sandbox root.
   * Requires `fs:read` permission.
   */
  readFile(path: string): Promise<FileReadResult>

  /**
   * Write a file relative to the plugin's sandbox root.
   * Requires `fs:write` permission.
   */
  writeFile(path: string, content: string): Promise<FileWriteResult>

  /**
   * List directory contents relative to the plugin's sandbox root.
   * Requires `fs:read` permission.
   */
  readDir(path: string): Promise<FileEntry[]>

  // -- Shell ----------------------------------------------------------------

  /**
   * Execute a shell command and return its output.
   * Requires `shell:execute` permission. The command runs in the plugin's
   * sandbox root directory.
   */
  executeCommand(command: string, args?: string[]): Promise<CommandResult>

  // -- Canvas ---------------------------------------------------------------

  /** Get the current canvas viewport state (pan, zoom, grid). */
  getCanvasState(): CanvasState

  /** Get the list of all sessions currently on the canvas. */
  getSessionList(): SessionInfo[]

  /**
   * Subscribe to canvas events (session created/moved/resized/closed, etc.).
   * Returns a disposable to unsubscribe.
   */
  onCanvasEvent(callback: (event: CanvasEvent) => void): Disposable

  // -- UI -------------------------------------------------------------------

  /** Show a toast notification to the user. */
  showToast(message: string, severity?: ToastSeverity, durationMs?: number): void

  /**
   * Open a file in a new file-viewer session on the canvas.
   * The file path is resolved relative to the project root.
   */
  openFile(filePath: string, position?: Position): Promise<SessionInfo>

  /**
   * Spawn a new terminal session on the canvas.
   * Requires `terminal:spawn` permission.
   */
  spawnTerminal(options?: SpawnTerminalOptions): Promise<SessionInfo>

  // -- Preferences & Theme --------------------------------------------------

  /** Get the current active theme. */
  getCurrentTheme(): ThemeInfo

  /** Get a read-only snapshot of user preferences relevant to plugins. */
  getPreferences(): PluginPreferences

  // -- Plugin State (persisted per-plugin) ----------------------------------

  /**
   * Read persisted plugin state. Returns `undefined` if no state has been
   * saved for the given key.
   */
  getPluginState<T = unknown>(key: string): Promise<T | undefined>

  /**
   * Persist plugin state under the given key. Values must be
   * JSON-serializable.
   */
  setPluginState<T = unknown>(key: string, value: T): Promise<void>

  // -- Permissions ----------------------------------------------------------

  /**
   * Request an elevated permission at runtime. The user will be prompted to
   * approve. Returns `true` if the permission was granted.
   */
  requestPermission(permission: PluginPermission): Promise<boolean>
}
