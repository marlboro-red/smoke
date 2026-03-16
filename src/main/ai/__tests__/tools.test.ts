import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { createExecutors, type CodegraphDeps, type PluginDeps } from '../tools'
import { terminalOutputBuffer } from '../TerminalOutputBuffer'
import { PtyManager } from '../../pty/PtyManager'
import { AI_CANVAS_ACTION } from '../../ipc/channels'

// Mock node-pty (native module not available in test)
vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}))

// Mock configStore
vi.mock('../../config/ConfigStore', () => ({
  configStore: {
    get: vi.fn().mockReturnValue({
      gridSize: 20,
      defaultShell: '/bin/zsh',
      defaultCwd: '/tmp',
    }),
    set: vi.fn(),
  },
  defaultPreferences: {},
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-session-id'),
}))

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock-user-data'),
  },
}))

// Mock codegraph buildCodeGraph, collectContext, computeWorkspaceLayout
vi.mock('../../codegraph', () => ({
  buildCodeGraph: vi.fn().mockResolvedValue({
    graph: {
      nodes: [
        { filePath: '/project/src/index.ts', imports: ['/project/src/utils.ts'], importedBy: [], depth: 0 },
        { filePath: '/project/src/utils.ts', imports: [], importedBy: ['/project/src/index.ts'], depth: 1 },
      ],
      edges: [
        { from: '/project/src/index.ts', to: '/project/src/utils.ts', type: 'import' },
      ],
    },
    rootPath: '/project/src/index.ts',
    fileCount: 2,
    edgeCount: 1,
  }),
  collectContext: vi.fn().mockResolvedValue({
    files: [
      { filePath: '/project/src/index.ts', relevance: 1.0, imports: ['/project/src/utils.ts'], importedBy: [], source: 'search', moduleId: 'src' },
      { filePath: '/project/src/utils.ts', relevance: 0.6, imports: [], importedBy: ['/project/src/index.ts'], source: 'import-graph', moduleId: 'src' },
    ],
    parsedTask: { intent: 'fix', keywords: ['terminal', 'resize'], filePatterns: [], includeFileTypes: ['source'], usedAi: false },
    structureMap: null,
    timing: { parse: 5, search: 10, structure: 3, graph: 20, scoring: 8, total: 46 },
  }),
  computeWorkspaceLayout: vi.fn().mockReturnValue({
    positions: [
      { filePath: '/project/src/index.ts', x: 0, y: 0, depth: 0 },
      { filePath: '/project/src/utils.ts', x: -720, y: 0, depth: -1 },
    ],
    arrows: [
      { from: '/project/src/index.ts', to: '/project/src/utils.ts', type: 'import' },
    ],
    regions: [
      { name: 'src', position: { x: -760, y: -40 }, size: { width: 1440, height: 560 } },
    ],
    bounds: { minX: -720, minY: 0, maxX: 640, maxY: 480 },
  }),
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 100 }),
  readFile: vi.fn().mockResolvedValue('file content here'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([
    { name: 'file.ts', isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false },
    { name: 'src', isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false },
    { name: 'link', isFile: () => false, isDirectory: () => false, isSymbolicLink: () => true },
  ]),
}))

function createMockWindow(): BrowserWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

function createMockPtyProcess(id: string) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    id,
    pid: 12345,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event)!.push(cb)
    }),
    emit: (event: string, ...args: unknown[]) => {
      for (const cb of listeners.get(event) ?? []) cb(...args)
    },
    _listeners: listeners,
  }
}

describe('AI Tools', () => {
  let executors: Map<string, (input: Record<string, unknown>) => Promise<string>>
  let mockWindow: BrowserWindow
  let ptyManager: PtyManager
  let mockPty: ReturnType<typeof createMockPtyProcess>
  let sendCalls: Array<[string, unknown]>

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindow = createMockWindow()
    ptyManager = new PtyManager()

    // Track send calls
    sendCalls = []
    const send = mockWindow.webContents.send as ReturnType<typeof vi.fn>
    send.mockImplementation((channel: string, data: unknown) => {
      sendCalls.push([channel, data])
    })

    // Create a mock PTY that can be found by the manager
    mockPty = createMockPtyProcess('existing-session')
    vi.spyOn(ptyManager, 'get').mockImplementation((id: string) => {
      if (id === 'existing-session') return mockPty as never
      return undefined
    })
    vi.spyOn(ptyManager, 'spawn').mockReturnValue(mockPty as never)

    // Set up terminal output buffer
    terminalOutputBuffer.clear()
    terminalOutputBuffer.append('existing-session', 'line 1\nline 2\nline 3\n')

    // Create executors directly
    executors = createExecutors(ptyManager, () => mockWindow)
  })

  describe('createExecutors', () => {
    it('creates all 22 tool executors', () => {
      const toolNames = Array.from(executors.keys())
      expect(toolNames).toEqual([
        'get_canvas_state',
        'list_sessions',
        'read_terminal_output',
        'spawn_terminal',
        'write_to_terminal',
        'close_terminal',
        'move_element',
        'resize_element',
        'read_file',
        'list_directory',
        'edit_file',
        'pan_canvas',
        'create_note',
        'create_arrow',
        'create_group',
        'add_to_group',
        'broadcast_to_group',
        'assemble_workspace',
        'list_plugins',
        'create_plugin_element',
        'read_plugin_state',
        'explore_imports',
      ])
    })
  })

  describe('get_canvas_state', () => {
    it('returns canvas state with session count and grid size', async () => {
      const executor = executors.get('get_canvas_state')!
      const result = JSON.parse(await executor({}))
      expect(result.sessionCount).toBe(1)
      expect(result.gridSize).toBe(20)
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0].id).toBe('existing-session')
    })
  })

  describe('list_sessions', () => {
    it('returns session details', async () => {
      const executor = executors.get('list_sessions')!
      const result = JSON.parse(await executor({}))
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('existing-session')
      expect(result[0].hasOutput).toBe(true)
    })

    it('returns message when no sessions', async () => {
      terminalOutputBuffer.clear()
      const executor = executors.get('list_sessions')!
      const result = await executor({})
      expect(result).toBe('No active terminal sessions.')
    })
  })

  describe('read_terminal_output', () => {
    it('reads buffered output from a session', async () => {
      const executor = executors.get('read_terminal_output')!
      const result = await executor({ session_id: 'existing-session' })
      expect(result).toContain('line 1')
      expect(result).toContain('line 3')
    })

    it('reads last N lines', async () => {
      const executor = executors.get('read_terminal_output')!
      const result = await executor({ session_id: 'existing-session', lines: 2 })
      expect(result).toContain('line 3')
    })

    it('returns message for non-existent session', async () => {
      const executor = executors.get('read_terminal_output')!
      const result = await executor({ session_id: 'nonexistent' })
      expect(result).toContain('No output buffered')
    })
  })

  describe('spawn_terminal', () => {
    it('spawns a PTY and emits session_created canvas action', async () => {
      const executor = executors.get('spawn_terminal')!
      const result = JSON.parse(await executor({
        cwd: '/home/user',
        position: { x: 200, y: 300 },
      }))

      expect(result.sessionId).toBe('mock-session-id')
      expect(result.cwd).toBe('/home/user')
      expect(result.pid).toBe(12345)
      expect(ptyManager.spawn).toHaveBeenCalled()

      // Should emit canvas action
      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('session_created')
      expect(action.payload.sessionId).toBe('mock-session-id')
      expect(action.payload.cwd).toBe('/home/user')
    })

    it('uses defaults when no position or cwd specified', async () => {
      const executor = executors.get('spawn_terminal')!
      const result = JSON.parse(await executor({}))
      expect(result.sessionId).toBe('mock-session-id')
      expect(result.cwd).toBe('/tmp') // from defaultCwd preference
    })
  })

  describe('write_to_terminal', () => {
    it('writes text to a terminal session', async () => {
      const executor = executors.get('write_to_terminal')!
      const result = await executor({ session_id: 'existing-session', text: 'ls -la\n' })
      expect(mockPty.write).toHaveBeenCalledWith('ls -la\n')
      expect(result).toContain('7 characters')
    })

    it('throws for non-existent session', async () => {
      const executor = executors.get('write_to_terminal')!
      await expect(executor({ session_id: 'nonexistent', text: 'hello' })).rejects.toThrow(
        'not found'
      )
    })
  })

  describe('close_terminal', () => {
    it('kills the PTY and emits session_closed', async () => {
      const executor = executors.get('close_terminal')!
      const result = await executor({ session_id: 'existing-session' })
      expect(mockPty.kill).toHaveBeenCalled()
      expect(result).toContain('Closed')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      expect((canvasActions[0][1] as { action: string }).action).toBe('session_closed')
    })

    it('throws for non-existent session', async () => {
      const executor = executors.get('close_terminal')!
      await expect(executor({ session_id: 'nonexistent' })).rejects.toThrow('not found')
    })
  })

  describe('move_element', () => {
    it('emits session_moved canvas action', async () => {
      const executor = executors.get('move_element')!
      const result = await executor({
        session_id: 'existing-session',
        position: { x: 500, y: 600 },
      })
      expect(result).toContain('500')
      expect(result).toContain('600')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('session_moved')
      expect(action.payload.position).toEqual({ x: 500, y: 600 })
    })
  })

  describe('resize_element', () => {
    it('resizes PTY and emits session_resized', async () => {
      const executor = executors.get('resize_element')!
      const result = await executor({
        session_id: 'existing-session',
        cols: 120,
        rows: 40,
      })

      expect(mockPty.resize).toHaveBeenCalledWith(120, 40)
      expect(result).toContain('120x40')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('session_resized')
      expect(action.payload.size).toEqual({ cols: 120, rows: 40, width: 960, height: 720 })
    })
  })

  describe('read_file', () => {
    it('reads file content', async () => {
      const executor = executors.get('read_file')!
      const result = await executor({ path: '/tmp/test.txt' })
      expect(result).toBe('file content here')
    })

    it('throws for files over 5MB', async () => {
      const { stat } = await import('fs/promises')
      ;(stat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ size: 10 * 1024 * 1024 })

      const executor = executors.get('read_file')!
      await expect(executor({ path: '/tmp/big.bin' })).rejects.toThrow('File too large')
    })
  })

  describe('list_directory', () => {
    it('lists directory entries with types', async () => {
      const executor = executors.get('list_directory')!
      const result = JSON.parse(await executor({ path: '/tmp' }))

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ name: 'file.ts', type: 'file', size: 100 })
      expect(result[1]).toEqual({ name: 'src', type: 'directory', size: 0 })
      expect(result[2]).toEqual({ name: 'link', type: 'symlink', size: 0 })
    })
  })

  describe('pan_canvas', () => {
    it('emits viewport_panned canvas action', async () => {
      const executor = executors.get('pan_canvas')!
      const result = await executor({ x: -200, y: -300 })
      expect(result).toContain('-200')
      expect(result).toContain('-300')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('viewport_panned')
      expect(action.payload).toEqual({ panX: -200, panY: -300 })
    })
  })

  describe('create_note', () => {
    it('emits note_created canvas action', async () => {
      const executor = executors.get('create_note')!
      const result = JSON.parse(await executor({
        text: 'Hello world',
        position: { x: 200, y: 300 },
        color: 'blue',
      }))

      expect(result.noteId).toBe('mock-session-id')
      expect(result.text).toBe('Hello world')
      expect(result.color).toBe('blue')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('note_created')
    })
  })

  describe('assemble_workspace', () => {
    function createMockCodegraphDeps(): CodegraphDeps {
      return {
        searchIndex: {} as CodegraphDeps['searchIndex'],
        structureAnalyzer: {} as CodegraphDeps['structureAnalyzer'],
      }
    }

    function createExecutorsWithDeps() {
      const deps = createMockCodegraphDeps()
      const execs = createExecutors(ptyManager, () => mockWindow, undefined, deps)
      return execs.get('assemble_workspace')!
    }

    it('throws when codegraph deps are not configured', async () => {
      // Default registration (no codegraph deps)
      const executor = executors.get('assemble_workspace')!
      await expect(
        executor({ task_description: 'fix terminal resize bug' })
      ).rejects.toThrow('codegraph dependencies not configured')
    })

    it('chains the full pipeline and returns a summary', async () => {
      const executor = createExecutorsWithDeps()
      const result = JSON.parse(await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      }))

      expect(result.success).toBe(true)
      expect(result.task).toBe('fix terminal resize bug')
      expect(result.parsedTask.intent).toBe('fix')
      expect(result.parsedTask.keywords).toEqual(['terminal', 'resize'])
      expect(result.filesOpened).toBe(2)
      expect(result.arrows).toBe(1)
      expect(result.fileList).toHaveLength(2)
      expect(result.timing).toBeDefined()
    })

    it('calls collectContext with proper params', async () => {
      const executor = createExecutorsWithDeps()
      await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
        max_files: 10,
      })

      const { collectContext } = await import('../../codegraph')
      expect(collectContext).toHaveBeenCalledWith(
        expect.objectContaining({
          taskDescription: 'fix terminal resize bug',
          projectRoot: '/project',
          maxFiles: 10,
          useAi: true,
          graphDepth: 2,
        }),
        expect.anything(),
        expect.anything(),
      )
    })

    it('calls computeWorkspaceLayout with collected files', async () => {
      const executor = createExecutorsWithDeps()
      await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      })

      const { computeWorkspaceLayout } = await import('../../codegraph')
      expect(computeWorkspaceLayout).toHaveBeenCalledWith([
        { filePath: '/project/src/index.ts', relevance: 1.0, imports: ['/project/src/utils.ts'], importedBy: [] },
        { filePath: '/project/src/utils.ts', relevance: 0.6, imports: [], importedBy: ['/project/src/index.ts'] },
      ])
    })

    it('emits file_edited actions for each file in layout', async () => {
      const executor = createExecutorsWithDeps()
      await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      })

      const fileEdits = sendCalls
        .filter(([ch]) => ch === AI_CANVAS_ACTION)
        .filter(([, data]) => (data as { action: string }).action === 'file_edited')
      expect(fileEdits).toHaveLength(2)

      const firstEdit = fileEdits[0][1] as { payload: Record<string, unknown> }
      expect(firstEdit.payload.filePath).toBe('/project/src/index.ts')
      expect(firstEdit.payload.content).toBe('file content here')
      expect(firstEdit.payload.language).toBe('typescript')
      expect(firstEdit.payload.position).toEqual({ x: 0, y: 0 })
    })

    it('emits connector_created actions for import arrows', async () => {
      const executor = createExecutorsWithDeps()
      await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      })

      const connectors = sendCalls
        .filter(([ch]) => ch === AI_CANVAS_ACTION)
        .filter(([, data]) => (data as { action: string }).action === 'connector_created')
      expect(connectors).toHaveLength(1)

      const connector = connectors[0][1] as { payload: Record<string, unknown> }
      expect(connector.payload.label).toBe('import')
    })

    it('emits group_created actions for module regions', async () => {
      const executor = createExecutorsWithDeps()
      await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      })

      const groups = sendCalls
        .filter(([ch]) => ch === AI_CANVAS_ACTION)
        .filter(([, data]) => (data as { action: string }).action === 'group_created')
      expect(groups).toHaveLength(1)
      expect((groups[0][1] as { payload: Record<string, unknown> }).payload.name).toBe('src')
    })

    it('spawns terminals cd\'d to relevant directories', async () => {
      const executor = createExecutorsWithDeps()
      const result = JSON.parse(await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      }))

      expect(result.terminals.length).toBeGreaterThan(0)
      expect(ptyManager.spawn).toHaveBeenCalled()

      // Check session_created actions for terminals
      const sessions = sendCalls
        .filter(([ch]) => ch === AI_CANVAS_ACTION)
        .filter(([, data]) => (data as { action: string }).action === 'session_created')
      expect(sessions.length).toBeGreaterThan(0)
    })

    it('does not spawn terminals when spawn_terminals is false', async () => {
      const executor = createExecutorsWithDeps()
      vi.clearAllMocks()
      // Re-setup send tracking after clearAllMocks
      sendCalls = []
      const send = mockWindow.webContents.send as ReturnType<typeof vi.fn>
      send.mockImplementation((channel: string, data: unknown) => {
        sendCalls.push([channel, data])
      })

      const result = JSON.parse(await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
        spawn_terminals: false,
      }))

      expect(result.terminals).toHaveLength(0)
      const sessions = sendCalls
        .filter(([ch]) => ch === AI_CANVAS_ACTION)
        .filter(([, data]) => (data as { action: string }).action === 'session_created')
      expect(sessions).toHaveLength(0)
    })

    it('pans canvas to center the workspace', async () => {
      const executor = createExecutorsWithDeps()
      await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      })

      const pans = sendCalls
        .filter(([ch]) => ch === AI_CANVAS_ACTION)
        .filter(([, data]) => (data as { action: string }).action === 'viewport_panned')
      expect(pans).toHaveLength(1)

      // Center of bounds: minX=-720, maxX=640 → centerX = -(-720+640)/2 = 40
      // Center of bounds: minY=0, maxY=480 → centerY = -(0+480)/2 = -240
      const payload = (pans[0][1] as { payload: Record<string, unknown> }).payload
      expect(payload.panX).toBe(40)
      expect(payload.panY).toBe(-240)
    })

    it('returns failure when no files are found', async () => {
      const { collectContext } = await import('../../codegraph')
      ;(collectContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        files: [],
        parsedTask: { intent: 'fix', keywords: ['nonexistent'], filePatterns: [], includeFileTypes: [], usedAi: false },
        structureMap: null,
        timing: { parse: 5, search: 10, structure: 3, graph: 0, scoring: 0, total: 18 },
      })

      const executor = createExecutorsWithDeps()
      const result = JSON.parse(await executor({
        task_description: 'fix nonexistent feature',
        project_root: '/project',
      }))

      expect(result.success).toBe(false)
      expect(result.message).toContain('No relevant files')
    })

    it('includes file list with relative paths and relevance', async () => {
      const executor = createExecutorsWithDeps()
      const result = JSON.parse(await executor({
        task_description: 'fix terminal resize bug',
        project_root: '/project',
      }))

      expect(result.fileList[0].file).toBe('src/index.ts')
      expect(result.fileList[0].relevance).toBe(1)
      expect(result.fileList[0].source).toBe('search')
      expect(result.fileList[1].file).toBe('src/utils.ts')
      expect(result.fileList[1].relevance).toBe(0.6)
    })
  })

  describe('list_plugins', () => {
    function createMockPluginDeps(): PluginDeps {
      return {
        getPlugins: vi.fn().mockReturnValue([
          {
            manifest: {
              name: 'docker-dashboard',
              version: '1.0.0',
              description: 'Docker container dashboard',
              author: 'Test Author',
              defaultSize: { width: 480, height: 360 },
              entryPoint: 'index.tsx',
              permissions: ['network', 'shell'],
            },
            pluginDir: '/home/user/.smoke/plugins/docker-dashboard',
            entryPointPath: '/home/user/.smoke/plugins/docker-dashboard/index.tsx',
            source: 'global' as const,
          },
        ]),
        getPlugin: vi.fn(),
      }
    }

    it('returns empty list when plugin deps not configured', async () => {
      const executor = executors.get('list_plugins')!
      const result = JSON.parse(await executor({}))
      expect(result.plugins).toEqual([])
    })

    it('returns plugin list when plugins are available', async () => {
      const deps = createMockPluginDeps()
      const execs = createExecutors(ptyManager, () => mockWindow, undefined, undefined, deps)
      const executor = execs.get('list_plugins')!
      const result = JSON.parse(await executor({}))

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('docker-dashboard')
      expect(result[0].description).toBe('Docker container dashboard')
      expect(result[0].permissions).toEqual(['network', 'shell'])
    })

    it('returns message when no plugins installed', async () => {
      const deps: PluginDeps = {
        getPlugins: vi.fn().mockReturnValue([]),
        getPlugin: vi.fn(),
      }
      const execs = createExecutors(ptyManager, () => mockWindow, undefined, undefined, deps)
      const executor = execs.get('list_plugins')!
      const result = await executor({})
      expect(result).toContain('No plugins installed')
    })
  })

  describe('create_plugin_element', () => {
    const mockPlugin = {
      manifest: {
        name: 'docker-dashboard',
        version: '1.0.0',
        description: 'Docker container dashboard',
        author: 'Test Author',
        defaultSize: { width: 480, height: 360 },
        entryPoint: 'index.tsx',
        permissions: ['network', 'shell'],
      },
      pluginDir: '/home/user/.smoke/plugins/docker-dashboard',
      entryPointPath: '/home/user/.smoke/plugins/docker-dashboard/index.tsx',
      source: 'global' as const,
    }

    function createPluginExecutors() {
      const deps: PluginDeps = {
        getPlugins: vi.fn().mockReturnValue([mockPlugin]),
        getPlugin: vi.fn().mockImplementation((name: string) =>
          name === 'docker-dashboard' ? mockPlugin : undefined
        ),
      }
      return createExecutors(ptyManager, () => mockWindow, undefined, undefined, deps)
    }

    it('throws when plugin deps not configured', async () => {
      const executor = executors.get('create_plugin_element')!
      await expect(executor({ plugin_name: 'docker-dashboard' })).rejects.toThrow(
        'Plugin system not available'
      )
    })

    it('throws when plugin not found', async () => {
      const execs = createPluginExecutors()
      const executor = execs.get('create_plugin_element')!
      await expect(executor({ plugin_name: 'nonexistent' })).rejects.toThrow(
        'Plugin "nonexistent" not found'
      )
    })

    it('creates a plugin element and emits canvas action', async () => {
      const execs = createPluginExecutors()
      // Re-setup send tracking
      sendCalls = []
      const send = mockWindow.webContents.send as ReturnType<typeof vi.fn>
      send.mockImplementation((channel: string, data: unknown) => {
        sendCalls.push([channel, data])
      })

      const executor = execs.get('create_plugin_element')!
      const result = JSON.parse(await executor({
        plugin_name: 'docker-dashboard',
        position: { x: 300, y: 400 },
      }))

      expect(result.sessionId).toBe('mock-session-id')
      expect(result.pluginName).toBe('docker-dashboard')
      expect(result.pluginType).toBe('plugin:docker-dashboard')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('plugin_session_created')
      expect(action.payload.pluginId).toBe('docker-dashboard')
      expect(action.payload.position).toEqual({ x: 300, y: 400 })
    })

    it('uses default position when not specified', async () => {
      const execs = createPluginExecutors()
      sendCalls = []
      const send = mockWindow.webContents.send as ReturnType<typeof vi.fn>
      send.mockImplementation((channel: string, data: unknown) => {
        sendCalls.push([channel, data])
      })

      const executor = execs.get('create_plugin_element')!
      await executor({ plugin_name: 'docker-dashboard' })

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.payload.position).toEqual({ x: 100, y: 100 })
    })
  })

  describe('read_plugin_state', () => {
    it('lists state keys when no key specified', async () => {
      const { readdir } = await import('fs/promises')
      ;(readdir as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        'settings.json',
        'cache.json',
      ])

      const executor = executors.get('read_plugin_state')!
      const result = JSON.parse(await executor({ plugin_id: 'docker-dashboard' }))
      expect(result.pluginId).toBe('docker-dashboard')
      expect(result.keys).toEqual(['settings', 'cache'])
    })

    it('returns message when no state exists', async () => {
      const { readdir } = await import('fs/promises')
      ;(readdir as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ENOENT'))

      const executor = executors.get('read_plugin_state')!
      const result = await executor({ plugin_id: 'nonexistent' })
      expect(result).toContain('No persisted state')
    })

    it('reads a specific state key', async () => {
      const { readFile } = await import('fs/promises')
      ;(readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('{"containers": []}')

      const executor = executors.get('read_plugin_state')!
      const result = JSON.parse(await executor({
        plugin_id: 'docker-dashboard',
        key: 'containers',
      }))
      expect(result.pluginId).toBe('docker-dashboard')
      expect(result.key).toBe('containers')
      expect(result.value).toEqual({ containers: [] })
    })

    it('returns message for missing state key', async () => {
      const { readFile } = await import('fs/promises')
      ;(readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ENOENT'))

      const executor = executors.get('read_plugin_state')!
      const result = await executor({
        plugin_id: 'docker-dashboard',
        key: 'nonexistent',
      })
      expect(result).toContain('State key "nonexistent" not found')
    })
  })

  describe('canvas action emission', () => {
    it('does not emit when window is destroyed', async () => {
      ;(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true)
      const executor = executors.get('pan_canvas')!
      await executor({ x: 0, y: 0 })
      expect(sendCalls).toHaveLength(0)
    })

    it('does not emit when window is null', async () => {
      const nullExecutors = createExecutors(ptyManager, () => null)
      const executor = nullExecutors.get('pan_canvas')!
      await executor({ x: 0, y: 0 })
      // Should not throw
    })
  })
})
