import { describe, it, expect, beforeEach, vi } from 'vitest'
import { agentStore, findAgentByGroupId, findAgentBySessionGroupId, AGENT_COLORS } from '../agentStore'

vi.mock('uuid', () => ({
  v4: (() => {
    let counter = 0
    return () => `msg-${++counter}`
  })(),
}))

describe('agentStore', () => {
  beforeEach(() => {
    // Reset the store
    agentStore.setState({
      agents: new Map(),
      activeAgentId: null,
    })
  })

  describe('addAgent / removeAgent', () => {
    it('adds an agent and sets it as active if first', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      const state = agentStore.getState()
      expect(state.agents.size).toBe(1)
      expect(state.agents.get('a1')?.name).toBe('Agent 1')
      expect(state.activeAgentId).toBe('a1')
    })

    it('does not change active agent when adding a second agent', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().addAgent('a2', 'Agent 2')
      expect(agentStore.getState().activeAgentId).toBe('a1')
    })

    it('removes an agent and switches active if needed', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().addAgent('a2', 'Agent 2')
      agentStore.getState().removeAgent('a1')
      const state = agentStore.getState()
      expect(state.agents.size).toBe(1)
      expect(state.activeAgentId).toBe('a2')
    })

    it('sets activeAgentId to null when last agent is removed', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().removeAgent('a1')
      expect(agentStore.getState().activeAgentId).toBeNull()
    })

    it('assigns a color from the palette', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      const agent = agentStore.getState().agents.get('a1')!
      expect(AGENT_COLORS).toContain(agent.color)
    })

    it('uses provided color when specified', () => {
      agentStore.getState().addAgent('a1', 'Agent 1', '#ff0000')
      expect(agentStore.getState().agents.get('a1')!.color).toBe('#ff0000')
    })

    it('assigns different colors to consecutive agents', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().addAgent('a2', 'Agent 2')
      const c1 = agentStore.getState().agents.get('a1')!.color
      const c2 = agentStore.getState().agents.get('a2')!.color
      expect(c1).not.toBe(c2)
    })

    it('initializes new fields to null/defaults', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      const agent = agentStore.getState().agents.get('a1')!
      expect(agent.assignedGroupId).toBeNull()
      expect(agent.role).toBeNull()
      expect(agent.model).toBeNull()
      expect(agent.color).toBeTruthy()
    })
  })

  describe('setActiveAgent', () => {
    it('switches active agent', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().addAgent('a2', 'Agent 2')
      agentStore.getState().setActiveAgent('a2')
      expect(agentStore.getState().activeAgentId).toBe('a2')
    })
  })

  describe('assignGroup', () => {
    it('assigns a group to an agent', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().assignGroup('a1', 'g1')
      expect(agentStore.getState().agents.get('a1')!.assignedGroupId).toBe('g1')
    })

    it('clears group assignment with null', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().assignGroup('a1', 'g1')
      agentStore.getState().assignGroup('a1', null)
      expect(agentStore.getState().agents.get('a1')!.assignedGroupId).toBeNull()
    })

    it('does not affect other agents', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().addAgent('a2', 'Agent 2')
      agentStore.getState().assignGroup('a1', 'g1')
      expect(agentStore.getState().agents.get('a2')!.assignedGroupId).toBeNull()
    })
  })

  describe('setRole', () => {
    it('sets a role on an agent', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().setRole('a1', 'frontend')
      expect(agentStore.getState().agents.get('a1')!.role).toBe('frontend')
    })

    it('clears role with null', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().setRole('a1', 'backend')
      agentStore.getState().setRole('a1', null)
      expect(agentStore.getState().agents.get('a1')!.role).toBeNull()
    })
  })

  describe('setModel', () => {
    it('sets a model on an agent', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().setModel('a1', 'claude-sonnet-4-6')
      expect(agentStore.getState().agents.get('a1')!.model).toBe('claude-sonnet-4-6')
    })

    it('clears model with null', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().setModel('a1', 'claude-opus-4-6')
      agentStore.getState().setModel('a1', null)
      expect(agentStore.getState().agents.get('a1')!.model).toBeNull()
    })
  })

  describe('findAgentByGroupId', () => {
    it('finds agent assigned to a group', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().assignGroup('a1', 'g1')
      const agent = findAgentByGroupId('g1')
      expect(agent?.id).toBe('a1')
    })

    it('returns undefined for unassigned group', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      expect(findAgentByGroupId('g1')).toBeUndefined()
    })
  })

  describe('findAgentBySessionGroupId', () => {
    it('returns undefined for undefined groupId', () => {
      expect(findAgentBySessionGroupId(undefined)).toBeUndefined()
    })

    it('finds agent for session group', () => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().assignGroup('a1', 'g1')
      expect(findAgentBySessionGroupId('g1')?.id).toBe('a1')
    })
  })

  describe('per-agent messages', () => {
    beforeEach(() => {
      agentStore.getState().addAgent('a1', 'Agent 1')
      agentStore.getState().addAgent('a2', 'Agent 2')
    })

    it('adds user message to correct agent', () => {
      agentStore.getState().addUserMessage('a1', 'hello from a1')
      expect(agentStore.getState().agents.get('a1')!.messages).toHaveLength(1)
      expect(agentStore.getState().agents.get('a2')!.messages).toHaveLength(0)
    })

    it('adds assistant message and sets isGenerating', () => {
      const msg = agentStore.getState().addAssistantMessage('a1')
      expect(msg).toBeTruthy()
      expect(agentStore.getState().agents.get('a1')!.isGenerating).toBe(true)
      expect(agentStore.getState().agents.get('a2')!.isGenerating).toBe(false)
    })

    it('appends text to correct message in correct agent', () => {
      const msg = agentStore.getState().addAssistantMessage('a1')!
      agentStore.getState().appendText('a1', msg.id, 'hello ')
      agentStore.getState().appendText('a1', msg.id, 'world')
      const messages = agentStore.getState().agents.get('a1')!.messages
      expect(messages[0].content[0]).toEqual({ type: 'text', text: 'hello world' })
    })

    it('adds tool use to correct agent', () => {
      const msg = agentStore.getState().addAssistantMessage('a1')!
      agentStore.getState().addToolUse('a1', msg.id, {
        id: 'tu1',
        name: 'test_tool',
        input: { key: 'val' },
      })
      const content = agentStore.getState().agents.get('a1')!.messages[0].content
      expect(content[0]).toMatchObject({ type: 'tool_use', name: 'test_tool' })
    })

    it('adds tool result to correct agent', () => {
      const msg = agentStore.getState().addAssistantMessage('a1')!
      agentStore.getState().addToolResult('a1', msg.id, {
        tool_use_id: 'tu1',
        content: 'result text',
      })
      const content = agentStore.getState().agents.get('a1')!.messages[0].content
      expect(content[0]).toMatchObject({ type: 'tool_result', content: 'result text' })
    })

    it('completes generation for specific agent', () => {
      agentStore.getState().addAssistantMessage('a1')
      agentStore.getState().addAssistantMessage('a2')
      agentStore.getState().completeGeneration('a1')
      expect(agentStore.getState().agents.get('a1')!.isGenerating).toBe(false)
      expect(agentStore.getState().agents.get('a2')!.isGenerating).toBe(true)
    })

    it('sets error for specific agent', () => {
      agentStore.getState().addAssistantMessage('a1')
      agentStore.getState().setError('a1', 'something broke')
      expect(agentStore.getState().agents.get('a1')!.error).toBe('something broke')
      expect(agentStore.getState().agents.get('a1')!.isGenerating).toBe(false)
      expect(agentStore.getState().agents.get('a2')!.error).toBeNull()
    })

    it('clears history for specific agent only', () => {
      agentStore.getState().addUserMessage('a1', 'msg a1')
      agentStore.getState().addUserMessage('a2', 'msg a2')
      agentStore.getState().clearHistory('a1')
      expect(agentStore.getState().agents.get('a1')!.messages).toHaveLength(0)
      expect(agentStore.getState().agents.get('a2')!.messages).toHaveLength(1)
    })

    it('truncates messages when exceeding MAX_MESSAGES_PER_AGENT (500)', () => {
      const state = agentStore.getState()
      // Add 510 user messages
      for (let i = 0; i < 510; i++) {
        state.addUserMessage('a1', `message ${i}`)
      }
      const messages = agentStore.getState().agents.get('a1')!.messages
      expect(messages.length).toBe(500)
      // The oldest messages should have been trimmed — first kept message is #10
      const firstText = (messages[0].content[0] as { type: 'text'; text: string }).text
      expect(firstText).toBe('message 10')
    })
  })
})
