import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentManager, AGENT_COLORS } from '../AgentManager'
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

    it('assigns colors from palette', () => {
      const id1 = manager.createAgent('Agent 1')
      const id2 = manager.createAgent('Agent 2')
      const color1 = manager.getAgentColor(id1)
      const color2 = manager.getAgentColor(id2)
      expect(AGENT_COLORS).toContain(color1)
      expect(AGENT_COLORS).toContain(color2)
      expect(color1).not.toBe(color2)
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

    it('returns all created agents with metadata', () => {
      manager.createAgent('Agent A')
      manager.createAgent('Agent B')
      const agents = manager.listAgents()
      expect(agents).toHaveLength(2)
      expect(agents.map((a) => a.name)).toContain('Agent A')
      expect(agents.map((a) => a.name)).toContain('Agent B')
      // Should include groupId, role, color
      for (const agent of agents) {
        expect(agent.groupId).toBeNull()
        expect(agent.role).toBeNull()
        expect(agent.color).toBeTruthy()
      }
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

    it('cleans up agent metadata', () => {
      const agentId = manager.createAgent('Test')
      manager.assignGroup(agentId, 'g1', ['s1'])
      manager.removeAgent(agentId)
      expect(manager.getAgentMeta(agentId)).toBeUndefined()
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

  describe('assignGroup', () => {
    it('assigns agent to a group with scope', () => {
      const id = manager.createAgent('Agent')
      manager.assignGroup(id, 'g1', ['s1', 's2'])
      const meta = manager.getAgentMeta(id)!
      expect(meta.groupId).toBe('g1')
      expect(meta.allowedSessionIds).toEqual(new Set(['s1', 's2']))
    })

    it('clears scope when group is null', () => {
      const id = manager.createAgent('Agent')
      manager.assignGroup(id, 'g1', ['s1'])
      manager.assignGroup(id, null)
      const meta = manager.getAgentMeta(id)!
      expect(meta.groupId).toBeNull()
      expect(meta.allowedSessionIds).toBeNull()
    })

    it('creates empty scope when no memberSessionIds given', () => {
      const id = manager.createAgent('Agent')
      manager.assignGroup(id, 'g1')
      const meta = manager.getAgentMeta(id)!
      expect(meta.allowedSessionIds).toEqual(new Set())
    })

    it('appears in listAgents output', () => {
      const id = manager.createAgent('Agent')
      manager.assignGroup(id, 'g1')
      const agents = manager.listAgents()
      expect(agents.find((a) => a.id === id)?.groupId).toBe('g1')
    })
  })

  describe('setAgentRole', () => {
    it('sets the role', () => {
      const id = manager.createAgent('Agent')
      manager.setAgentRole(id, 'frontend')
      expect(manager.getAgentMeta(id)!.role).toBe('frontend')
    })

    it('clears role with null', () => {
      const id = manager.createAgent('Agent')
      manager.setAgentRole(id, 'backend')
      manager.setAgentRole(id, null)
      expect(manager.getAgentMeta(id)!.role).toBeNull()
    })

    it('appears in listAgents output', () => {
      const id = manager.createAgent('Agent')
      manager.setAgentRole(id, 'frontend')
      expect(manager.listAgents().find((a) => a.id === id)?.role).toBe('frontend')
    })
  })

  describe('updateScope', () => {
    it('updates the allowed session IDs', () => {
      const id = manager.createAgent('Agent')
      manager.assignGroup(id, 'g1', ['s1'])
      manager.updateScope(id, ['s1', 's2', 's3'])
      expect(manager.getAgentMeta(id)!.allowedSessionIds).toEqual(new Set(['s1', 's2', 's3']))
    })

    it('does nothing when agent has no group', () => {
      const id = manager.createAgent('Agent')
      manager.updateScope(id, ['s1'])
      expect(manager.getAgentMeta(id)!.allowedSessionIds).toBeNull()
    })
  })
})
