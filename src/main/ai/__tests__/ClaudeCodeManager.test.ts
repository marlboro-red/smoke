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
})
