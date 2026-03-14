import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron
const handlers: Record<string, (...args: any[]) => any> = {}
const listeners: Record<string, (...args: any[]) => any> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: any) => {
      handlers[channel] = handler
    }),
    on: vi.fn((channel: string, handler: any) => {
      listeners[channel] = handler
    }),
  },
  BrowserWindow: vi.fn(),
}))

// Mock configStore
const mockConfig: Record<string, any> = {
  preferences: {
    defaultShell: '',
    autoLaunchClaude: false,
    claudeCommand: 'claude',
    gridSize: 20,
    sidebarPosition: 'left',
    sidebarWidth: 240,
    theme: 'dark',
    defaultCwd: '',
  },
  defaultLayout: null,
  namedLayouts: {},
}

vi.mock('../../config/ConfigStore', () => ({
  configStore: {
    get: vi.fn((key: string, defaultVal?: any) => {
      const parts = key.split('.')
      let val: any = mockConfig
      for (const p of parts) {
        val = val?.[p]
      }
      return val ?? defaultVal
    }),
    set: vi.fn((key: string, value: any) => {
      const parts = key.split('.')
      if (parts.length === 1) {
        mockConfig[key] = value
      } else {
        let obj: any = mockConfig
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]]
        }
        obj[parts[parts.length - 1]] = value
      }
    }),
  },
  defaultPreferences: {
    defaultShell: '',
    autoLaunchClaude: false,
    claudeCommand: 'claude',
    gridSize: 20,
    sidebarPosition: 'left',
    sidebarWidth: 240,
    theme: 'dark',
    defaultCwd: '',
  },
}))

import { registerIpcHandlers } from '../ipcHandlers'
import { PtyManager } from '../../pty/PtyManager'

describe('registerIpcHandlers', () => {
  let ptyManager: PtyManager
  let mockWindow: any
  let getMainWindow: () => any

  beforeEach(() => {
    // Reset handlers
    Object.keys(handlers).forEach(k => delete handlers[k])
    Object.keys(listeners).forEach(k => delete listeners[k])

    // Reset config
    mockConfig.preferences = {
      defaultShell: '',
      autoLaunchClaude: false,
      claudeCommand: 'claude',
      gridSize: 20,
      sidebarPosition: 'left',
      sidebarWidth: 240,
      theme: 'dark',
      defaultCwd: '',
    }
    mockConfig.defaultLayout = null
    mockConfig.namedLayouts = {}

    ptyManager = {
      spawn: vi.fn(() => ({
        id: 'test-id',
        pid: 123,
        on: vi.fn(),
        write: vi.fn(),
      })),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    } as any

    mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
      },
    }
    getMainWindow = () => mockWindow

    registerIpcHandlers(ptyManager, getMainWindow, '/home/user/project')
  })

  describe('PTY_SPAWN', () => {
    it('spawns a PTY and returns id and pid', () => {
      const result = handlers['pty:spawn']({}, {
        id: 'sess-1',
        cwd: '/tmp',
        cols: 80,
        rows: 24,
      })

      expect(ptyManager.spawn).toHaveBeenCalledWith(expect.objectContaining({
        id: 'sess-1',
        cwd: '/tmp',
        cols: 80,
        rows: 24,
      }))
      expect(result).toEqual({ id: 'test-id', pid: 123 })
    })

    it('uses configured default shell when no shell specified', () => {
      mockConfig.preferences.defaultShell = '/usr/bin/fish'

      handlers['pty:spawn']({}, {
        id: 'sess-2',
        cwd: '/tmp',
      })

      expect(ptyManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ shell: '/usr/bin/fish' })
      )
    })

    it('uses request shell over default shell', () => {
      mockConfig.preferences.defaultShell = '/usr/bin/fish'

      handlers['pty:spawn']({}, {
        id: 'sess-3',
        cwd: '/tmp',
        shell: '/bin/zsh',
      })

      expect(ptyManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ shell: '/bin/zsh' })
      )
    })
  })

  describe('PTY_DATA_TO_PTY', () => {
    it('writes data to the correct PTY', () => {
      listeners['pty:data:to-pty']({}, { id: 'sess-1', data: 'hello' })
      expect(ptyManager.write).toHaveBeenCalledWith('sess-1', 'hello')
    })
  })

  describe('PTY_RESIZE', () => {
    it('resizes the correct PTY', () => {
      listeners['pty:resize']({}, { id: 'sess-1', cols: 120, rows: 40 })
      expect(ptyManager.resize).toHaveBeenCalledWith('sess-1', 120, 40)
    })
  })

  describe('PTY_KILL', () => {
    it('kills the correct PTY', () => {
      listeners['pty:kill']({}, { id: 'sess-1' })
      expect(ptyManager.kill).toHaveBeenCalledWith('sess-1')
    })
  })

  describe('Layout handlers', () => {
    it('saves default layout', () => {
      const layout = { name: '__default__', sessions: [], viewport: { panX: 0, panY: 0, zoom: 1 }, gridSize: 20 }
      handlers['layout:save']({}, { name: '__default__', layout })
      expect(mockConfig.defaultLayout).toEqual(layout)
    })

    it('saves named layout', () => {
      const layout = { name: 'work', sessions: [], viewport: { panX: 0, panY: 0, zoom: 1 }, gridSize: 20 }
      handlers['layout:save']({}, { name: 'work', layout })
      expect(mockConfig.namedLayouts['work']).toEqual(layout)
    })

    it('loads default layout', () => {
      const layout = { name: '__default__', sessions: [], viewport: { panX: 0, panY: 0, zoom: 1 }, gridSize: 20 }
      mockConfig.defaultLayout = layout
      const result = handlers['layout:load']({}, { name: '__default__' })
      expect(result).toEqual(layout)
    })

    it('loads named layout', () => {
      const layout = { name: 'work', sessions: [], viewport: { panX: 0, panY: 0, zoom: 1 }, gridSize: 20 }
      mockConfig.namedLayouts = { work: layout }
      const result = handlers['layout:load']({}, { name: 'work' })
      expect(result).toEqual(layout)
    })

    it('returns null for nonexistent layout', () => {
      const result = handlers['layout:load']({}, { name: 'nonexistent' })
      expect(result).toBeNull()
    })

    it('lists named layouts', () => {
      mockConfig.namedLayouts = { work: {}, play: {} }
      const result = handlers['layout:list']()
      expect(result).toEqual(['work', 'play'])
    })

    it('deletes a named layout', () => {
      mockConfig.namedLayouts = { work: {}, play: {} }
      handlers['layout:delete']({}, { name: 'work' })
      expect(mockConfig.namedLayouts['work']).toBeUndefined()
    })
  })

  describe('Config handlers', () => {
    it('gets preferences', () => {
      const result = handlers['config:get']()
      expect(result).toEqual(expect.objectContaining({
        gridSize: 20,
        theme: 'dark',
      }))
    })

    it('sets a valid preference', () => {
      handlers['config:set']({}, { key: 'theme', value: 'light' })
      expect(mockConfig.preferences.theme).toBe('light')
    })

    it('rejects invalid preference keys', () => {
      handlers['config:set']({}, { key: 'invalidKey', value: 'bad' })
      expect(mockConfig.preferences).not.toHaveProperty('invalidKey')
    })
  })

  describe('APP_GET_LAUNCH_CWD', () => {
    it('returns the launch cwd', () => {
      const result = handlers['app:get-launch-cwd']()
      expect(result).toBe('/home/user/project')
    })
  })
})
