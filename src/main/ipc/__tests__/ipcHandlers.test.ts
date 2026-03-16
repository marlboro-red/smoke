import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

// Mock electron
const handlers: Record<string, (...args: any[]) => any> = {}
const listeners: Record<string, (...args: any[]) => any> = {}

let mockDialogSaveResult: any = { canceled: false, filePath: '/tmp/test-export.smoke-replay' }
let mockDialogOpenResult: any = { canceled: false, filePaths: ['/tmp/test-import.smoke-replay'] }

// Mock SearchIndex and StructureAnalyzer
const { mockSearchIndex, mockStructureAnalyzer } = vi.hoisted(() => ({
  mockSearchIndex: {
    build: vi.fn(),
    search: vi.fn(),
    getStats: vi.fn(),
    dispose: vi.fn(),
  },
  mockStructureAnalyzer: {
    analyze: vi.fn(),
    getCached: vi.fn(),
    getModule: vi.fn(),
  },
}))

vi.mock('../../codegraph/SearchIndex', () => ({
  SearchIndex: function SearchIndex() { return mockSearchIndex },
}))

vi.mock('../../codegraph/StructureAnalyzer', () => ({
  StructureAnalyzer: function StructureAnalyzer() { return mockStructureAnalyzer },
}))

// Mock child_process (used by ClaudeCodeManager, PluginInstaller, and async IPC handlers)
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn((_cmd: string, _args: string[], _opts: any, cb?: Function) => {
    // Support promisify pattern: callback is last argument
    const callback = cb || (typeof _opts === 'function' ? _opts : null)
    if (callback) callback(null, '', '')
  }),
}))

// Mock fs (sync methods used by ClaudeCodeManager for MCP config)
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
}))

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
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  dialog: {
    showSaveDialog: vi.fn(() => Promise.resolve(mockDialogSaveResult)),
    showOpenDialog: vi.fn(() => Promise.resolve(mockDialogOpenResult)),
  },
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
    onDidChange: vi.fn(),
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

import { registerIpcHandlers, type IpcCleanup } from '../ipcHandlers'
import { PtyManager } from '../../pty/PtyManager'

describe('registerIpcHandlers', () => {
  let ptyManager: PtyManager
  let mockWindow: any
  let getMainWindow: () => any
  let cleanup: IpcCleanup

  beforeEach(async () => {
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
      aiApiKey: '',
      aiModel: 'claude-sonnet-4-20250514',
    }
    mockConfig.defaultLayout = null
    mockConfig.namedLayouts = {}

    ptyManager = {
      spawn: vi.fn(() => {
        const eventListeners: Record<string, Array<(...args: any[]) => void>> = {}
        return {
          id: 'test-id',
          pid: 123,
          on: vi.fn((event: string, cb: (...args: any[]) => void) => {
            if (!eventListeners[event]) eventListeners[event] = []
            eventListeners[event].push(cb)
          }),
          once: vi.fn((event: string, cb: (...args: any[]) => void) => {
            if (!eventListeners[event]) eventListeners[event] = []
            const wrapper = (...args: any[]) => {
              const idx = eventListeners[event].indexOf(wrapper)
              if (idx >= 0) eventListeners[event].splice(idx, 1)
              cb(...args)
            }
            eventListeners[event].push(wrapper)
          }),
          removeListener: vi.fn((event: string, cb: (...args: any[]) => void) => {
            if (eventListeners[event]) {
              eventListeners[event] = eventListeners[event].filter(fn => fn !== cb)
            }
          }),
          write: vi.fn(),
          emit: (event: string, ...args: any[]) => {
            const cbs = eventListeners[event] || []
            cbs.forEach(cb => cb(...args))
          },
        }
      }),
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

    // Reset search/structure mocks
    mockSearchIndex.build.mockReset()
    mockSearchIndex.search.mockReset()
    mockSearchIndex.getStats.mockReset()
    mockStructureAnalyzer.analyze.mockReset()
    mockStructureAnalyzer.getCached.mockReset()
    mockStructureAnalyzer.getModule.mockReset()

    cleanup = await registerIpcHandlers(ptyManager, getMainWindow, '/home/user/project')
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

    it('sends startup command from request after first data event', async () => {
      const result = handlers['pty:spawn']({}, {
        id: 'sess-sc-1',
        cwd: '/tmp',
        startupCommand: 'echo hello',
      })

      const pty = (ptyManager.spawn as any).mock.results[0].value

      // Startup command should not have been written yet
      expect(pty.write).not.toHaveBeenCalled()

      // Simulate shell emitting first data (prompt)
      pty.emit('data', '$ ')

      // After the 50ms internal delay, the command should be written
      await vi.waitFor(() => {
        expect(pty.write).toHaveBeenCalledWith('echo hello\n')
      })
    })

    it('sends startup command from global preference when not in request', async () => {
      mockConfig.preferences.startupCommand = 'npm run dev'

      handlers['pty:spawn']({}, {
        id: 'sess-sc-2',
        cwd: '/tmp',
      })

      const pty = (ptyManager.spawn as any).mock.results[0].value

      // Simulate shell ready
      pty.emit('data', '$ ')

      await vi.waitFor(() => {
        expect(pty.write).toHaveBeenCalledWith('npm run dev\n')
      })
    })

    it('uses autoLaunchClaude fallback when no startup command is set', async () => {
      mockConfig.preferences.autoLaunchClaude = true
      mockConfig.preferences.claudeCommand = 'claude --chat'

      handlers['pty:spawn']({}, {
        id: 'sess-sc-3',
        cwd: '/tmp',
      })

      const pty = (ptyManager.spawn as any).mock.results[0].value
      pty.emit('data', '$ ')

      await vi.waitFor(() => {
        expect(pty.write).toHaveBeenCalledWith('claude --chat\n')
      })
    })

    it('does not send startup command when none is configured', () => {
      handlers['pty:spawn']({}, {
        id: 'sess-sc-4',
        cwd: '/tmp',
      })

      const pty = (ptyManager.spawn as any).mock.results[0].value

      // No once listener should have been registered for startup
      expect(pty.once).not.toHaveBeenCalled()
    })

    it('request startupCommand takes priority over global preference', async () => {
      mockConfig.preferences.startupCommand = 'global-cmd'

      handlers['pty:spawn']({}, {
        id: 'sess-sc-5',
        cwd: '/tmp',
        startupCommand: 'request-cmd',
      })

      const pty = (ptyManager.spawn as any).mock.results[0].value
      pty.emit('data', '$ ')

      await vi.waitFor(() => {
        expect(pty.write).toHaveBeenCalledWith('request-cmd\n')
      })
    })
  })

  describe('PTY_DATA_TO_PTY', () => {
    it('writes data to the correct PTY', () => {
      listeners['pty:data:to-pty']({}, { id: 'sess-1', data: 'hello' })
      expect(ptyManager.write).toHaveBeenCalledWith('sess-1', 'hello')
    })

    it('does not crash when ptyManager.write throws', () => {
      ;(ptyManager.write as any).mockImplementationOnce(() => { throw new Error('PTY gone') })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => listeners['pty:data:to-pty']({}, { id: 'sess-1', data: 'hello' })).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[pty:data:to-pty]'), expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe('PTY_RESIZE', () => {
    it('resizes the correct PTY', () => {
      listeners['pty:resize']({}, { id: 'sess-1', cols: 120, rows: 40 })
      expect(ptyManager.resize).toHaveBeenCalledWith('sess-1', 120, 40)
    })

    it('does not crash when ptyManager.resize throws', () => {
      ;(ptyManager.resize as any).mockImplementationOnce(() => { throw new Error('PTY gone') })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => listeners['pty:resize']({}, { id: 'sess-1', cols: 120, rows: 40 })).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[pty:resize]'), expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe('PTY_KILL', () => {
    it('kills the correct PTY', () => {
      listeners['pty:kill']({}, { id: 'sess-1' })
      expect(ptyManager.kill).toHaveBeenCalledWith('sess-1')
    })

    it('does not crash when ptyManager.kill throws', () => {
      ;(ptyManager.kill as any).mockImplementationOnce(() => { throw new Error('PTY gone') })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => listeners['pty:kill']({}, { id: 'sess-1' })).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[pty:kill]'), expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe('PTY event callback error handling', () => {
    it('does not crash when data event callback throws', () => {
      // Make terminalOutputBuffer.append throw by corrupting webContents.send
      mockWindow.webContents.send = vi.fn(() => { throw new Error('Window destroyed') })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      handlers['pty:spawn']({}, { id: 'sess-err-1', cwd: '/tmp' })
      const pty = (ptyManager.spawn as any).mock.results[(ptyManager.spawn as any).mock.results.length - 1].value

      // Trigger data event — should not throw
      expect(() => pty.emit('data', 'some output')).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[pty:data]'), expect.any(Error))

      consoleSpy.mockRestore()
    })

    it('does not crash when exit event callback throws', () => {
      mockWindow.webContents.send = vi.fn(() => { throw new Error('Window destroyed') })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      handlers['pty:spawn']({}, { id: 'sess-err-2', cwd: '/tmp' })
      const pty = (ptyManager.spawn as any).mock.results[(ptyManager.spawn as any).mock.results.length - 1].value

      // Trigger exit event — should not throw
      expect(() => pty.emit('exit', 0, undefined)).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[pty:exit]'), expect.any(Error))

      consoleSpy.mockRestore()
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

  describe('Plugin config handlers', () => {
    beforeEach(() => {
      mockConfig.pluginSettings = {}
      mockConfig.disabledPlugins = []
    })

    it('gets plugin config (empty by default)', () => {
      const result = handlers['plugin:config:get']({}, { pluginName: 'my-plugin' })
      expect(result).toEqual({})
    })

    it('gets plugin config for a configured plugin', () => {
      mockConfig.pluginSettings = { 'my-plugin': { refreshInterval: 10 } }
      const result = handlers['plugin:config:get']({}, { pluginName: 'my-plugin' })
      expect(result).toEqual({ refreshInterval: 10 })
    })

    it('sets a plugin config value', () => {
      handlers['plugin:config:set']({}, { pluginName: 'my-plugin', key: 'refreshInterval', value: 5 })
      expect(mockConfig.pluginSettings['my-plugin']).toEqual({ refreshInterval: 5 })
    })

    it('sets multiple plugin config values', () => {
      handlers['plugin:config:set']({}, { pluginName: 'my-plugin', key: 'a', value: 1 })
      handlers['plugin:config:set']({}, { pluginName: 'my-plugin', key: 'b', value: 'hello' })
      expect(mockConfig.pluginSettings['my-plugin']).toEqual({ a: 1, b: 'hello' })
    })

    it('disables a plugin', () => {
      handlers['plugin:set-enabled']({}, { pluginName: 'my-plugin', enabled: false })
      expect(mockConfig.disabledPlugins).toContain('my-plugin')
    })

    it('enables a previously disabled plugin', () => {
      mockConfig.disabledPlugins = ['my-plugin']
      handlers['plugin:set-enabled']({}, { pluginName: 'my-plugin', enabled: true })
      expect(mockConfig.disabledPlugins).not.toContain('my-plugin')
    })

    it('does not duplicate disabled entries', () => {
      handlers['plugin:set-enabled']({}, { pluginName: 'my-plugin', enabled: false })
      handlers['plugin:set-enabled']({}, { pluginName: 'my-plugin', enabled: false })
      expect(mockConfig.disabledPlugins.filter((n: string) => n === 'my-plugin')).toHaveLength(1)
    })

    it('gets disabled plugins list', () => {
      mockConfig.disabledPlugins = ['plugin-a', 'plugin-b']
      const result = handlers['plugin:get-disabled']()
      expect(result).toEqual(['plugin-a', 'plugin-b'])
    })
  })

  describe('cleanup / dispose', () => {
    it('returns an IpcCleanup object with a dispose method', () => {
      expect(cleanup).toBeDefined()
      expect(typeof cleanup.dispose).toBe('function')
    })

    it('dispose can be called without throwing', () => {
      expect(() => cleanup.dispose()).not.toThrow()
    })
  })

  describe('APP_GET_LAUNCH_CWD', () => {
    it('returns the launch cwd', () => {
      const result = handlers['app:get-launch-cwd']()
      expect(result).toBe('/home/user/project')
    })
  })

  describe('FS_READDIR', () => {
    let tmpDir: string

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-test-'))
      await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello world')
      await fs.mkdir(path.join(tmpDir, 'subdir'))
    })

    afterAll(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('lists directory contents with types and sizes', async () => {
      const result = await handlers['fs:readdir']({}, { path: tmpDir })
      const sorted = [...result].sort((a: any, b: any) => a.name.localeCompare(b.name))

      expect(sorted).toEqual([
        { name: 'hello.txt', type: 'file', size: 11 },
        { name: 'subdir', type: 'directory', size: 0 },
      ])
    })

    it('throws for nonexistent directory', async () => {
      await expect(
        handlers['fs:readdir']({}, { path: path.join(tmpDir, 'nope') })
      ).rejects.toThrow()
    })
  })

  describe('FS_READFILE', () => {
    let tmpDir: string

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-test-'))
      await fs.writeFile(path.join(tmpDir, 'test.txt'), 'file content here')
    })

    afterAll(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('reads file content and returns size', async () => {
      const filePath = path.join(tmpDir, 'test.txt')
      const result = await handlers['fs:readfile']({}, { path: filePath })
      expect(result).toEqual({ content: 'file content here', size: 17 })
    })

    it('throws for file exceeding maxSize', async () => {
      const filePath = path.join(tmpDir, 'test.txt')
      await expect(
        handlers['fs:readfile']({}, { path: filePath, maxSize: 5 })
      ).rejects.toThrow(/File too large/)
    })

    it('throws for nonexistent file', async () => {
      await expect(
        handlers['fs:readfile']({}, { path: path.join(tmpDir, 'nope.txt') })
      ).rejects.toThrow()
    })
  })

  describe('Recording handlers', () => {
    let recordingsDir: string

    beforeEach(async () => {
      recordingsDir = path.join(os.tmpdir(), 'recordings')
      await fs.mkdir(recordingsDir, { recursive: true })
    })

    afterEach(async () => {
      await fs.rm(recordingsDir, { recursive: true, force: true })
    })

    describe('RECORDING_FLUSH', () => {
      it('saves an event log to disk and returns file path', async () => {
        const log = {
          version: 1,
          startedAt: 1700000000000,
          events: [
            { timestamp: 0, type: 'viewport_changed', payload: { panX: 0, panY: 0, zoom: 1 } },
          ],
        }
        const result = await handlers['recording:flush']({}, log)
        expect(result).toContain('recording-')
        expect(result).toContain('.json')

        const content = await fs.readFile(result, 'utf-8')
        const parsed = JSON.parse(content)
        expect(parsed.version).toBe(1)
        expect(parsed.events).toHaveLength(1)
      })
    })

    describe('RECORDING_LIST', () => {
      it('lists saved recordings sorted newest first', async () => {
        const log1 = { version: 1, startedAt: 1700000000000, events: [{ timestamp: 0, type: 'viewport_changed', payload: {} }] }
        const log2 = { version: 1, startedAt: 1700001000000, events: [{ timestamp: 0, type: 'viewport_changed', payload: {} }, { timestamp: 5000, type: 'viewport_changed', payload: {} }] }

        await fs.writeFile(path.join(recordingsDir, 'recording-old.json'), JSON.stringify(log1))
        await fs.writeFile(path.join(recordingsDir, 'recording-new.json'), JSON.stringify(log2))

        const result = await handlers['recording:list']()
        expect(result).toHaveLength(2)
        expect(result[0].startedAt).toBeGreaterThan(result[1].startedAt)
        expect(result[0].eventCount).toBe(2)
        expect(result[0].durationMs).toBe(5000)
      })

      it('returns empty array when no recordings directory exists', async () => {
        await fs.rm(recordingsDir, { recursive: true, force: true })
        const result = await handlers['recording:list']()
        expect(result).toEqual([])
      })
    })

    describe('RECORDING_LOAD', () => {
      it('loads a specific recording by filename', async () => {
        const log = { version: 1, startedAt: 1700000000000, events: [{ timestamp: 0, type: 'viewport_changed', payload: {} }] }
        await fs.writeFile(path.join(recordingsDir, 'test-rec.json'), JSON.stringify(log))

        const result = await handlers['recording:load']({}, { filename: 'test-rec.json' })
        expect(result).toEqual(log)
      })

      it('returns null for nonexistent recording', async () => {
        const result = await handlers['recording:load']({}, { filename: 'nonexistent.json' })
        expect(result).toBeNull()
      })
    })

    describe('RECORDING_EXPORT', () => {
      it('exports a recording as .smoke-replay file', async () => {
        const log = {
          version: 1,
          startedAt: 1700000000000,
          events: [
            { timestamp: 0, type: 'viewport_changed', payload: { panX: 0, panY: 0, zoom: 1 } },
            { timestamp: 1000, type: 'session_created', payload: { sessionId: 's1' } },
          ],
        }
        await fs.writeFile(path.join(recordingsDir, 'source.json'), JSON.stringify(log))

        const exportPath = path.join(os.tmpdir(), 'test-export.smoke-replay')
        mockDialogSaveResult = { canceled: false, filePath: exportPath }

        const result = await handlers['recording:export']({}, { filename: 'source.json' })
        expect(result.filePath).toBe(exportPath)

        const content = await fs.readFile(exportPath, 'utf-8')
        const parsed = JSON.parse(content)
        expect(parsed.format).toBe('smoke-replay')
        expect(parsed.version).toBe(1)
        expect(parsed.startedAt).toBe(1700000000000)
        expect(parsed.eventCount).toBe(2)
        expect(parsed.events).toHaveLength(2)
        expect(parsed.exportedAt).toBeGreaterThan(0)

        await fs.unlink(exportPath).catch(() => {})
      })

      it('returns null filePath when dialog is canceled', async () => {
        const log = { version: 1, startedAt: 1700000000000, events: [] }
        await fs.writeFile(path.join(recordingsDir, 'source2.json'), JSON.stringify(log))

        mockDialogSaveResult = { canceled: true }

        const result = await handlers['recording:export']({}, { filename: 'source2.json' })
        expect(result.filePath).toBeNull()
      })
    })

    describe('RECORDING_IMPORT', () => {
      it('imports a .smoke-replay file into recordings', async () => {
        const exportData = {
          format: 'smoke-replay',
          version: 1,
          exportedAt: Date.now(),
          startedAt: 1700000000000,
          eventCount: 2,
          events: [
            { timestamp: 0, type: 'viewport_changed', payload: { panX: 0, panY: 0, zoom: 1 } },
            { timestamp: 3000, type: 'session_created', payload: { sessionId: 's1' } },
          ],
        }

        const importFile = path.join(os.tmpdir(), 'import-test.smoke-replay')
        await fs.writeFile(importFile, JSON.stringify(exportData))
        mockDialogOpenResult = { canceled: false, filePaths: [importFile] }

        const result = await handlers['recording:import']({})
        expect(result).not.toBeNull()
        expect(result.startedAt).toBe(1700000000000)
        expect(result.eventCount).toBe(2)
        expect(result.durationMs).toBe(3000)
        expect(result.filename).toContain('recording-imported-')

        // Verify the file was written to recordings dir
        const savedContent = await fs.readFile(path.join(recordingsDir, result.filename), 'utf-8')
        const saved = JSON.parse(savedContent)
        expect(saved.version).toBe(1)
        expect(saved.events).toHaveLength(2)

        await fs.unlink(importFile).catch(() => {})
      })

      it('imports a raw EventLog JSON file', async () => {
        const rawLog = {
          version: 1,
          startedAt: 1700000000000,
          events: [
            { timestamp: 0, type: 'viewport_changed', payload: { panX: 0, panY: 0, zoom: 1 } },
          ],
        }

        const importFile = path.join(os.tmpdir(), 'import-raw.json')
        await fs.writeFile(importFile, JSON.stringify(rawLog))
        mockDialogOpenResult = { canceled: false, filePaths: [importFile] }

        const result = await handlers['recording:import']({})
        expect(result).not.toBeNull()
        expect(result.eventCount).toBe(1)

        await fs.unlink(importFile).catch(() => {})
      })

      it('returns null when dialog is canceled', async () => {
        mockDialogOpenResult = { canceled: true, filePaths: [] }
        const result = await handlers['recording:import']({})
        expect(result).toBeNull()
      })
    })
  })

  describe('Search handlers', () => {
    it('builds search index and returns stats', async () => {
      mockSearchIndex.build.mockResolvedValue({ fileCount: 150, tokenCount: 8000 })

      const result = await handlers['search:build']({}, { rootPath: '/tmp/project' })

      expect(mockSearchIndex.build).toHaveBeenCalledWith('/tmp/project')
      expect(result).toEqual({ fileCount: 150, tokenCount: 8000 })
    })

    it('queries search index with default maxResults', () => {
      const mockResponse = {
        results: [
          { filePath: '/tmp/project/foo.ts', lineNumber: 10, lineContent: 'function foo() {', matchStart: 9, matchEnd: 12, score: 5 },
        ],
        totalMatches: 1,
        durationMs: 2,
      }
      mockSearchIndex.search.mockReturnValue(mockResponse)

      const result = handlers['search:query']({}, { query: 'foo' })

      expect(mockSearchIndex.search).toHaveBeenCalledWith('foo', undefined)
      expect(result).toEqual(mockResponse)
    })

    it('queries search index with custom maxResults', () => {
      mockSearchIndex.search.mockReturnValue({ results: [], totalMatches: 0, durationMs: 1 })

      handlers['search:query']({}, { query: 'bar', maxResults: 5 })

      expect(mockSearchIndex.search).toHaveBeenCalledWith('bar', 5)
    })

    it('returns search stats', () => {
      const mockStats = { fileCount: 150, tokenCount: 8000, rootPath: '/tmp/project', indexing: false }
      mockSearchIndex.getStats.mockReturnValue(mockStats)

      const result = handlers['search:stats']({})

      expect(result).toEqual(mockStats)
    })

    it('returns stats showing indexing in progress', () => {
      const mockStats = { fileCount: 50, tokenCount: 2000, rootPath: '/tmp/project', indexing: true }
      mockSearchIndex.getStats.mockReturnValue(mockStats)

      const result = handlers['search:stats']({})

      expect(result.indexing).toBe(true)
    })
  })

  describe('Structure handlers', () => {
    const sampleStructure = {
      projectRoot: '/tmp/project',
      modules: {
        '.': {
          id: '.',
          name: 'my-project',
          rootPath: '/tmp/project',
          entryPoint: 'src/index.ts',
          type: 'package',
          children: ['src'],
          keyFiles: ['package.json'],
        },
      },
      topLevelDirs: [
        { name: 'src', type: 'source', path: '/tmp/project/src' },
        { name: 'tests', type: 'tests', path: '/tmp/project/tests' },
      ],
    }

    it('analyzes project structure', async () => {
      mockStructureAnalyzer.analyze.mockResolvedValue(sampleStructure)

      const result = await handlers['structure:analyze']({}, { rootPath: '/tmp/project' })

      expect(mockStructureAnalyzer.analyze).toHaveBeenCalledWith('/tmp/project')
      expect(result).toEqual(sampleStructure)
    })

    it('returns cached structure map', () => {
      mockStructureAnalyzer.getCached.mockReturnValue(sampleStructure)

      const result = handlers['structure:get']({})

      expect(result).toEqual(sampleStructure)
      expect(result.modules['.']).toEqual(expect.objectContaining({
        id: '.',
        name: 'my-project',
        type: 'package',
      }))
    })

    it('returns null when no structure is cached', () => {
      mockStructureAnalyzer.getCached.mockReturnValue(null)

      const result = handlers['structure:get']({})

      expect(result).toBeNull()
    })

    it('returns details for a specific module', () => {
      const srcModule = {
        id: 'src',
        name: 'src',
        rootPath: '/tmp/project/src',
        entryPoint: 'index.ts',
        type: 'source',
        children: [],
        keyFiles: [],
      }
      mockStructureAnalyzer.getModule.mockReturnValue(srcModule)

      const result = handlers['structure:get-module']({}, { moduleId: 'src' })

      expect(mockStructureAnalyzer.getModule).toHaveBeenCalledWith('src')
      expect(result).toEqual(srcModule)
    })

    it('returns null for nonexistent module', () => {
      mockStructureAnalyzer.getModule.mockReturnValue(null)

      const result = handlers['structure:get-module']({}, { moduleId: 'nonexistent' })

      expect(result).toBeNull()
    })
  })
})
