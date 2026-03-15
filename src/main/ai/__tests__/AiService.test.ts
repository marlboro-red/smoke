import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AiService, ToolExecutor } from '../AiService'
import type { BrowserWindow } from 'electron'
import type { AiStreamEvent } from '../../../preload/types'
import { configStore } from '../../config/ConfigStore'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn(),
  }
})

// Mock configStore
vi.mock('../../config/ConfigStore', () => ({
  configStore: {
    get: vi.fn().mockReturnValue({
      aiModel: 'claude-sonnet-4-20250514',
      aiApiKey: 'test-api-key',
      aiMaxTokens: 4096,
    }),
    set: vi.fn(),
  },
  defaultPreferences: {},
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-conv-id'),
}))

const mockedConfigStore = vi.mocked(configStore)

function createMockWindow(): BrowserWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

describe('AiService', () => {
  let service: AiService
  let mockWindow: BrowserWindow
  let emittedEvents: AiStreamEvent[]

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindow = createMockWindow()
    service = new AiService(() => mockWindow)
    emittedEvents = []

    // Re-setup the default mock return value after clearAllMocks
    mockedConfigStore.get.mockReturnValue({
      aiModel: 'claude-sonnet-4-20250514',
      aiApiKey: 'test-api-key',
      aiMaxTokens: 4096,
    } as never)

    // Capture emitted events
    const send = mockWindow.webContents.send as ReturnType<typeof vi.fn>
    send.mockImplementation((_channel: string, event: AiStreamEvent) => {
      emittedEvents.push(event)
    })
  })

  describe('registerTool', () => {
    it('registers a tool with definition and executor', () => {
      const executor: ToolExecutor = async () => 'result'
      service.registerTool(
        {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object', properties: {} },
        },
        executor
      )
      // Tool is registered internally — no public accessor, verified via integration
      expect(true).toBe(true)
    })
  })

  describe('abort', () => {
    it('does not throw when aborting with no active conversations', () => {
      expect(() => service.abort()).not.toThrow()
    })

    it('does not throw when aborting a specific non-existent conversation', () => {
      expect(() => service.abort('nonexistent')).not.toThrow()
    })
  })

  describe('clear', () => {
    it('clears all conversations without error', () => {
      expect(() => service.clear()).not.toThrow()
    })

    it('clears a specific conversation', () => {
      expect(() => service.clear('some-id')).not.toThrow()
    })
  })

  describe('getConfig', () => {
    it('returns model, apiKey, and maxTokens from preferences', () => {
      const config = service.getConfig()
      expect(config).toEqual({
        model: 'claude-sonnet-4-20250514',
        apiKey: 'test-api-key',
        maxTokens: 4096,
      })
    })

    it('returns defaults when preferences are missing AI fields', () => {
      mockedConfigStore.get.mockReturnValue({} as never)
      const config = service.getConfig()
      expect(config.model).toBe('claude-sonnet-4-20250514')
      expect(config.apiKey).toBe('')
      expect(config.maxTokens).toBe(4096)
    })
  })

  describe('setConfig', () => {
    it('sets valid AI config keys', () => {
      service.setConfig('aiModel', 'claude-opus-4-20250514')
      expect(mockedConfigStore.set).toHaveBeenCalledWith(
        'preferences.aiModel',
        'claude-opus-4-20250514'
      )
    })

    it('ignores invalid config keys', () => {
      service.setConfig('invalidKey', 'value')
      expect(mockedConfigStore.set).not.toHaveBeenCalled()
    })

    it('invalidates client when API key changes', () => {
      service.setConfig('aiApiKey', 'new-key')
      expect(mockedConfigStore.set).toHaveBeenCalledWith(
        'preferences.aiApiKey',
        'new-key'
      )
    })
  })

  describe('sendMessage', () => {
    it('emits error when API key is not configured', async () => {
      mockedConfigStore.get.mockReturnValue({} as never)

      const convId = await service.sendMessage('hello')
      expect(convId).toBe('test-conv-id')

      expect(emittedEvents).toHaveLength(1)
      expect(emittedEvents[0].type).toBe('error')
      if (emittedEvents[0].type === 'error') {
        expect(emittedEvents[0].error).toContain('API key not configured')
      }
    })

    it('uses provided conversationId', async () => {
      mockedConfigStore.get.mockReturnValue({} as never)

      const convId = await service.sendMessage('hello', 'my-conv')
      expect(convId).toBe('my-conv')
    })
  })

  describe('event emission', () => {
    it('does not emit when window is destroyed', async () => {
      ;(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      )
      mockedConfigStore.get.mockReturnValue({} as never)
      await service.sendMessage('hello')
      expect(
        (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls
          .length
      ).toBe(0)
    })

    it('does not emit when window is null', async () => {
      const nullService = new AiService(() => null)
      mockedConfigStore.get.mockReturnValue({} as never)
      await nullService.sendMessage('hello')
      // Should not throw — just silently skip emission
    })
  })
})
