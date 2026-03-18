import { ipcMain } from 'electron'
import { configStore, defaultPreferences } from '../../config/ConfigStore'
import type { Layout, Bookmark, Preferences, SmokeConfig } from '../../config/ConfigStore'
import {
  LAYOUT_SAVE,
  LAYOUT_LOAD,
  LAYOUT_LIST,
  LAYOUT_DELETE,
  BOOKMARK_SAVE,
  BOOKMARK_LIST,
  BOOKMARK_DELETE,
  CONFIG_GET,
  CONFIG_SET,
  TAB_GET_STATE,
  TAB_SAVE_STATE,
  type LayoutSaveRequest,
  type LayoutLoadRequest,
  type LayoutDeleteRequest,
  type BookmarkSaveRequest,
  type BookmarkDeleteRequest,
  type ConfigSetRequest,
  type TabStateData,
} from '../channels'

export interface ConfigHandlersCleanup {
  dispose: () => void
}

export function registerConfigHandlers(): ConfigHandlersCleanup {
  // Layout persistence handlers
  ipcMain.handle(LAYOUT_SAVE, (_event, request: LayoutSaveRequest): void => {
    if (request.name === '__default__') {
      configStore.set('defaultLayout', request.layout)
    } else {
      const layouts = configStore.get('namedLayouts', {})
      layouts[request.name] = request.layout
      configStore.set('namedLayouts', layouts)
    }
  })

  ipcMain.handle(LAYOUT_LOAD, (_event, request: LayoutLoadRequest): Layout | null => {
    if (request.name === '__default__') {
      return configStore.get('defaultLayout', null)
    }
    const layouts = configStore.get('namedLayouts', {})
    return layouts[request.name] ?? null
  })

  ipcMain.handle(LAYOUT_LIST, (): string[] => {
    const layouts = configStore.get('namedLayouts', {})
    return Object.keys(layouts)
  })

  ipcMain.handle(LAYOUT_DELETE, (_event, request: LayoutDeleteRequest): void => {
    const layouts = configStore.get('namedLayouts', {})
    delete layouts[request.name]
    configStore.set('namedLayouts', layouts)
  })

  // Bookmark persistence handlers
  ipcMain.handle(BOOKMARK_SAVE, (_event, request: BookmarkSaveRequest): void => {
    const bookmarks = configStore.get('canvasBookmarks', {})
    bookmarks[request.name] = request.bookmark
    configStore.set('canvasBookmarks', bookmarks)
  })

  ipcMain.handle(BOOKMARK_LIST, (): Bookmark[] => {
    const bookmarks = configStore.get('canvasBookmarks', {})
    return Object.values(bookmarks)
  })

  ipcMain.handle(BOOKMARK_DELETE, (_event, request: BookmarkDeleteRequest): void => {
    const bookmarks = configStore.get('canvasBookmarks', {})
    delete bookmarks[request.name]
    configStore.set('canvasBookmarks', bookmarks)
  })

  // Config handlers
  ipcMain.handle(CONFIG_GET, (): Preferences => {
    return configStore.get('preferences', defaultPreferences)
  })

  ipcMain.handle(CONFIG_SET, (_event, request: ConfigSetRequest): void => {
    const validKeys: Array<keyof Preferences> = [
      'defaultShell', 'autoLaunchClaude', 'claudeCommand', 'startupCommand',
      'gridSize', 'sidebarPosition', 'sidebarWidth', 'sidebarSectionSizes',
      'theme', 'defaultCwd',
      'terminalOpacity', 'fontFamily', 'fontSize', 'lineHeight',
      'customShortcuts',
    ]
    if (!validKeys.includes(request.key as keyof Preferences)) return
    const key = `preferences.${request.key}` as keyof SmokeConfig
    configStore.set(key, request.value as never)
  })

  // Tab state handlers
  ipcMain.handle(TAB_GET_STATE, (): TabStateData => {
    const tabs = configStore.get('tabs', [{ id: 'default', name: 'Canvas 1' }])
    const activeTabId = configStore.get('activeTabId', 'default')
    return { tabs, activeTabId }
  })

  ipcMain.handle(TAB_SAVE_STATE, (_event, state: TabStateData): void => {
    configStore.set('tabs', state.tabs)
    configStore.set('activeTabId', state.activeTabId)
  })

  return {
    dispose(): void {
      ipcMain.removeHandler(LAYOUT_SAVE)
      ipcMain.removeHandler(LAYOUT_LOAD)
      ipcMain.removeHandler(LAYOUT_LIST)
      ipcMain.removeHandler(LAYOUT_DELETE)
      ipcMain.removeHandler(BOOKMARK_SAVE)
      ipcMain.removeHandler(BOOKMARK_LIST)
      ipcMain.removeHandler(BOOKMARK_DELETE)
      ipcMain.removeHandler(CONFIG_GET)
      ipcMain.removeHandler(CONFIG_SET)
      ipcMain.removeHandler(TAB_GET_STATE)
      ipcMain.removeHandler(TAB_SAVE_STATE)
    },
  }
}
