import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentManager } from '../AgentManager'
import type { BrowserWindow } from 'electron'

// Mock dependencies
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}))

vi.mock('../../config/ConfigStore', () => ({
  configStore: {
    get: vi.fn().mockReturnValue({
      aiModel: 'claude-sonnet-4-20250514',
      aiApiKey: 'test-key',
      aiMaxTokens: 4096,
    }),
    set: vi.fn(),
  },
  defaultPreferences: {},
}))

vi.mock('uuid', () => ({
  v4: (() => {
    let counter = 0
    return () => `uuid-${++counter}`
  })(),
}))

function createMockWindow(): BrowserWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow
}

describe('AgentManager', () => {
  let manager: AgentManager
  let mockWindow: BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindow = createMockWindow()
    manager = new AgentManager(() => mockWindow)
  })

  describe('createAgent', () => {
    it('creates an agent and returns its ID', () => {
      const agentId = manager.createAgent('Test Agent')
      expect(agentId).toBeTruthy()
    })

    it('creates agents with unique IDs', () => {
      const id1 = manager.createAgent('Agent 1')
      const id2 = manager.createAgent('Agent 2')
      expect(id1).not.toBe(id2)
    })
  })

  describe('getAgent', () => {
    it('returns the created agent', () => {
      const agentId = manager.createAgent('Test Agent')
      const agent = manager.getAgent(agentId)
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('Test Agent')
      expect(agent!.agentId).toBe(agentId)
    })

    it('returns undefined for unknown ID', () => {
      expect(manager.getAgent('nonexistent')).toBeUndefined()
    })
  })

  describe('listAgents', () => {
    it('returns empty list when no agents exist', () => {
      expect(manager.listAgents()).toEqual([])
    })

    it('returns all created agents', () => {
      manager.createAgent('Agent A')
      manager.createAgent('Agent B')
      const agents = manager.listAgents()
      expect(agents).toHaveLength(2)
      expect(agents.map((a) => a.name)).toContain('Agent A')
      expect(agents.map((a) => a.name)).toContain('Agent B')
    })
  })

  describe('removeAgent', () => {
    it('removes an existing agent', () => {
      const agentId = manager.createAgent('Test Agent')
      const removed = manager.removeAgent(agentId)
      expect(removed).toBe(true)
      expect(manager.getAgent(agentId)).toBeUndefined()
      expect(manager.listAgents()).toHaveLength(0)
    })

    it('returns false for unknown ID', () => {
      expect(manager.removeAgent('nonexistent')).toBe(false)
    })
  })

  describe('abortAll', () => {
    it('does not throw when no agents exist', () => {
      expect(() => manager.abortAll()).not.toThrow()
    })

    it('does not throw with active agents', () => {
      manager.createAgent('Agent 1')
      manager.createAgent('Agent 2')
      expect(() => manager.abortAll()).not.toThrow()
    })
  })
})
