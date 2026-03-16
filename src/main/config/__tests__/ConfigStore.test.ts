import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as realFs from 'fs'

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockStoreInstance, MockStore } = vi.hoisted(() => {
  const mockStoreInstance = {
    get: vi.fn((_key: string, defaultVal?: any) => defaultVal),
    set: vi.fn(),
    onDidChange: vi.fn(),
  }

  let shouldThrow = false

  const MockStore = vi.fn(function (this: any, _opts: any) {
    if (shouldThrow) {
      shouldThrow = false // only throw on first call
      throw new SyntaxError('Unexpected token in JSON')
    }
    Object.assign(this, mockStoreInstance)
  }) as any

  MockStore._setThrowOnNext = () => { shouldThrow = true }

  return { mockStoreInstance, MockStore }
})

vi.mock('electron-store', () => ({ default: MockStore }))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ConfigStore', () => {
  const savedEnv = process.env.SMOKE_E2E_CONFIG_DIR

  beforeEach(() => {
    vi.resetModules()
    MockStore.mockClear()
    mockStoreInstance.get.mockClear()
    mockStoreInstance.set.mockClear()
    delete process.env.SMOKE_E2E_CONFIG_DIR
  })

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.SMOKE_E2E_CONFIG_DIR = savedEnv
    } else {
      delete process.env.SMOKE_E2E_CONFIG_DIR
    }
  })

  async function loadModule() {
    return import('../ConfigStore')
  }

  describe('defaultPreferences', () => {
    it('exports expected default values', async () => {
      const { defaultPreferences } = await loadModule()

      expect(defaultPreferences).toEqual(expect.objectContaining({
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
      }))
    })

    it('has fontFamily with Berkeley Mono as primary', async () => {
      const { defaultPreferences } = await loadModule()
      expect(defaultPreferences.fontFamily).toContain('Berkeley Mono')
    })

    it('has sidebarCollapsed set to false', async () => {
      const { defaultPreferences } = await loadModule()
      expect((defaultPreferences as any).sidebarCollapsed).toBe(false)
    })
  })

  describe('store creation', () => {
    it('creates an electron-store with name "smoke-config"', async () => {
      await loadModule()

      expect(MockStore).toHaveBeenCalledTimes(1)
      const opts = MockStore.mock.calls[0][0]
      expect(opts.name).toBe('smoke-config')
    })

    it('passes correct default values to store constructor', async () => {
      await loadModule()

      const opts = MockStore.mock.calls[0][0]
      expect(opts.defaults.defaultLayout).toBeNull()
      expect(opts.defaults.namedLayouts).toEqual({})
      expect(opts.defaults.canvasBookmarks).toEqual({})
      expect(opts.defaults.preferences).toEqual(expect.objectContaining({
        defaultShell: '',
        gridSize: 20,
        theme: 'dark',
      }))
      expect(opts.defaults.tabs).toEqual([{ id: 'default', name: 'Canvas 1' }])
      expect(opts.defaults.activeTabId).toBe('default')
      expect(opts.defaults.pluginSettings).toEqual({})
      expect(opts.defaults.disabledPlugins).toEqual([])
    })

    it('exports the created configStore instance', async () => {
      const { configStore } = await loadModule()
      expect(configStore).toBeDefined()
      expect(typeof configStore.get).toBe('function')
      expect(typeof configStore.set).toBe('function')
    })
  })

  describe('corrupted config fallback', () => {
    let tmpDir: string

    beforeEach(() => {
      // Use a real temp dir so the catch block can resolve configDir via storeOptions.cwd
      tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'smoke-cfg-test-'))
      process.env.SMOKE_E2E_CONFIG_DIR = tmpDir
    })

    afterEach(() => {
      realFs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('recovers by deleting config file and recreating store', async () => {
      // Write a fake corrupted config so unlink has something to delete
      realFs.writeFileSync(path.join(tmpDir, 'smoke-config.json'), '{corrupted')

      MockStore._setThrowOnNext()

      const { configStore } = await loadModule()

      // Store constructor should have been called twice: once failed, once succeeded
      expect(MockStore).toHaveBeenCalledTimes(2)

      // Config file should have been deleted
      expect(realFs.existsSync(path.join(tmpDir, 'smoke-config.json'))).toBe(false)

      // Should still export a working store
      expect(configStore).toBeDefined()
      expect(typeof configStore.get).toBe('function')
    })

    it('handles missing config file gracefully during recovery', async () => {
      // Don't create a config file — unlink should silently fail
      MockStore._setThrowOnNext()

      const { configStore } = await loadModule()

      // Should still recover and export a working store
      expect(configStore).toBeDefined()
      expect(MockStore).toHaveBeenCalledTimes(2)
    })
  })

  describe('preference get/set via configStore', () => {
    it('get returns default value when key is not set', async () => {
      const { configStore, defaultPreferences } = await loadModule()
      mockStoreInstance.get.mockImplementation((_key: string, def?: any) => def)

      const prefs = configStore.get('preferences', defaultPreferences)
      expect(prefs).toEqual(defaultPreferences)
    })

    it('set stores a preference value', async () => {
      const { configStore } = await loadModule()
      configStore.set('preferences.theme', 'light')
      expect(mockStoreInstance.set).toHaveBeenCalledWith('preferences.theme', 'light')
    })

    it('set stores numeric preference', async () => {
      const { configStore } = await loadModule()
      configStore.set('preferences.gridSize', 40)
      expect(mockStoreInstance.set).toHaveBeenCalledWith('preferences.gridSize', 40)
    })

    it('set stores boolean preference', async () => {
      const { configStore } = await loadModule()
      configStore.set('preferences.autoLaunchClaude', true)
      expect(mockStoreInstance.set).toHaveBeenCalledWith('preferences.autoLaunchClaude', true)
    })
  })

  describe('layout serialization', () => {
    it('stores and retrieves default layout', async () => {
      const { configStore } = await loadModule()
      const layout = {
        name: '__default__',
        sessions: [
          {
            title: 'zsh',
            cwd: '/home/user',
            position: { x: 0, y: 0 },
            size: { width: 800, height: 600, cols: 80, rows: 24 },
          },
        ],
        viewport: { panX: 100, panY: 200, zoom: 1.5 },
        gridSize: 20,
      }

      configStore.set('defaultLayout', layout)
      expect(mockStoreInstance.set).toHaveBeenCalledWith('defaultLayout', layout)
    })

    it('stores and retrieves named layouts', async () => {
      const { configStore } = await loadModule()
      const layout = {
        name: 'work',
        sessions: [],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }

      configStore.set('namedLayouts.work', layout)
      expect(mockStoreInstance.set).toHaveBeenCalledWith('namedLayouts.work', layout)
    })

    it('stores layout with startupCommand in session', async () => {
      const { configStore } = await loadModule()
      const layout = {
        name: 'dev',
        sessions: [
          {
            title: 'server',
            cwd: '/app',
            startupCommand: 'npm run dev',
            position: { x: 0, y: 0 },
            size: { width: 800, height: 600, cols: 80, rows: 24 },
          },
        ],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }

      configStore.set('namedLayouts.dev', layout)
      expect(mockStoreInstance.set).toHaveBeenCalledWith('namedLayouts.dev', layout)
    })
  })

  describe('E2E config directory override', () => {
    it('uses SMOKE_E2E_CONFIG_DIR when set', async () => {
      process.env.SMOKE_E2E_CONFIG_DIR = '/tmp/e2e-config'
      try {
        const mod = await loadModule()
        const opts = MockStore.mock.calls[MockStore.mock.calls.length - 1][0]
        expect(opts.cwd).toBe('/tmp/e2e-config')
      } finally {
        delete process.env.SMOKE_E2E_CONFIG_DIR
      }
    })

    it('does not set cwd when SMOKE_E2E_CONFIG_DIR is not set', async () => {
      delete process.env.SMOKE_E2E_CONFIG_DIR
      await loadModule()
      const opts = MockStore.mock.calls[MockStore.mock.calls.length - 1][0]
      expect(opts.cwd).toBeUndefined()
    })
  })

  describe('type exports', () => {
    it('exports Layout interface fields via defaults', async () => {
      await loadModule()
      const opts = MockStore.mock.calls[0][0]
      // namedLayouts default is empty Record<string, Layout>
      expect(opts.defaults.namedLayouts).toEqual({})
      // defaultLayout default is null
      expect(opts.defaults.defaultLayout).toBeNull()
    })

    it('exports Bookmark interface via canvasBookmarks default', async () => {
      await loadModule()
      const opts = MockStore.mock.calls[0][0]
      expect(opts.defaults.canvasBookmarks).toEqual({})
    })

    it('exports TabInfo interface via tabs default', async () => {
      await loadModule()
      const opts = MockStore.mock.calls[0][0]
      expect(opts.defaults.tabs).toEqual([{ id: 'default', name: 'Canvas 1' }])
    })
  })
})
