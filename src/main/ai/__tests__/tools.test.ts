import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { AiService } from '../AiService'
import { registerTools } from '../tools'
import { terminalOutputBuffer } from '../TerminalOutputBuffer'
import { PtyManager } from '../../pty/PtyManager'
import { AI_CANVAS_ACTION, PTY_DATA_FROM_PTY, PTY_EXIT } from '../../ipc/channels'

// Mock node-pty (native module not available in test)
vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}))

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}))

// Mock configStore
vi.mock('../../config/ConfigStore', () => ({
  configStore: {
    get: vi.fn().mockReturnValue({
      aiModel: 'claude-sonnet-4-20250514',
      aiApiKey: 'test-api-key',
      aiMaxTokens: 4096,
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

// Mock fs/promises
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 100 }),
  readFile: vi.fn().mockResolvedValue('file content here'),
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
  let service: AiService
  let mockWindow: BrowserWindow
  let ptyManager: PtyManager
  let mockPty: ReturnType<typeof createMockPtyProcess>
  let sendCalls: Array<[string, unknown]>

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindow = createMockWindow()
    service = new AiService(() => mockWindow)
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
    vi.spyOn(ptyManager, 'write')

    // Set up terminal output buffer
    terminalOutputBuffer.clear()
    terminalOutputBuffer.append('existing-session', 'line 1\nline 2\nline 3\n')

    // Register all tools
    registerTools(service, ptyManager, () => mockWindow)
  })

  // Access registered tools via the private field for testing
  function getExecutor(name: string) {
    // We test through the service's registerTool, which stores in toolExecutors map
    // Since it's private, we access via the internal registration
    // Instead, we'll use the AiService's internal tool handling indirectly
    // by checking tool registration count
    return (service as unknown as { toolExecutors: Map<string, (input: Record<string, unknown>) => Promise<string>> }).toolExecutors.get(name)
  }

  describe('registerTools', () => {
    it('registers all 16 tools', () => {
      const toolNames = (service as unknown as { tools: Array<{ name: string }> }).tools.map(t => t.name)
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
        'pan_canvas',
        'create_note',
        'create_arrow',
        'create_group',
        'add_to_group',
        'broadcast_to_group',
      ])
    })
  })

  describe('get_canvas_state', () => {
    it('returns canvas state with session count and grid size', async () => {
      const executor = getExecutor('get_canvas_state')!
      const result = JSON.parse(await executor({}))
      expect(result.sessionCount).toBe(1)
      expect(result.gridSize).toBe(20)
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0].id).toBe('existing-session')
    })
  })

  describe('list_sessions', () => {
    it('returns session details', async () => {
      const executor = getExecutor('list_sessions')!
      const result = JSON.parse(await executor({}))
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('existing-session')
      expect(result[0].hasOutput).toBe(true)
    })

    it('returns message when no sessions', async () => {
      terminalOutputBuffer.clear()
      const executor = getExecutor('list_sessions')!
      const result = await executor({})
      expect(result).toBe('No active terminal sessions.')
    })
  })

  describe('read_terminal_output', () => {
    it('reads buffered output from a session', async () => {
      const executor = getExecutor('read_terminal_output')!
      const result = await executor({ session_id: 'existing-session' })
      expect(result).toContain('line 1')
      expect(result).toContain('line 3')
    })

    it('reads last N lines', async () => {
      const executor = getExecutor('read_terminal_output')!
      const result = await executor({ session_id: 'existing-session', lines: 2 })
      expect(result).toContain('line 3')
    })

    it('returns message for non-existent session', async () => {
      const executor = getExecutor('read_terminal_output')!
      const result = await executor({ session_id: 'nonexistent' })
      expect(result).toContain('No output buffered')
    })
  })

  describe('spawn_terminal', () => {
    it('spawns a PTY and emits session_created canvas action', async () => {
      const executor = getExecutor('spawn_terminal')!
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
      const executor = getExecutor('spawn_terminal')!
      const result = JSON.parse(await executor({}))
      expect(result.sessionId).toBe('mock-session-id')
      expect(result.cwd).toBe('/tmp') // from defaultCwd preference
    })
  })

  describe('write_to_terminal', () => {
    it('writes text to a terminal session', async () => {
      const executor = getExecutor('write_to_terminal')!
      const result = await executor({ session_id: 'existing-session', text: 'ls -la\n' })
      expect(mockPty.write).toHaveBeenCalledWith('ls -la\n')
      expect(result).toContain('7 characters')
    })

    it('throws for non-existent session', async () => {
      const executor = getExecutor('write_to_terminal')!
      await expect(executor({ session_id: 'nonexistent', text: 'hello' })).rejects.toThrow(
        'not found'
      )
    })
  })

  describe('close_terminal', () => {
    it('kills the PTY and emits session_closed', async () => {
      const executor = getExecutor('close_terminal')!
      const result = await executor({ session_id: 'existing-session' })
      expect(mockPty.kill).toHaveBeenCalled()
      expect(result).toContain('Closed')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      expect((canvasActions[0][1] as { action: string }).action).toBe('session_closed')
    })

    it('throws for non-existent session', async () => {
      const executor = getExecutor('close_terminal')!
      await expect(executor({ session_id: 'nonexistent' })).rejects.toThrow('not found')
    })
  })

  describe('move_element', () => {
    it('emits session_moved canvas action', async () => {
      const executor = getExecutor('move_element')!
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
      const executor = getExecutor('resize_element')!
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

    it('uses custom width/height when provided', async () => {
      const executor = getExecutor('resize_element')!
      await executor({
        session_id: 'existing-session',
        cols: 100,
        rows: 30,
        width: 1000,
        height: 600,
      })

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      const action = canvasActions[0][1] as { payload: { size: { width: number; height: number } } }
      expect(action.payload.size.width).toBe(1000)
      expect(action.payload.size.height).toBe(600)
    })
  })

  describe('read_file', () => {
    it('reads file content', async () => {
      const executor = getExecutor('read_file')!
      const result = await executor({ path: '/tmp/test.txt' })
      expect(result).toBe('file content here')
    })

    it('throws for files over 5MB', async () => {
      const { stat } = await import('fs/promises')
      ;(stat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ size: 10 * 1024 * 1024 })

      const executor = getExecutor('read_file')!
      await expect(executor({ path: '/tmp/big.bin' })).rejects.toThrow('File too large')
    })
  })

  describe('list_directory', () => {
    it('lists directory entries with types', async () => {
      const executor = getExecutor('list_directory')!
      const result = JSON.parse(await executor({ path: '/tmp' }))

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ name: 'file.ts', type: 'file', size: 100 })
      expect(result[1]).toEqual({ name: 'src', type: 'directory', size: 0 })
      expect(result[2]).toEqual({ name: 'link', type: 'symlink', size: 0 })
    })
  })

  describe('pan_canvas', () => {
    it('emits viewport_panned canvas action', async () => {
      const executor = getExecutor('pan_canvas')!
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
    it('emits note_created canvas action with text and position', async () => {
      const executor = getExecutor('create_note')!
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
      expect(action.payload.noteId).toBe('mock-session-id')
      expect(action.payload.text).toBe('Hello world')
      expect(action.payload.position).toEqual({ x: 200, y: 300 })
      expect(action.payload.color).toBe('blue')
    })

    it('uses defaults when position and color are omitted', async () => {
      const executor = getExecutor('create_note')!
      const result = JSON.parse(await executor({ text: 'A note' }))

      expect(result.position).toEqual({ x: 100, y: 100 })
      expect(result.color).toBe('yellow')
    })
  })

  describe('create_arrow', () => {
    it('emits connector_created canvas action', async () => {
      const executor = getExecutor('create_arrow')!
      const result = JSON.parse(await executor({
        from_id: 'session-a',
        to_id: 'session-b',
        label: 'data flow',
      }))

      expect(result.connectorId).toBe('mock-session-id')
      expect(result.sourceId).toBe('session-a')
      expect(result.targetId).toBe('session-b')
      expect(result.label).toBe('data flow')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('connector_created')
      expect(action.payload.sourceId).toBe('session-a')
      expect(action.payload.targetId).toBe('session-b')
      expect(action.payload.label).toBe('data flow')
    })

    it('works without optional label and color', async () => {
      const executor = getExecutor('create_arrow')!
      const result = JSON.parse(await executor({
        from_id: 'a',
        to_id: 'b',
      }))

      expect(result.connectorId).toBe('mock-session-id')
      expect(result.label).toBeUndefined()
    })
  })

  describe('create_group', () => {
    it('emits group_created canvas action', async () => {
      const executor = getExecutor('create_group')!
      const result = JSON.parse(await executor({
        name: 'Web Servers',
        color: '#4A90D9',
      }))

      expect(result.groupId).toBe('mock-session-id')
      expect(result.name).toBe('Web Servers')
      expect(result.color).toBe('#4A90D9')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('group_created')
      expect(action.payload.groupId).toBe('mock-session-id')
      expect(action.payload.name).toBe('Web Servers')
      expect(action.payload.color).toBe('#4A90D9')
    })

    it('works without optional color', async () => {
      const executor = getExecutor('create_group')!
      const result = JSON.parse(await executor({ name: 'Logs' }))

      expect(result.groupId).toBe('mock-session-id')
      expect(result.name).toBe('Logs')
      expect(result.color).toBeUndefined()
    })
  })

  describe('add_to_group', () => {
    it('emits group_member_added canvas action', async () => {
      const executor = getExecutor('add_to_group')!
      const result = await executor({
        element_id: 'existing-session',
        group_id: 'group-1',
      })

      expect(result).toContain('existing-session')
      expect(result).toContain('group-1')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('group_member_added')
      expect(action.payload.groupId).toBe('group-1')
      expect(action.payload.elementId).toBe('existing-session')
    })
  })

  describe('broadcast_to_group', () => {
    it('emits group_broadcast canvas action', async () => {
      const executor = getExecutor('broadcast_to_group')!
      const result = await executor({
        group_id: 'group-1',
        command: 'npm test\n',
      })

      expect(result).toContain('9 characters')
      expect(result).toContain('group-1')

      const canvasActions = sendCalls.filter(([ch]) => ch === AI_CANVAS_ACTION)
      expect(canvasActions).toHaveLength(1)
      const action = canvasActions[0][1] as { action: string; payload: Record<string, unknown> }
      expect(action.action).toBe('group_broadcast')
      expect(action.payload.groupId).toBe('group-1')
      expect(action.payload.command).toBe('npm test\n')
    })
  })

  describe('canvas action emission', () => {
    it('does not emit when window is destroyed', async () => {
      ;(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true)
      const executor = getExecutor('pan_canvas')!
      await executor({ x: 0, y: 0 })
      expect(sendCalls).toHaveLength(0)
    })

    it('does not emit when window is null', async () => {
      const nullService = new AiService(() => null)
      registerTools(nullService, ptyManager, () => null)
      const executor = (nullService as unknown as { toolExecutors: Map<string, (input: Record<string, unknown>) => Promise<string>> }).toolExecutors.get('pan_canvas')!
      await executor({ x: 0, y: 0 })
      // Should not throw
    })
  })
})
