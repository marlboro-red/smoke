import { describe, it, expect, vi, beforeEach } from 'vitest'

// Storage for mock instance methods
const mockGet = vi.fn()
const mockSet = vi.fn()

// Mock electron-store as a constructor class
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      get = mockGet
      set = mockSet
      static constructorArgs: any[] = []
      constructor(opts: any) {
        MockStore.constructorArgs.push(opts)
      }
    },
  }
})

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/fake-user-data') },
}))

describe('ConfigStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('defaultPreferences', () => {
    it('exports default preferences with expected keys', async () => {
      const { defaultPreferences } = await import('../ConfigStore')

      expect(defaultPreferences).toEqual(
        expect.objectContaining({
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
          fontSize: 13,
          lineHeight: 1.2,
          customShortcuts: {},
          startupCommand: '',
          skipAssemblyPreview: false,
        })
      )
    })

    it('has fontFamily with Berkeley Mono as primary', async () => {
      const { defaultPreferences } = await import('../ConfigStore')
      expect(defaultPreferences.fontFamily).toContain('Berkeley Mono')
    })

    it('has sidebarCollapsed defaulting to false', async () => {
      const { defaultPreferences } = await import('../ConfigStore')
      expect((defaultPreferences as any).sidebarCollapsed).toBe(false)
    })

    it('gridSize defaults to 20', async () => {
      const { defaultPreferences } = await import('../ConfigStore')
      expect(defaultPreferences.gridSize).toBe(20)
    })

    it('terminalOpacity defaults to 1 (fully opaque)', async () => {
      const { defaultPreferences } = await import('../ConfigStore')
      expect(defaultPreferences.terminalOpacity).toBe(1)
    })
  })

  describe('configStore instance', () => {
    it('exports a configStore object with get and set', async () => {
      const { configStore } = await import('../ConfigStore')
      expect(configStore).toBeDefined()
      expect(typeof configStore.get).toBe('function')
      expect(typeof configStore.set).toBe('function')
    })
  })

  describe('store defaults', () => {
    it('includes null defaultLayout', async () => {
      const Store = (await import('electron-store')).default as any
      const opts = Store.constructorArgs[0]
      expect(opts.defaults.defaultLayout).toBeNull()
    })

    it('includes empty namedLayouts', async () => {
      const Store = (await import('electron-store')).default as any
      const opts = Store.constructorArgs[0]
      expect(opts.defaults.namedLayouts).toEqual({})
    })

    it('includes empty canvasBookmarks', async () => {
      const Store = (await import('electron-store')).default as any
      const opts = Store.constructorArgs[0]
      expect(opts.defaults.canvasBookmarks).toEqual({})
    })

    it('includes default tab configuration', async () => {
      const Store = (await import('electron-store')).default as any
      const opts = Store.constructorArgs[0]
      expect(opts.defaults.tabs).toEqual([{ id: 'default', name: 'Canvas 1' }])
      expect(opts.defaults.activeTabId).toBe('default')
    })

    it('includes empty pluginSettings and disabledPlugins', async () => {
      const Store = (await import('electron-store')).default as any
      const opts = Store.constructorArgs[0]
      expect(opts.defaults.pluginSettings).toEqual({})
      expect(opts.defaults.disabledPlugins).toEqual([])
    })

    it('uses smoke-config as store name', async () => {
      const Store = (await import('electron-store')).default as any
      const opts = Store.constructorArgs[0]
      expect(opts.name).toBe('smoke-config')
    })
  })

  describe('type interfaces', () => {
    it('Layout type has required fields', () => {
      const layout: import('../ConfigStore').Layout = {
        name: 'test',
        sessions: [],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }
      expect(layout.name).toBe('test')
      expect(layout.sessions).toEqual([])
      expect(layout.viewport.zoom).toBe(1)
    })

    it('LayoutSession type has required fields', () => {
      const session: import('../ConfigStore').LayoutSession = {
        title: 'Terminal',
        cwd: '/home',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600, cols: 80, rows: 24 },
      }
      expect(session.title).toBe('Terminal')
      expect(session.size.cols).toBe(80)
    })

    it('LayoutSession startupCommand is optional', () => {
      const session: import('../ConfigStore').LayoutSession = {
        title: 'Terminal',
        cwd: '/home',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600, cols: 80, rows: 24 },
        startupCommand: 'npm run dev',
      }
      expect(session.startupCommand).toBe('npm run dev')
    })

    it('Bookmark type has required fields', () => {
      const bookmark: import('../ConfigStore').Bookmark = {
        name: 'home',
        panX: 100,
        panY: 200,
        zoom: 1.5,
      }
      expect(bookmark.zoom).toBe(1.5)
    })

    it('TabInfo type has id and name', () => {
      const tab: import('../ConfigStore').TabInfo = {
        id: 'tab1',
        name: 'My Tab',
      }
      expect(tab.id).toBe('tab1')
      expect(tab.name).toBe('My Tab')
    })

    it('ShortcutBindingPref type has key, mod, shift', () => {
      const binding: import('../ConfigStore').ShortcutBindingPref = {
        key: 'k',
        mod: true,
        shift: false,
      }
      expect(binding.key).toBe('k')
      expect(binding.mod).toBe(true)
    })

    it('SmokeConfig type has all top-level keys', async () => {
      const { defaultPreferences } = await import('../ConfigStore')
      const config: import('../ConfigStore').SmokeConfig = {
        defaultLayout: null,
        namedLayouts: {},
        canvasBookmarks: {},
        preferences: defaultPreferences,
        tabs: [{ id: 'default', name: 'Canvas 1' }],
        activeTabId: 'default',
        pluginSettings: {},
        disabledPlugins: [],
      }
      expect(config.activeTabId).toBe('default')
      expect(config.disabledPlugins).toEqual([])
    })
  })
})
