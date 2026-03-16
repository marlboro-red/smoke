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
  PluginPermission,
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
