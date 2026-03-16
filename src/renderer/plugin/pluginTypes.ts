/**
 * Plugin sandbox types — types specific to the isolated rendering container.
 *
 * For the full PluginContext API, see ./pluginContext.ts (smoke-6csh.3).
 * For the manifest schema and validation, see src/main/plugin/pluginManifest.ts (smoke-6csh.1).
 *
 * Note: Renderer code cannot import from src/main/ (different tsconfig scope),
 * so manifest types are duplicated here as a structural subset. The main-process
 * manifest module is the source of truth for validation.
 */

/**
 * Renderer-side projection of the plugin manifest.
 * Matches the shape from src/main/plugin/pluginManifest.ts but lives in the
 * renderer tsconfig scope.
 */
export interface PluginManifest {
  /** Unique plugin name (lowercase alphanumeric + hyphens, e.g. "docker-dashboard") */
  name: string
  version: string
  description: string
  author: string
  icon?: string
  defaultSize: { width: number; height: number }
  entryPoint: string
  permissions: PluginPermission[]
  configSchema?: Record<string, PluginConfigField>
}

export type PluginPermission =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'network'
  | 'pty'
  | 'clipboard'
  | 'notifications'
  | 'shell'

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean' | 'select'
  label: string
  description?: string
  default?: string | number | boolean
  options?: string[]
  min?: number
  max?: number
}

/**
 * PluginBridgeContext is the low-level API surface exposed inside the
 * sandboxed iframe via the postMessage bridge. The full PluginContext
 * (from pluginContext.ts) is built on top of this bridge.
 */
export interface PluginBridgeContext {
  /** The session ID for this plugin instance */
  sessionId: string
  /** Basic manifest info forwarded into the iframe */
  manifest: { name: string; version: string; entryPoint: string }

  /** Read-only window dimensions */
  size: { width: number; height: number }

  /** Update the window title shown in WindowChrome */
  setTitle: (title: string) => void

  /** Request a window resize (subject to grid snapping) */
  requestResize: (width: number, height: number) => void

  /**
   * Key-value storage scoped to this plugin.
   * Persisted across sessions via electron-store.
   */
  storage: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
  }

  /**
   * Send a message to the host (Smoke).
   * The host can register listeners for plugin messages.
   */
  sendMessage: (type: string, payload: unknown) => void

  /**
   * Register a handler for messages from the host.
   * Returns an unsubscribe function.
   */
  onMessage: (type: string, handler: (payload: unknown) => void) => () => void
}

/** The state a plugin sandbox can be in. */
export type PluginSandboxState =
  | 'loading'
  | 'ready'
  | 'error'
  | 'crashed'

/** Error information when a plugin fails. */
export interface PluginError {
  message: string
  stack?: string
  phase: 'load' | 'render' | 'runtime'
}
