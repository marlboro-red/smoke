import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ChatMessage, ContentBlock, ToolUseBlock, ToolResultBlock } from './aiStore'
import { v4 as uuidv4 } from 'uuid'

// --- Per-agent state ---

export interface AgentState {
  id: string
  name: string
  messages: ChatMessage[]
  isGenerating: boolean
  error: string | null
}

// --- Store ---

interface AgentStoreState {
  agents: Map<string, AgentState>
  activeAgentId: string | null

  // Agent lifecycle
  addAgent: (id: string, name: string) => void
  removeAgent: (id: string) => void
  setActiveAgent: (id: string | null) => void

  // Per-agent message operations
  addUserMessage: (agentId: string, text: string) => ChatMessage | null
  addAssistantMessage: (agentId: string) => ChatMessage | null
  appendText: (agentId: string, messageId: string, text: string) => void
  addToolUse: (agentId: string, messageId: string, toolUse: Omit<ToolUseBlock, 'type'>) => void
  addToolResult: (agentId: string, messageId: string, toolResult: Omit<ToolResultBlock, 'type'>) => void
  completeGeneration: (agentId: string) => void
  setError: (agentId: string, error: string | null) => void
  clearHistory: (agentId: string) => void
}

function updateAgent(
  agents: Map<string, AgentState>,
  agentId: string,
  updater: (agent: AgentState) => AgentState
): Map<string, AgentState> {
  const agent = agents.get(agentId)
  if (!agent) return agents
  const next = new Map(agents)
  next.set(agentId, updater(agent))
  return next
}

export const agentStore = createStore<AgentStoreState>((set, get) => ({
  agents: new Map(),
  activeAgentId: null,

  addAgent: (id, name) => {
    set((state) => {
      const agents = new Map(state.agents)
      agents.set(id, {
        id,
        name,
        messages: [],
        isGenerating: false,
        error: null,
      })
      return {
        agents,
        activeAgentId: state.activeAgentId ?? id,
      }
    })
  },

  removeAgent: (id) => {
    set((state) => {
      const agents = new Map(state.agents)
      agents.delete(id)
      let activeAgentId = state.activeAgentId
      if (activeAgentId === id) {
        const remaining = Array.from(agents.keys())
        activeAgentId = remaining.length > 0 ? remaining[0] : null
      }
      return { agents, activeAgentId }
    })
  },

  setActiveAgent: (id) => {
    set({ activeAgentId: id })
  },

  addUserMessage: (agentId, text) => {
    const message: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    }
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        messages: [...a.messages, message],
        error: null,
      })),
    }))
    return message
  },

  addAssistantMessage: (agentId) => {
    const message: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: [],
      timestamp: Date.now(),
    }
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        messages: [...a.messages, message],
        isGenerating: true,
        error: null,
      })),
    }))
    return message
  },

  appendText: (agentId, messageId, text) => {
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        messages: a.messages.map((msg) => {
          if (msg.id !== messageId) return msg
          const lastBlock = msg.content[msg.content.length - 1]
          if (lastBlock && lastBlock.type === 'text') {
            return {
              ...msg,
              content: [
                ...msg.content.slice(0, -1),
                { ...lastBlock, text: lastBlock.text + text },
              ],
            }
          }
          return {
            ...msg,
            content: [...msg.content, { type: 'text' as const, text }],
          }
        }),
      })),
    }))
  },

  addToolUse: (agentId, messageId, toolUse) => {
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        messages: a.messages.map((msg) => {
          if (msg.id !== messageId) return msg
          return {
            ...msg,
            content: [...msg.content, { type: 'tool_use' as const, ...toolUse }],
          }
        }),
      })),
    }))
  },

  addToolResult: (agentId, messageId, toolResult) => {
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        messages: a.messages.map((msg) => {
          if (msg.id !== messageId) return msg
          return {
            ...msg,
            content: [...msg.content, { type: 'tool_result' as const, ...toolResult }],
          }
        }),
      })),
    }))
  },

  completeGeneration: (agentId) => {
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        isGenerating: false,
      })),
    }))
  },

  setError: (agentId, error) => {
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        error,
        isGenerating: false,
      })),
    }))
  },

  clearHistory: (agentId) => {
    set((state) => ({
      agents: updateAgent(state.agents, agentId, (a) => ({
        ...a,
        messages: [],
        isGenerating: false,
        error: null,
      })),
    }))
  },
}))

// --- Selector hooks ---

export const useAgents = (): AgentState[] =>
  useStore(agentStore, useShallow((state) => Array.from(state.agents.values())))

export const useActiveAgentId = (): string | null =>
  useStore(agentStore, (state) => state.activeAgentId)

export const useActiveAgent = (): AgentState | null =>
  useStore(
    agentStore,
    useShallow((state) => {
      if (!state.activeAgentId) return null
      return state.agents.get(state.activeAgentId) ?? null
    })
  )

export const useAgentStore = <T>(selector: (state: AgentStoreState) => T): T =>
  useStore(agentStore, selector)
