import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ClaudeCodeManager } from '../ClaudeCodeManager'
import { McpBridge } from '../McpBridge'
import type { BrowserWindow } from 'electron'
import type { AiStreamEvent } from '../../../preload/types'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Mock electron app
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
}))

// Mock configStore
vi.mock('../../config/ConfigStore', () => ({
  configStore: {
    get: vi.fn().mockReturnValue({
      claudeCommand: 'claude',
    }),
    set: vi.fn(),
  },
  defaultPreferences: {},
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-conv-id'),
}))

// Mock TerminalOutputBuffer
vi.mock('../TerminalOutputBuffer', () => ({
  terminalOutputBuffer: {
    sessions: vi.fn().mockReturnValue([]),
    size: vi.fn().mockReturnValue(0),
  },
}))

function createMockWindow(): BrowserWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

describe('ClaudeCodeManager', () => {
  let manager: ClaudeCodeManager
  let mockWindow: BrowserWindow
  let mockBridge: McpBridge
  let emittedEvents: AiStreamEvent[]

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindow = createMockWindow()
    mockBridge = new McpBridge()
    // Mock the bridge port
    Object.defineProperty(mockBridge, 'port', { value: 12345 })

    manager = new ClaudeCodeManager(
      () => mockWindow,
      mockBridge,
      'test-agent-id',
      'Test Agent'
    )
    emittedEvents = []

    // Capture emitted events
    const send = mockWindow.webContents.send as ReturnType<typeof vi.fn>
    send.mockImplementation((_channel: string, event: AiStreamEvent) => {
      emittedEvents.push(event)
    })
  })

  describe('constructor', () => {
    it('has the correct agentId and name', () => {
      expect(manager.agentId).toBe('test-agent-id')
      expect(manager.name).toBe('Test Agent')
    })
  })

  describe('abort', () => {
    it('does not throw when aborting with no active conversations', () => {
      expect(() => manager.abort()).not.toThrow()
    })

    it('does not throw when aborting a specific non-existent conversation', () => {
      expect(() => manager.abort('nonexistent')).not.toThrow()
    })
  })

  describe('clear', () => {
    it('clears all conversations without error', () => {
      expect(() => manager.clear()).not.toThrow()
    })

    it('clears a specific conversation', () => {
      expect(() => manager.clear('some-id')).not.toThrow()
    })
  })

  describe('event emission', () => {
    it('does not emit when window is destroyed', () => {
      ;(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true)
      // Access private emit method via prototype hack for testing
      const emitFn = (manager as any).emit.bind(manager)
      emitFn({
        type: 'text_delta',
        conversationId: 'test',
        delta: 'hello',
      })
      expect(
        (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBe(0)
    })

    it('does not emit when window is null', () => {
      const nullManager = new ClaudeCodeManager(
        () => null,
        mockBridge,
        'null-agent',
        'Null Agent'
      )
      const emitFn = (nullManager as any).emit.bind(nullManager)
      emitFn({
        type: 'text_delta',
        conversationId: 'test',
        delta: 'hello',
      })
      // Should not throw
    })
  })

  describe('dispose', () => {
    it('clears conversations and removes temp MCP config file', async () => {
      const fs = await import('fs')
      const unlinkSyncMock = vi.fn()
      ;(fs as any).unlinkSync = unlinkSyncMock

      // Force creation of the MCP config file by accessing the private method
      const configPath = (manager as any).ensureMcpConfig()
      expect(configPath).toBeTruthy()
      expect((manager as any).mcpConfigPath).toBeTruthy()

      manager.dispose()

      // Should have attempted to delete the temp file
      expect(unlinkSyncMock).toHaveBeenCalledWith(configPath)
      // Internal state should be cleaned up
      expect((manager as any).mcpConfigPath).toBeNull()
    })

    it('does not throw when no MCP config exists', () => {
      expect(() => manager.dispose()).not.toThrow()
    })
  })

  describe('sendMessage', () => {
    it('emits error when claude is not found', async () => {
      // The spawn mock returns a process that emits 'error'
      const { spawn } = await import('child_process')
      const mockSpawn = vi.mocked(spawn)

      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn() },
      }

      // When 'error' event handler is registered, call it immediately
      mockProc.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('spawn ENOENT')), 0)
        }
        return mockProc
      })

      mockSpawn.mockReturnValue(mockProc as any)

      await manager.sendMessage('hello')

      // Should have emitted an error event
      expect(emittedEvents.some(e => e.type === 'error')).toBe(true)
      const errorEvent = emittedEvents.find(e => e.type === 'error')
      if (errorEvent?.type === 'error') {
        expect(errorEvent.error).toContain('Failed to spawn Claude Code')
      }
    })

    it('closes stdin immediately after spawn to prevent blocking (smoke-0l6m)', async () => {
      const { spawn } = await import('child_process')
      const mockSpawn = vi.mocked(spawn)

      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn() },
      }

      mockProc.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0)
        }
        return mockProc
      })

      mockSpawn.mockReturnValue(mockProc as any)

      await manager.sendMessage('hello')

      // stdin.end() must be called to send EOF so the CLI doesn't block
      expect(mockProc.stdin.end).toHaveBeenCalled()
    })

    it('emits both error and message_complete on non-zero exit (smoke-0l6m)', async () => {
      const { spawn } = await import('child_process')
      const mockSpawn = vi.mocked(spawn)

      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn() },
      }

      mockProc.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'close') {
          // Simulate process killed by signal (code === null)
          setTimeout(() => handler(null), 0)
        }
        return mockProc
      })

      mockSpawn.mockReturnValue(mockProc as any)

      await manager.sendMessage('hello')

      // Should emit both an error and a message_complete event
      const errorEvent = emittedEvents.find(e => e.type === 'error')
      const completeEvent = emittedEvents.find(e => e.type === 'message_complete')
      expect(errorEvent).toBeDefined()
      expect(completeEvent).toBeDefined()
      if (completeEvent?.type === 'message_complete') {
        expect(completeEvent.stopReason).toBe('error')
      }
    })

    it('uses --resume for second message in same conversation (smoke-zrdd)', async () => {
      const { spawn } = await import('child_process')
      const mockSpawn = vi.mocked(spawn)

      const createMockProc = () => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn() },
      })

      // First message — process exits normally
      const proc1 = createMockProc()
      proc1.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'close') setTimeout(() => handler(0), 0)
        return proc1
      })
      mockSpawn.mockReturnValue(proc1 as any)

      const convId = await manager.sendMessage('first message')

      // First call should use --system-prompt (not --resume)
      const args1 = mockSpawn.mock.calls[0][1] as string[]
      expect(args1).toContain('--system-prompt')
      expect(args1).not.toContain('--resume')

      // Second message — reuse the same conversation ID
      const proc2 = createMockProc()
      proc2.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'close') setTimeout(() => handler(0), 0)
        return proc2
      })
      mockSpawn.mockReturnValue(proc2 as any)

      await manager.sendMessage('second message', convId)

      // Second call should use --resume (not --system-prompt)
      const args2 = mockSpawn.mock.calls[1][1] as string[]
      expect(args2).toContain('--resume')
      expect(args2).not.toContain('--system-prompt')
    })

    it('passes a valid UUID as --session-id, not a prefixed string (smoke-0gy6)', async () => {
      const { spawn } = await import('child_process')
      const mockSpawn = vi.mocked(spawn)

      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn() },
      }

      mockProc.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0)
        }
        return mockProc
      })

      mockSpawn.mockReturnValue(mockProc as any)

      await manager.sendMessage('hello')

      // Verify spawn was called with --session-id followed by a pure UUID value
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      const sessionIdIdx = spawnArgs.indexOf('--session-id')
      expect(sessionIdIdx).toBeGreaterThan(-1)

      const sessionId = spawnArgs[sessionIdIdx + 1]
      // Session ID must NOT contain the old "smoke-" prefix
      expect(sessionId).not.toMatch(/^smoke-/)
      // Session ID should be exactly what uuid() returns (our mock returns 'test-conv-id')
      expect(sessionId).toBe('test-conv-id')
    })
  })

  describe('stream event processing (smoke-x6mu)', () => {
    /**
     * Helper: spawn a mock Claude Code process, feed it stream-json
     * lines, then close with the given exit code.  Returns the events
     * that were emitted to the renderer.
     */
    async function feedStreamLines(
      mgr: typeof manager,
      lines: string[],
      exitCode = 0
    ): Promise<AiStreamEvent[]> {
      const { spawn } = await import('child_process')
      const mockSpawn = vi.mocked(spawn)

      let stdoutHandler: ((chunk: Buffer) => void) | null = null
      let closeHandler: ((code: number | null) => void) | null = null

      const mockProc = {
        stdout: {
          on: vi.fn().mockImplementation((_e: string, h: Function) => {
            stdoutHandler = h as (chunk: Buffer) => void
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: Function) => {
          if (event === 'close') closeHandler = handler as (code: number | null) => void
          return mockProc
        }),
        kill: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn() },
        pid: 12345,
      }

      mockSpawn.mockReturnValue(mockProc as any)

      const promise = mgr.sendMessage('test prompt')

      // Feed all lines as a single stdout chunk (newline-delimited)
      const chunk = lines.join('\n') + '\n'
      stdoutHandler?.(Buffer.from(chunk))

      // Close the process
      closeHandler?.(exitCode)

      await promise
      return [...emittedEvents]
    }

    it('extracts text from assistant message.content (no streaming events)', async () => {
      emittedEvents = []
      const events = await feedStreamLines(manager, [
        JSON.stringify({ type: 'system', subtype: 'init', tools: [] }),
        JSON.stringify({
          type: 'assistant',
          message: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from Claude!' }],
            stop_reason: null,
          },
        }),
        JSON.stringify({ type: 'result', subtype: 'success', result: 'Hello from Claude!' }),
      ])

      const textDeltas = events.filter(e => e.type === 'text_delta')
      expect(textDeltas.length).toBeGreaterThanOrEqual(1)
      const fullText = textDeltas
        .map(e => (e.type === 'text_delta' ? e.delta : ''))
        .join('')
      expect(fullText).toBe('Hello from Claude!')
    })

    it('extracts text AND tool_use from multi-turn tool-call conversation', async () => {
      emittedEvents = []
      const events = await feedStreamLines(manager, [
        JSON.stringify({ type: 'system', subtype: 'init', tools: [] }),
        // Turn 1: assistant uses a tool
        JSON.stringify({
          type: 'assistant',
          message: {
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-1', name: 'mcp__smoke-tools__write_to_terminal', input: { text: 'ls' } },
            ],
            stop_reason: 'tool_use',
          },
        }),
        // Tool result comes back as user message
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file1.txt\nfile2.txt' }],
          },
        }),
        // Turn 2: assistant responds with text
        JSON.stringify({
          type: 'assistant',
          message: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'I listed the files for you.' }],
            stop_reason: 'end_turn',
          },
        }),
        JSON.stringify({ type: 'result', subtype: 'success', result: 'I listed the files for you.' }),
      ])

      // Should have both tool_use and text_delta events
      const toolUseEvents = events.filter(e => e.type === 'tool_use')
      const textDeltas = events.filter(e => e.type === 'text_delta')

      expect(toolUseEvents.length).toBe(1)
      if (toolUseEvents[0].type === 'tool_use') {
        expect(toolUseEvents[0].toolName).toBe('write_to_terminal')
      }

      expect(textDeltas.length).toBeGreaterThanOrEqual(1)
      const fullText = textDeltas
        .map(e => (e.type === 'text_delta' ? e.delta : ''))
        .join('')
      expect(fullText).toBe('I listed the files for you.')
    })

    it('falls back to result.result when no text in assistant events', async () => {
      emittedEvents = []
      const events = await feedStreamLines(manager, [
        JSON.stringify({ type: 'system', subtype: 'init', tools: [] }),
        // Assistant only uses tools, no text content
        JSON.stringify({
          type: 'assistant',
          message: {
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-1', name: 'mcp__smoke-tools__write_to_terminal', input: { text: 'echo hello' } },
            ],
            stop_reason: 'tool_use',
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'hello' }],
          },
        }),
        // Final assistant turn has NO text — only tool_use
        JSON.stringify({
          type: 'assistant',
          message: {
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-2', name: 'mcp__smoke-tools__write_to_terminal', input: { text: 'echo done' } },
            ],
            stop_reason: 'tool_use',
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: 'done' }],
          },
        }),
        // Result event has the text summary
        JSON.stringify({ type: 'result', subtype: 'success', result: 'I wrote hello and done to the terminal.' }),
      ])

      // No text from assistant events, but result fallback should provide text
      const textDeltas = events.filter(e => e.type === 'text_delta')
      expect(textDeltas.length).toBeGreaterThanOrEqual(1)
      const fullText = textDeltas
        .map(e => (e.type === 'text_delta' ? e.delta : ''))
        .join('')
      expect(fullText).toBe('I wrote hello and done to the terminal.')
    })

    it('does not duplicate text when assistant events already provided it', async () => {
      emittedEvents = []
      const events = await feedStreamLines(manager, [
        JSON.stringify({ type: 'system', subtype: 'init', tools: [] }),
        JSON.stringify({
          type: 'assistant',
          message: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Response text here.' }],
            stop_reason: 'end_turn',
          },
        }),
        // Result has same text — should NOT be emitted again
        JSON.stringify({ type: 'result', subtype: 'success', result: 'Response text here.' }),
      ])

      const textDeltas = events.filter(e => e.type === 'text_delta')
      // Only one text_delta (from assistant message), not duplicated by result
      expect(textDeltas.length).toBe(1)
      if (textDeltas[0].type === 'text_delta') {
        expect(textDeltas[0].delta).toBe('Response text here.')
      }
    })

    it('all emitted events include agentId', async () => {
      emittedEvents = []
      const events = await feedStreamLines(manager, [
        JSON.stringify({ type: 'system', subtype: 'init', tools: [] }),
        JSON.stringify({
          type: 'assistant',
          message: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hi' }],
          },
        }),
        JSON.stringify({ type: 'result', subtype: 'success', result: 'Hi' }),
      ])

      // Every event should have agentId
      for (const event of events) {
        expect((event as any).agentId).toBe('test-agent-id')
      }
    })
  })
})
