// Sandbox components
export { default as PluginSandbox } from './PluginSandbox'
export { default as PluginErrorBoundary } from './PluginErrorBoundary'
export { createHostBridge, buildSandboxHtml, getPluginBootstrapSource } from './pluginBridge'

// Sandbox-specific types
export type {
  PluginManifest,
  PluginPermission,
  PluginConfigField,
  PluginBridgeContext,
  PluginSandboxState,
  PluginError,
} from './pluginTypes'

// PluginContext API (from smoke-6csh.3)
export type {
  PluginContext,
  SessionType,
  Position,
  Size,
  SessionInfo,
  CanvasState,
  CanvasEvent,
  ToastSeverity,
  ThemeInfo,
  PluginPreferences,
  FileEntry,
  FileReadResult,
  FileWriteResult,
  CommandResult,
  SpawnTerminalOptions,
  Disposable,
} from './pluginContext'

export { PLUGIN_API_VERSION } from './pluginContext'

export {
  registerPluginElementType,
  getPluginElementRegistration,
  isPluginElementType,
  getAllPluginElementTypes,
  subscribeToPluginRegistry,
} from './pluginElementRegistry'

export type {
  PluginElementRegistration,
  PluginWindowProps,
  PluginThumbnailProps,
} from './pluginElementRegistry'
