/**
 * IPC Round-Trip Integration Tests
 *
 * These tests exercise the full IPC path: renderer (smokeAPI) → preload (ipcRenderer) →
 * main (ipcMain handlers) → preload → renderer, without launching Electron.
 *
 * The Electron IPC layer is replaced by an in-memory bridge that connects
 * ipcRenderer.invoke/send to their ipcMain.handle/on counterparts, verifying
 * data flows correctly and catches type mismatches / serialization issues.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

// ── In-memory IPC bridge ──────────────────────────────────────────────────────
// Maps channel → handler for ipcMain.handle / ipcMain.on
const handleHandlers: Record<string, (event: any, ...args: any[]) => any> = {}
const onHandlers: Record<string, (event: any, ...args: any[]) => any> = {}

// Collects messages pushed from main → renderer via webContents.send
const rendererMessages: Array<{ channel: string; data: any }> = []

// Mock BrowserWindow with webContents.send that captures outbound messages
const mockWindow = {
  isDestroyed: vi.fn(() => false),
  isMaximized: vi.fn(() => false),
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  webContents: {
    send: vi.fn((channel: string, data: any) => {
      rendererMessages.push({ channel, data })
    }),
    capturePage: vi.fn().mockResolvedValue({ toPNG: () => Buffer.from('fake-png') }),
  },
}

// Mock SearchIndex and StructureAnalyzer
const { mockSearchIndex, mockStructureAnalyzer, mockCodegraph } = vi.hoisted(() => ({
  mockSearchIndex: {
    build: vi.fn().mockResolvedValue({ fileCount: 0, tokenCount: 0 }),
    search: vi.fn().mockReturnValue({ results: [], totalMatches: 0, durationMs: 0 }),
    getStats: vi.fn().mockReturnValue({ fileCount: 0, tokenCount: 0, rootPath: null, indexing: false }),
    dispose: vi.fn(),
  },
  mockStructureAnalyzer: {
    analyze: vi.fn().mockResolvedValue({ projectRoot: '', modules: {}, topLevelDirs: [] }),
    getCached: vi.fn().mockReturnValue(null),
    getModule: vi.fn().mockReturnValue(null),
  },
  mockCodegraph: {
    buildCodeGraph: vi.fn(),
    expandCodeGraph: vi.fn(),
    buildDependentsGraph: vi.fn(),
    getDependents: vi.fn(),
    ensureIndex: vi.fn(),
    getIndexStats: vi.fn().mockReturnValue(null),
    invalidateIndex: vi.fn(),
    parseImports: vi.fn().mockReturnValue([]),
    detectLanguage: vi.fn().mockReturnValue('typescript'),
    resolveImport: vi.fn().mockReturnValue({ resolvedPath: null }),
    loadPathAliases: vi.fn().mockResolvedValue({}),
    computeLayout: vi.fn().mockReturnValue({ positions: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
    computeIncrementalLayout: vi.fn().mockReturnValue({ positions: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
    computeWorkspaceLayout: vi.fn().mockReturnValue({ positions: [], arrows: [], regions: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
    scoreRelevance: vi.fn().mockResolvedValue({ rankedFiles: [], keywords: [] }),
    parseTask: vi.fn().mockResolvedValue({ intent: 'investigate', keywords: [], filePatterns: [], includeFileTypes: [], usedAi: false }),
    collectContext: vi.fn().mockResolvedValue({ files: [], parsedTask: {}, structureMap: null, timing: {} }),
  },
}))

vi.mock('../../codegraph/SearchIndex', () => ({
  SearchIndex: function SearchIndex() { return mockSearchIndex },
}))

vi.mock('../../codegraph/StructureAnalyzer', () => ({
  StructureAnalyzer: function StructureAnalyzer() { return mockStructureAnalyzer },
}))

vi.mock('../../codegraph', () => mockCodegraph)

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn((_cmd: string, _args: string[], _opts: any, cb?: Function) => {
    const callback = cb || (typeof _opts === 'function' ? _opts : null)
    if (callback) callback(null, '', '')
  }),
}))

// Mock fs (sync methods)
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
}))

// Mock electron with bridge wiring
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: any) => {
      handleHandlers[channel] = handler
    }),
    on: vi.fn((channel: string, handler: any) => {
      onHandlers[channel] = handler
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(async (channel: string, ...args: any[]) => {
      const handler = handleHandlers[channel]
      if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
      // Simulate serialization round-trip (structuredClone)
      const serializedArgs = args.map(a => JSON.parse(JSON.stringify(a)))
      const result = await handler({}, ...serializedArgs)
      // Simulate serialization of return value
      return result === undefined ? undefined : JSON.parse(JSON.stringify(result))
    }),
    send: vi.fn((channel: string, ...args: any[]) => {
      const handler = onHandlers[channel]
      if (handler) {
        const serializedArgs = args.map(a => JSON.parse(JSON.stringify(a)))
        handler({}, ...serializedArgs)
      }
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  dialog: {
    showSaveDialog: vi.fn(() => Promise.resolve({ canceled: true })),
    showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
}))

// Mock configStore
const mockConfig: Record<string, any> = {}

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
          if (!obj[parts[i]]) obj[parts[i]] = {}
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
    startupCommand: '',
  },
}))

import { registerIpcHandlers, type IpcCleanup } from '../ipcHandlers'
import { PtyManager } from '../../pty/PtyManager'
import { ipcRenderer } from 'electron'

// Build a smokeAPI-like bridge that mirrors what src/preload/index.ts does,
// but using our mocked ipcRenderer that routes through the in-memory bridge.
function buildBridge() {
  return {
    pty: {
      spawn: (options: any) => ipcRenderer.invoke('pty:spawn', options),
      write: (id: string, data: string) => ipcRenderer.send('pty:data:to-pty', { id, data }),
      resize: (id: string, cols: number, rows: number) => ipcRenderer.send('pty:resize', { id, cols, rows }),
      kill: (id: string) => ipcRenderer.send('pty:kill', { id }),
    },
    layout: {
      save: (name: string, layout: any) => ipcRenderer.invoke('layout:save', { name, layout }),
      load: (name: string) => ipcRenderer.invoke('layout:load', { name }),
      list: () => ipcRenderer.invoke('layout:list'),
      delete: (name: string) => ipcRenderer.invoke('layout:delete', { name }),
    },
    config: {
      get: () => ipcRenderer.invoke('config:get'),
      set: (key: string, value: unknown) => ipcRenderer.invoke('config:set', { key, value }),
    },
    fs: {
      readdir: (dirPath: string) => ipcRenderer.invoke('fs:readdir', { path: dirPath }),
      readfile: (filePath: string, maxSize?: number) => ipcRenderer.invoke('fs:readfile', { path: filePath, maxSize }),
      writefile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writefile', { path: filePath, content }),
    },
    ai: {
      send: (agentId: string, message: string, conversationId?: string) =>
        ipcRenderer.invoke('ai:send', { agentId, message, conversationId }),
      abort: (agentId: string, conversationId?: string) =>
        ipcRenderer.invoke('ai:abort', { agentId, conversationId }),
      clear: (agentId: string, conversationId?: string) =>
        ipcRenderer.invoke('ai:clear', { agentId, conversationId }),
    },
    agent: {
      create: (name: string) => ipcRenderer.invoke('agent:create', { name }),
      remove: (agentId: string) => ipcRenderer.invoke('agent:remove', { agentId }),
      list: () => ipcRenderer.invoke('agent:list'),
    },
    search: {
      build: (rootPath: string) => ipcRenderer.invoke('search:build', { rootPath }),
      query: (query: string, maxResults?: number) => ipcRenderer.invoke('search:query', { query, maxResults }),
      getStats: () => ipcRenderer.invoke('search:stats'),
    },
    structure: {
      analyze: (rootPath: string) => ipcRenderer.invoke('structure:analyze', { rootPath }),
      get: () => ipcRenderer.invoke('structure:get'),
      getModule: (moduleId: string) => ipcRenderer.invoke('structure:get-module', { moduleId }),
    },
    app: {
      getLaunchCwd: () => ipcRenderer.invoke('app:get-launch-cwd'),
      getGitBranch: () => ipcRenderer.invoke('app:get-git-branch'),
    },
    tab: {
      getState: () => ipcRenderer.invoke('tab:get-state'),
      saveState: (state: any) => ipcRenderer.invoke('tab:save-state', state),
    },
    window: {
      minimize: () => ipcRenderer.invoke('window:minimize'),
      maximize: () => ipcRenderer.invoke('window:maximize'),
      close: () => ipcRenderer.invoke('window:close'),
      isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    },
    codegraph: {
      build: (filePath: string, projectRoot: string, maxDepth?: number) =>
        ipcRenderer.invoke('codegraph:build', { filePath, projectRoot, maxDepth }),
      expand: (existingGraph: any, existingPositions: any, expandPath: string, projectRoot: string, maxDepth?: number) =>
        ipcRenderer.invoke('codegraph:expand', {
          existingGraph, existingPositions, expandPath, projectRoot, maxDepth,
        }),
      getImports: (filePath: string) =>
        ipcRenderer.invoke('codegraph:get-imports', { filePath })
          .then((r: any) => r.imports),
      indexStats: () => ipcRenderer.invoke('codegraph:index-stats'),
    },
  }
}

describe('IPC Round-Trip Integration', () => {
  let ptyManager: PtyManager
  let cleanup: IpcCleanup
  let api: ReturnType<typeof buildBridge>
  let tmpDir: string
  // fs:writefile enforces paths within the user's home directory,
  // so we create the temp dir under $HOME instead of os.tmpdir()
  // (which resolves to /private/var/... on macOS, outside $HOME).
  let writableTmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-ipc-roundtrip-'))
    writableTmpDir = await fs.mkdtemp(path.join(os.homedir(), 'smoke-ipc-test-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.rm(writableTmpDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    // Clear bridge state
    Object.keys(handleHandlers).forEach(k => delete handleHandlers[k])
    Object.keys(onHandlers).forEach(k => delete onHandlers[k])
    rendererMessages.length = 0
    mockWindow.webContents.send.mockClear()

    // Reset config
    Object.keys(mockConfig).forEach(k => delete mockConfig[k])
    mockConfig.preferences = {
      defaultShell: '',
      autoLaunchClaude: false,
      claudeCommand: 'claude',
      gridSize: 20,
      sidebarPosition: 'left',
      sidebarWidth: 240,
      theme: 'dark',
      defaultCwd: '',
      startupCommand: '',
    }
    mockConfig.defaultLayout = null
    mockConfig.namedLayouts = {}
    mockConfig.canvasBookmarks = {}
    mockConfig.pluginSettings = {}
    mockConfig.disabledPlugins = []

    // Create PTY manager mock
    const mockPtyInstances: Record<string, any> = {}
    ptyManager = {
      spawn: vi.fn((opts: any) => {
        const eventListeners: Record<string, Array<(...args: any[]) => void>> = {}
        const pty = {
          id: opts.id,
          pid: Math.floor(Math.random() * 100000),
          on: vi.fn((event: string, cb: (...args: any[]) => void) => {
            if (!eventListeners[event]) eventListeners[event] = []
            eventListeners[event].push(cb)
          }),
          once: vi.fn((event: string, cb: (...args: any[]) => void) => {
            if (!eventListeners[event]) eventListeners[event] = []
            eventListeners[event].push(cb)
          }),
          removeListener: vi.fn(),
          write: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          emit: (event: string, ...args: any[]) => {
            (eventListeners[event] || []).forEach(cb => cb(...args))
          },
        }
        mockPtyInstances[opts.id] = pty
        return pty
      }),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      gracefulKill: vi.fn(),
      get: vi.fn((id: string) => mockPtyInstances[id] || null),
      isUserInitiatedKill: vi.fn(() => false),
      clearUserInitiatedKill: vi.fn(),
    } as any

    cleanup = await registerIpcHandlers(ptyManager, () => mockWindow as any, tmpDir)
    api = buildBridge()
  })

  afterEach(() => {
    cleanup?.dispose()
  })

  // ── PTY round-trip ────────────────────────────────────────────────────────

  describe('pty:spawn → data → kill round-trip', () => {
    it('spawns a PTY via the preload bridge and receives id + pid', async () => {
      const result = await api.pty.spawn({
        id: 'rt-sess-1',
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      })

      expect(result).toEqual(
        expect.objectContaining({
          id: 'rt-sess-1',
          pid: expect.any(Number),
        })
      )
    })

    it('writes data through the bridge to the PTY manager', async () => {
      await api.pty.spawn({ id: 'rt-write-1', cwd: tmpDir })

      api.pty.write('rt-write-1', 'ls -la\n')

      expect(ptyManager.write).toHaveBeenCalledWith('rt-write-1', 'ls -la\n')
    })

    it('resize flows through the bridge', async () => {
      await api.pty.spawn({ id: 'rt-resize-1', cwd: tmpDir })

      api.pty.resize('rt-resize-1', 120, 40)

      expect(ptyManager.resize).toHaveBeenCalledWith('rt-resize-1', 120, 40)
    })

    it('kill flows through the bridge', async () => {
      await api.pty.spawn({ id: 'rt-kill-1', cwd: tmpDir })

      api.pty.kill('rt-kill-1')

      expect(ptyManager.gracefulKill).toHaveBeenCalledWith('rt-kill-1')
    })

    it('data from PTY is pushed to renderer via webContents.send', async () => {
      await api.pty.spawn({ id: 'rt-data-push', cwd: tmpDir })

      // Simulate PTY emitting data
      const pty = (ptyManager.spawn as any).mock.results[0].value
      pty.emit('data', 'shell output here')

      // The batcher may batch; give it a tick
      await new Promise(r => setTimeout(r, 50))

      const dataMessages = rendererMessages.filter(m => m.channel === 'pty:data:from-pty')
      expect(dataMessages.length).toBeGreaterThanOrEqual(1)

      const allData = dataMessages.map(m => m.data.data).join('')
      expect(allData).toContain('shell output here')
      expect(dataMessages[0].data.id).toBe('rt-data-push')
    })

    it('PTY exit event is pushed to renderer', async () => {
      await api.pty.spawn({ id: 'rt-exit-1', cwd: tmpDir })

      const pty = (ptyManager.spawn as any).mock.results[0].value
      pty.emit('exit', 0, undefined)

      const exitMessages = rendererMessages.filter(m => m.channel === 'pty:exit')
      expect(exitMessages).toHaveLength(1)
      expect(exitMessages[0].data).toEqual(
        expect.objectContaining({
          id: 'rt-exit-1',
          exitCode: 0,
        })
      )
    })
  })

  // ── File system round-trip ──────────────────────────────────────────────

  describe('fs:readfile / writefile / readdir round-trip', () => {
    it('writes a file and reads it back through the bridge', async () => {
      const filePath = path.join(writableTmpDir, 'roundtrip-test.txt')
      const content = 'Hello from IPC round-trip test!'

      const writeResult = await api.fs.writefile(filePath, content)
      expect(writeResult).toEqual({ size: expect.any(Number) })
      expect(writeResult.size).toBe(Buffer.byteLength(content))

      const readResult = await api.fs.readfile(filePath)
      expect(readResult).toEqual({
        content: 'Hello from IPC round-trip test!',
        size: Buffer.byteLength(content),
      })
    })

    it('readdir lists files written through the bridge', async () => {
      const subDir = path.join(tmpDir, 'readdir-test')
      await fs.mkdir(subDir, { recursive: true })
      await fs.writeFile(path.join(subDir, 'a.txt'), 'aaa')
      await fs.writeFile(path.join(subDir, 'b.txt'), 'bb')

      const entries = await api.fs.readdir(subDir)
      const sorted = [...entries].sort((a: any, b: any) => a.name.localeCompare(b.name))

      expect(sorted).toEqual([
        { name: 'a.txt', type: 'file', size: 3 },
        { name: 'b.txt', type: 'file', size: 2 },
      ])
    })

    it('readfile rejects files exceeding maxSize', async () => {
      const filePath = path.join(tmpDir, 'big-file.txt')
      await fs.writeFile(filePath, 'x'.repeat(100))

      await expect(api.fs.readfile(filePath, 10)).rejects.toThrow(/File too large/)
    })

    it('readdir returns typed entries for directories', async () => {
      const subDir = path.join(tmpDir, 'type-test')
      await fs.mkdir(subDir, { recursive: true })
      await fs.writeFile(path.join(subDir, 'file.txt'), 'content')
      await fs.mkdir(path.join(subDir, 'nested'), { recursive: true })

      const entries = await api.fs.readdir(subDir)
      const file = entries.find((e: any) => e.name === 'file.txt')
      const dir = entries.find((e: any) => e.name === 'nested')

      expect(file).toEqual(expect.objectContaining({ type: 'file' }))
      expect(dir).toEqual(expect.objectContaining({ type: 'directory', size: 0 }))
    })
  })

  // ── Layout save/load round-trip ─────────────────────────────────────────

  describe('layout:save / load round-trip', () => {
    const testLayout = {
      name: 'test-layout',
      sessions: [
        {
          title: 'Terminal 1',
          cwd: '/tmp',
          position: { x: 0, y: 0 },
          size: { width: 600, height: 400, cols: 80, rows: 24 },
        },
      ],
      viewport: { panX: 100, panY: 200, zoom: 1.5 },
      gridSize: 20,
    }

    it('saves and loads the default layout', async () => {
      await api.layout.save('__default__', testLayout)

      const loaded = await api.layout.load('__default__')
      expect(loaded).toEqual(testLayout)
    })

    it('saves and loads a named layout', async () => {
      await api.layout.save('my-workspace', testLayout)

      const loaded = await api.layout.load('my-workspace')
      expect(loaded).toEqual(testLayout)
    })

    it('lists named layouts', async () => {
      await api.layout.save('layout-a', testLayout)
      await api.layout.save('layout-b', testLayout)

      const names = await api.layout.list()
      expect(names).toContain('layout-a')
      expect(names).toContain('layout-b')
    })

    it('deletes a named layout', async () => {
      await api.layout.save('to-delete', testLayout)
      await api.layout.delete('to-delete')

      const loaded = await api.layout.load('to-delete')
      expect(loaded).toBeNull()
    })

    it('returns null for a layout that was never saved', async () => {
      const loaded = await api.layout.load('nonexistent')
      expect(loaded).toBeNull()
    })

    it('preserves layout data types through serialization', async () => {
      const layoutWithTypes = {
        ...testLayout,
        viewport: { panX: -123.456, panY: 0, zoom: 0.3 },
        gridSize: 50,
      }
      await api.layout.save('typed', layoutWithTypes)

      const loaded = await api.layout.load('typed')
      expect(loaded!.viewport.panX).toBe(-123.456)
      expect(loaded!.viewport.zoom).toBe(0.3)
      expect(loaded!.gridSize).toBe(50)
    })
  })

  // ── Config get/set round-trip ───────────────────────────────────────────

  describe('config:get / set round-trip', () => {
    it('reads default preferences', async () => {
      const prefs = await api.config.get()
      expect(prefs).toEqual(
        expect.objectContaining({
          gridSize: 20,
          theme: 'dark',
          sidebarPosition: 'left',
        })
      )
    })

    it('sets a preference and reads it back', async () => {
      await api.config.set('theme', 'light')

      const prefs = await api.config.get()
      expect(prefs.theme).toBe('light')
    })

    it('sets gridSize as a number and preserves the type', async () => {
      await api.config.set('gridSize', 40)

      const prefs = await api.config.get()
      expect(prefs.gridSize).toBe(40)
      expect(typeof prefs.gridSize).toBe('number')
    })

    it('rejects invalid preference keys (no-op)', async () => {
      await api.config.set('notARealKey', 'value')

      const prefs = await api.config.get()
      expect(prefs).not.toHaveProperty('notARealKey')
    })

    it('sets sidebarWidth and reads it back', async () => {
      await api.config.set('sidebarWidth', 300)

      const prefs = await api.config.get()
      expect(prefs.sidebarWidth).toBe(300)
    })
  })

  // ── AI send/abort round-trip ────────────────────────────────────────────

  describe('ai:send / abort round-trip', () => {
    it('returns error for non-existent agent', async () => {
      const result = await api.ai.send('nonexistent-agent', 'hello')

      expect(result).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('not found'),
        })
      )
    })

    it('creates an agent and uses its ID in ai:send', async () => {
      const agent = await api.agent.create('test-agent')
      expect(agent).toEqual(
        expect.objectContaining({
          agentId: expect.any(String),
          color: expect.any(String),
        })
      )

      // ai:send with the agent — will fail because no API key, but the error
      // should come from the agent, not a "not found" error
      const result = await api.ai.send(agent.agentId, 'test message')
      // Either it returns a conversation ID or a specific error — not "not found"
      if (result.error) {
        expect(result.error).not.toContain('not found')
      }
    })

    it('abort does not throw for non-existent agent', async () => {
      // Should complete without error (no-op for missing agent)
      await expect(api.ai.abort('missing-agent')).resolves.not.toThrow()
    })

    it('clear does not throw for non-existent agent', async () => {
      await expect(api.ai.clear('missing-agent')).resolves.not.toThrow()
    })

    it('agent list reflects created agents', async () => {
      const agent1 = await api.agent.create('agent-1')
      const agent2 = await api.agent.create('agent-2')

      const agents = await api.agent.list()
      const ids = agents.map((a: any) => a.id)

      expect(ids).toContain(agent1.agentId)
      expect(ids).toContain(agent2.agentId)
    })

    it('remove agent removes it from the list', async () => {
      const agent = await api.agent.create('temp-agent')
      await api.agent.remove(agent.agentId)

      const agents = await api.agent.list()
      const ids = agents.map((a: any) => a.id)
      expect(ids).not.toContain(agent.agentId)
    })
  })

  // ── Search round-trip ───────────────────────────────────────────────────

  describe('search:build / query round-trip', () => {
    it('builds search index via the bridge', async () => {
      mockSearchIndex.build.mockResolvedValue({ fileCount: 42, tokenCount: 1000 })

      const result = await api.search.build('/fake/project')

      expect(result).toEqual({ fileCount: 42, tokenCount: 1000 })
      expect(mockSearchIndex.build).toHaveBeenCalledWith('/fake/project')
    })

    it('queries search index and returns serializable results', async () => {
      mockSearchIndex.search.mockReturnValue({
        results: [
          { filePath: '/a.ts', lineNumber: 5, lineContent: 'const x = 1', matchStart: 6, matchEnd: 7, score: 10 },
        ],
        totalMatches: 1,
        durationMs: 3,
      })

      const result = await api.search.query('const', 10)

      expect(result.results).toHaveLength(1)
      expect(result.results[0].filePath).toBe('/a.ts')
      expect(result.totalMatches).toBe(1)
    })

    it('returns stats via the bridge', async () => {
      mockSearchIndex.getStats.mockReturnValue({
        fileCount: 100, tokenCount: 5000, rootPath: '/project', indexing: false,
      })

      const stats = await api.search.getStats()

      expect(stats).toEqual({
        fileCount: 100,
        tokenCount: 5000,
        rootPath: '/project',
        indexing: false,
      })
    })
  })

  // ── Structure analyzer round-trip ───────────────────────────────────────

  describe('structure:analyze / get / getModule round-trip', () => {
    const sampleStructure = {
      projectRoot: '/project',
      modules: {
        '.': {
          id: '.',
          name: 'root',
          rootPath: '/project',
          entryPoint: 'src/index.ts',
          type: 'package',
          children: [],
          keyFiles: ['package.json'],
        },
      },
      topLevelDirs: [{ name: 'src', type: 'source', path: '/project/src' }],
    }

    it('analyzes structure and returns through the bridge', async () => {
      mockStructureAnalyzer.analyze.mockResolvedValue(sampleStructure)

      const result = await api.structure.analyze('/project')

      expect(result).toEqual(sampleStructure)
      expect(result.modules['.']).toEqual(
        expect.objectContaining({ id: '.', type: 'package' })
      )
    })

    it('gets cached structure', async () => {
      mockStructureAnalyzer.getCached.mockReturnValue(sampleStructure)

      const result = await api.structure.get()

      expect(result).toEqual(sampleStructure)
    })

    it('returns null when no structure is cached', async () => {
      mockStructureAnalyzer.getCached.mockReturnValue(null)

      const result = await api.structure.get()

      expect(result).toBeNull()
    })

    it('gets a specific module', async () => {
      mockStructureAnalyzer.getModule.mockReturnValue(sampleStructure.modules['.'])

      const result = await api.structure.getModule('.')

      expect(result).toEqual(
        expect.objectContaining({ id: '.', name: 'root' })
      )
    })
  })

  // ── Code graph (graph:expand) round-trip ─────────────────────────────────

  describe('codegraph:build / expand round-trip', () => {
    const sampleGraph = {
      nodes: [
        { filePath: '/project/src/index.ts', imports: ['./utils'], importedBy: [], depth: 0 },
        { filePath: '/project/src/utils.ts', imports: [], importedBy: ['./index'], depth: 1 },
      ],
      edges: [
        { from: '/project/src/index.ts', to: '/project/src/utils.ts', type: 'import' as const },
      ],
    }

    const sampleLayout = {
      positions: [
        { filePath: '/project/src/index.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/utils.ts', x: 200, y: 0, depth: 1 },
      ],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 0 },
    }

    it('builds a code graph via the bridge', async () => {
      mockCodegraph.buildCodeGraph.mockResolvedValue({
        graph: sampleGraph,
        rootPath: '/project/src/index.ts',
        fileCount: 2,
        edgeCount: 1,
      })
      mockCodegraph.computeLayout.mockReturnValue(sampleLayout)

      const result = await api.codegraph.build('/project/src/index.ts', '/project')

      expect(result).toEqual(
        expect.objectContaining({
          graph: expect.objectContaining({
            nodes: expect.arrayContaining([
              expect.objectContaining({ filePath: '/project/src/index.ts' }),
            ]),
            edges: expect.arrayContaining([
              expect.objectContaining({
                from: '/project/src/index.ts',
                to: '/project/src/utils.ts',
              }),
            ]),
          }),
          fileCount: 2,
          edgeCount: 1,
          layout: expect.objectContaining({
            positions: expect.any(Array),
            bounds: expect.objectContaining({
              minX: expect.any(Number),
              maxX: expect.any(Number),
            }),
          }),
        })
      )
    })

    it('expands a code graph via the bridge (graph:expand)', async () => {
      const expandedGraph = {
        ...sampleGraph,
        nodes: [
          ...sampleGraph.nodes,
          { filePath: '/project/src/helpers.ts', imports: [], importedBy: ['./utils'], depth: 2 },
        ],
        edges: [
          ...sampleGraph.edges,
          { from: '/project/src/utils.ts', to: '/project/src/helpers.ts', type: 'import' as const },
        ],
      }

      mockCodegraph.expandCodeGraph.mockResolvedValue({
        graph: expandedGraph,
        rootPath: '/project/src/index.ts',
        fileCount: 3,
        edgeCount: 2,
      })

      const expandedLayout = {
        positions: [
          ...sampleLayout.positions,
          { filePath: '/project/src/helpers.ts', x: 400, y: 0, depth: 2 },
        ],
        bounds: { minX: 0, minY: 0, maxX: 400, maxY: 0 },
      }
      mockCodegraph.computeIncrementalLayout.mockReturnValue(expandedLayout)

      const result = await api.codegraph.expand(
        sampleGraph,
        sampleLayout.positions,
        '/project/src/utils.ts',
        '/project'
      )

      expect(result.graph.nodes).toHaveLength(3)
      expect(result.graph.edges).toHaveLength(2)
      expect(result.fileCount).toBe(3)
      expect(result.layout.positions).toHaveLength(3)

      // Verify the new node was added
      const newNode = result.graph.nodes.find(
        (n: any) => n.filePath === '/project/src/helpers.ts'
      )
      expect(newNode).toBeDefined()
      expect(newNode!.depth).toBe(2)

      // Verify expandCodeGraph was called with correct args
      expect(mockCodegraph.expandCodeGraph).toHaveBeenCalledWith(
        sampleGraph,
        '/project/src/utils.ts',
        '/project',
        undefined // maxDepth
      )
    })

    it('returns index stats via the bridge', async () => {
      mockCodegraph.getIndexStats.mockReturnValue({ root: '/project', fileCount: 50 })

      const stats = await api.codegraph.indexStats()

      expect(stats).toEqual({ root: '/project', fileCount: 50 })
    })

    it('returns null when no index exists', async () => {
      mockCodegraph.getIndexStats.mockReturnValue(null)

      const stats = await api.codegraph.indexStats()

      expect(stats).toBeNull()
    })
  })

  // ── App info round-trip ─────────────────────────────────────────────────

  describe('app:get-launch-cwd round-trip', () => {
    it('returns the launch cwd passed to registerIpcHandlers', async () => {
      const cwd = await api.app.getLaunchCwd()
      expect(cwd).toBe(tmpDir)
    })
  })

  // ── Tab state round-trip ────────────────────────────────────────────────

  describe('tab:get-state / save-state round-trip', () => {
    it('returns default tab state', async () => {
      const state = await api.tab.getState()
      expect(state).toEqual(
        expect.objectContaining({
          tabs: expect.any(Array),
          activeTabId: expect.any(String),
        })
      )
    })

    it('saves and loads tab state', async () => {
      const tabState = {
        tabs: [
          { id: 'tab-1', name: 'Canvas 1' },
          { id: 'tab-2', name: 'Canvas 2' },
        ],
        activeTabId: 'tab-2',
      }

      await api.tab.saveState(tabState)
      const loaded = await api.tab.getState()

      expect(loaded.tabs).toHaveLength(2)
      expect(loaded.activeTabId).toBe('tab-2')
    })
  })

  // ── Window controls round-trip ──────────────────────────────────────────

  describe('window control round-trip', () => {
    it('isMaximized returns boolean', async () => {
      const result = await api.window.isMaximized()
      expect(typeof result).toBe('boolean')
    })

    it('minimize calls through to BrowserWindow', async () => {
      await api.window.minimize()
      expect(mockWindow.minimize).toHaveBeenCalled()
    })
  })

  // ── Serialization edge cases ────────────────────────────────────────────

  describe('serialization edge cases', () => {
    it('handles empty strings in file operations', async () => {
      const filePath = path.join(writableTmpDir, 'empty.txt')
      await api.fs.writefile(filePath, '')

      const result = await api.fs.readfile(filePath)
      expect(result.content).toBe('')
      expect(result.size).toBe(0)
    })

    it('handles unicode content through the bridge', async () => {
      const filePath = path.join(writableTmpDir, 'unicode.txt')
      const content = '日本語テスト 🚀 café résumé'

      await api.fs.writefile(filePath, content)
      const result = await api.fs.readfile(filePath)

      expect(result.content).toBe(content)
    })

    it('handles special characters in layout names', async () => {
      const layout = {
        name: 'test (1) [dev]',
        sessions: [],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }

      await api.layout.save('test (1) [dev]', layout)
      const loaded = await api.layout.load('test (1) [dev]')

      expect(loaded).toEqual(layout)
    })

    it('preserves nested object structures in config', async () => {
      await api.config.set('sidebarWidth', 300)
      await api.config.set('gridSize', 30)

      const prefs = await api.config.get()
      expect(prefs.sidebarWidth).toBe(300)
      expect(prefs.gridSize).toBe(30)
      // Other defaults should still be present
      expect(prefs.theme).toBe('dark')
    })
  })
})
