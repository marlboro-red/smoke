import Store from 'electron-store'

export interface LayoutSession {
  title: string
  cwd: string
  startupCommand?: string
  position: { x: number; y: number }
  size: { width: number; height: number; cols: number; rows: number }
}

export interface Layout {
  name: string
  sessions: LayoutSession[]
  viewport: { panX: number; panY: number; zoom: number }
  gridSize: number
}

export interface SidebarSectionSizes {
  fileTree?: number
  layouts?: number
  bookmarks?: number
  recordings?: number
}

export interface ShortcutBindingPref {
  key: string
  mod: boolean
  shift: boolean
}

export interface Preferences {
  defaultShell: string
  autoLaunchClaude: boolean
  claudeCommand: string
  gridSize: number
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number
  sidebarSectionSizes: SidebarSectionSizes
  theme: string
  defaultCwd: string
  terminalOpacity: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  customShortcuts: Record<string, ShortcutBindingPref | null>
  startupCommand: string
  skipAssemblyPreview: boolean
}

export const defaultPreferences: Preferences = {
  defaultShell: '',
  autoLaunchClaude: false,
  claudeCommand: 'claude',
  gridSize: 20,
  sidebarPosition: 'left',
  sidebarWidth: 240,
  sidebarSectionSizes: {},
  theme: 'dark',
  defaultCwd: '',
  terminalOpacity: 1,
  fontFamily: '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  customShortcuts: {},
  startupCommand: '',
  skipAssemblyPreview: false,
}

export interface Bookmark {
  name: string
  panX: number
  panY: number
  zoom: number
}

export interface TabInfo {
  id: string
  name: string
}

export interface SmokeConfig {
  defaultLayout: Layout | null
  namedLayouts: Record<string, Layout>
  canvasBookmarks: Record<string, Bookmark>
  preferences: Preferences
  tabs: TabInfo[]
  activeTabId: string
}

const storeOptions = {
  name: 'smoke-config' as const,
  defaults: {
    defaultLayout: null as Layout | null,
    namedLayouts: {} as Record<string, Layout>,
    canvasBookmarks: {} as Record<string, Bookmark>,
    preferences: { ...defaultPreferences },
    tabs: [{ id: 'default', name: 'Canvas 1' }] as TabInfo[],
    activeTabId: 'default',
  },
  // Allow E2E tests to redirect config to an isolated temp directory
  ...(process.env.SMOKE_E2E_CONFIG_DIR ? { cwd: process.env.SMOKE_E2E_CONFIG_DIR } : {}),
}

let configStore: Store<SmokeConfig>
try {
  configStore = new Store<SmokeConfig>(storeOptions)
} catch {
  // Corrupted config file — delete it and recreate with defaults
  const Store2 = Store
  const fs = require('fs')
  const path = require('path')
  const configDir = storeOptions.cwd || require('electron').app.getPath('userData')
  const configFile = path.join(configDir, 'smoke-config.json')
  try { fs.unlinkSync(configFile) } catch { /* may not exist */ }
  configStore = new Store2<SmokeConfig>(storeOptions)
}

export { configStore }
