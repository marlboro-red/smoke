import Store from 'electron-store'

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
  aiApiKey: string
  aiModel: string
  terminalOpacity: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  customShortcuts: Record<string, ShortcutBindingPref | null>
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
  aiApiKey: '',
  aiModel: 'claude-sonnet-4-20250514',
  terminalOpacity: 1,
  fontFamily: '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  customShortcuts: {},
}

export interface Bookmark {
  name: string
  panX: number
  panY: number
  zoom: number
}

export interface SmokeConfig {
  defaultLayout: Layout | null
  namedLayouts: Record<string, Layout>
  canvasBookmarks: Record<string, Bookmark>
  preferences: Preferences
}

const configStore = new Store<SmokeConfig>({
  name: 'smoke-config',
  defaults: {
    defaultLayout: null,
    namedLayouts: {},
    canvasBookmarks: {},
    preferences: { ...defaultPreferences },
  },
})

export { configStore }
