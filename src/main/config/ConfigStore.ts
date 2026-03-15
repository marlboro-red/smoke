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

export interface Preferences {
  defaultShell: string
  autoLaunchClaude: boolean
  claudeCommand: string
  gridSize: number
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number
  theme: string
  defaultCwd: string
  aiApiKey: string
  aiModel: string
}

export const defaultPreferences: Preferences = {
  defaultShell: '',
  autoLaunchClaude: false,
  claudeCommand: 'claude',
  gridSize: 20,
  sidebarPosition: 'left',
  sidebarWidth: 240,
  theme: 'dark',
  defaultCwd: '',
  aiApiKey: '',
  aiModel: 'claude-sonnet-4-20250514',
}

export interface SmokeConfig {
  defaultLayout: Layout | null
  namedLayouts: Record<string, Layout>
  preferences: Preferences
}

const configStore = new Store<SmokeConfig>({
  name: 'smoke-config',
  defaults: {
    defaultLayout: null,
    namedLayouts: {},
    preferences: { ...defaultPreferences },
  },
})

export { configStore }
