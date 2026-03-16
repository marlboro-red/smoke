import { describe, it, expect } from 'vitest'
import { PLUGIN_API_VERSION } from '../pluginContext'
import type {
  PluginContext,
  SessionInfo,
  CanvasState,
  FileReadResult,
  FileWriteResult,
  FileEntry,
  CommandResult,
  PluginPreferences,
  ThemeInfo,
  Disposable,
  Position,
  Size,
  CanvasEvent,
} from '../pluginContext'

/**
 * These tests verify the PluginContext API surface — the type contracts
 * and structural guarantees that plugins depend on. Since PluginContext
 * is an interface (no runtime implementation in this module), we test:
 * - The exported API version constant
 * - Type-level structural compliance (via concrete mock objects)
 * - That all expected method signatures exist
 */

describe('PluginContext API surface', () => {
  it('exports PLUGIN_API_VERSION as 1', () => {
    expect(PLUGIN_API_VERSION).toBe(1)
  })

  it('PluginContext interface has all required method signatures', () => {
    // Create a concrete implementation of the interface to verify
    // that the type system accepts all expected methods
    const mockContext: PluginContext = {
      pluginId: 'test-plugin',
      apiVersion: PLUGIN_API_VERSION,
      readFile: async (_path: string): Promise<FileReadResult> => ({
        content: '',
        size: 0,
      }),
      writeFile: async (_path: string, _content: string): Promise<FileWriteResult> => ({
        size: 0,
      }),
      readDir: async (_path: string): Promise<FileEntry[]> => [],
      executeCommand: async (_cmd: string, _args?: string[]): Promise<CommandResult> => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
      getCanvasState: (): CanvasState => ({
        panX: 0,
        panY: 0,
        zoom: 1,
        gridSize: 20,
      }),
      getSessionList: (): SessionInfo[] => [],
      onCanvasEvent: (_callback: (event: CanvasEvent) => void): Disposable => ({
        dispose: () => {},
      }),
      showToast: (_msg: string, _severity?, _duration?) => {},
      openFile: async (_path: string, _pos?: Position): Promise<SessionInfo> => ({
        id: 'sess-1',
        type: 'file',
        title: 'test.txt',
        position: { x: 0, y: 0 },
        size: { width: 640, height: 480 },
        zIndex: 1,
        meta: {},
      }),
      spawnTerminal: async (_opts?): Promise<SessionInfo> => ({
        id: 'sess-2',
        type: 'terminal',
        title: 'bash',
        position: { x: 0, y: 0 },
        size: { width: 640, height: 480 },
        zIndex: 1,
        meta: {},
      }),
      getCurrentTheme: (): ThemeInfo => ({ id: 'dark', name: 'Dark' }),
      getPreferences: (): PluginPreferences => ({
        theme: 'dark',
        gridSize: 20,
        sidebarPosition: 'left',
        fontFamily: 'monospace',
        fontSize: 13,
        terminalOpacity: 1,
      }),
      getPluginState: async <T = unknown>(_key: string): Promise<T | undefined> => undefined,
      setPluginState: async <T = unknown>(_key: string, _value: T): Promise<void> => {},
      requestPermission: async (_perm) => false,
    }

    // Verify readonly properties
    expect(mockContext.pluginId).toBe('test-plugin')
    expect(mockContext.apiVersion).toBe(1)

    // Verify all methods exist and are functions
    expect(typeof mockContext.readFile).toBe('function')
    expect(typeof mockContext.writeFile).toBe('function')
    expect(typeof mockContext.readDir).toBe('function')
    expect(typeof mockContext.executeCommand).toBe('function')
    expect(typeof mockContext.getCanvasState).toBe('function')
    expect(typeof mockContext.getSessionList).toBe('function')
    expect(typeof mockContext.onCanvasEvent).toBe('function')
    expect(typeof mockContext.showToast).toBe('function')
    expect(typeof mockContext.openFile).toBe('function')
    expect(typeof mockContext.spawnTerminal).toBe('function')
    expect(typeof mockContext.getCurrentTheme).toBe('function')
    expect(typeof mockContext.getPreferences).toBe('function')
    expect(typeof mockContext.getPluginState).toBe('function')
    expect(typeof mockContext.setPluginState).toBe('function')
    expect(typeof mockContext.requestPermission).toBe('function')
  })

  it('getCanvasState returns correct structure', () => {
    const state: CanvasState = { panX: 100, panY: -50, zoom: 0.8, gridSize: 20 }
    expect(state).toHaveProperty('panX')
    expect(state).toHaveProperty('panY')
    expect(state).toHaveProperty('zoom')
    expect(state).toHaveProperty('gridSize')
  })

  it('SessionInfo has all required fields', () => {
    const session: SessionInfo = {
      id: 'sess-1',
      type: 'terminal',
      title: 'bash',
      position: { x: 100, y: 200 },
      size: { width: 640, height: 480 },
      zIndex: 5,
      meta: { cwd: '/home' },
    }
    expect(session.id).toBe('sess-1')
    expect(session.type).toBe('terminal')
    expect(session.position).toEqual({ x: 100, y: 200 })
    expect(session.size).toEqual({ width: 640, height: 480 })
    expect(session.meta).toEqual({ cwd: '/home' })
  })

  it('SessionInfo supports optional fields', () => {
    const session: SessionInfo = {
      id: 'sess-2',
      type: 'file',
      title: 'readme.md',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      zIndex: 1,
      groupId: 'group-1',
      locked: true,
      meta: {},
    }
    expect(session.groupId).toBe('group-1')
    expect(session.locked).toBe(true)
  })

  it('Disposable.dispose is callable', () => {
    let disposed = false
    const disposable: Disposable = {
      dispose: () => {
        disposed = true
      },
    }
    disposable.dispose()
    expect(disposed).toBe(true)
  })

  it('PluginPreferences has all expected fields', () => {
    const prefs: PluginPreferences = {
      theme: 'dark',
      gridSize: 20,
      sidebarPosition: 'right',
      fontFamily: 'Fira Code',
      fontSize: 14,
      terminalOpacity: 0.9,
    }
    expect(prefs.sidebarPosition).toBe('right')
    expect(prefs.terminalOpacity).toBe(0.9)
  })

  it('plugin state get/set contract: set then get returns same value', async () => {
    // Simulate the plugin state contract
    const store = new Map<string, unknown>()
    const ctx: Pick<PluginContext, 'getPluginState' | 'setPluginState'> = {
      getPluginState: async <T = unknown>(key: string): Promise<T | undefined> =>
        store.get(key) as T | undefined,
      setPluginState: async <T = unknown>(key: string, value: T): Promise<void> => {
        store.set(key, value)
      },
    }

    // Set some state
    await ctx.setPluginState('counter', 42)
    await ctx.setPluginState('config', { dark: true, fontSize: 14 })

    // Get it back
    const counter = await ctx.getPluginState<number>('counter')
    expect(counter).toBe(42)

    const config = await ctx.getPluginState<{ dark: boolean; fontSize: number }>('config')
    expect(config).toEqual({ dark: true, fontSize: 14 })

    // Undefined for missing keys
    const missing = await ctx.getPluginState('nonexistent')
    expect(missing).toBeUndefined()
  })

  it('plugin state can be overwritten', async () => {
    const store = new Map<string, unknown>()
    const ctx: Pick<PluginContext, 'getPluginState' | 'setPluginState'> = {
      getPluginState: async <T = unknown>(key: string): Promise<T | undefined> =>
        store.get(key) as T | undefined,
      setPluginState: async <T = unknown>(key: string, value: T): Promise<void> => {
        store.set(key, value)
      },
    }

    await ctx.setPluginState('key', 'first')
    await ctx.setPluginState('key', 'second')
    expect(await ctx.getPluginState('key')).toBe('second')
  })
})
