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

export interface SmokeConfig {
  defaultLayout: Layout | null
  namedLayouts: Record<string, Layout>
}

const configStore = new Store<SmokeConfig>({
  name: 'smoke-config',
  defaults: {
    defaultLayout: null,
    namedLayouts: {},
  },
})

export { configStore }
