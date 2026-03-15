import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { v4 as uuidv4 } from 'uuid'

// --- Content block types ---

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

// --- Message types ---

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: ContentBlock[]
  timestamp: number
}

// --- Store ---

interface AiStore {
  messages: ChatMessage[]
  isGenerating: boolean
  error: string | null
  panelOpen: boolean

  addUserMessage: (text: string) => ChatMessage
  addAssistantMessage: () => ChatMessage
  appendText: (messageId: string, text: string) => void
  addToolUse: (messageId: string, toolUse: Omit<ToolUseBlock, 'type'>) => void
  addToolResult: (messageId: string, toolResult: Omit<ToolResultBlock, 'type'>) => void
  completeGeneration: () => void
  setGenerating: (generating: boolean) => void
  setError: (error: string | null) => void
  clearHistory: () => void
  togglePanel: () => void
}

export const aiStore = createStore<AiStore>((set, get) => ({
  messages: [],
  isGenerating: false,
  error: null,
  panelOpen: false,

  addUserMessage: (text: string): ChatMessage => {
    const message: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    }
    set((state) => ({
      messages: [...state.messages, message],
      error: null,
    }))
    return message
  },

  addAssistantMessage: (): ChatMessage => {
    const message: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: [],
      timestamp: Date.now(),
    }
    set((state) => ({
      messages: [...state.messages, message],
      isGenerating: true,
      error: null,
    }))
    return message
  },

  appendText: (messageId: string, text: string) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
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
    }))
  },

  addToolUse: (messageId: string, toolUse: Omit<ToolUseBlock, 'type'>) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg
        return {
          ...msg,
          content: [...msg.content, { type: 'tool_use' as const, ...toolUse }],
        }
      }),
    }))
  },

  addToolResult: (messageId: string, toolResult: Omit<ToolResultBlock, 'type'>) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg
        return {
          ...msg,
          content: [...msg.content, { type: 'tool_result' as const, ...toolResult }],
        }
      }),
    }))
  },

  completeGeneration: () => {
    set({ isGenerating: false })
  },

  setGenerating: (generating: boolean) => {
    set({ isGenerating: generating })
  },

  setError: (error: string | null) => {
    set({ error, isGenerating: false })
  },

  clearHistory: () => {
    set({ messages: [], isGenerating: false, error: null })
  },

  togglePanel: () => {
    set((state) => ({ panelOpen: !state.panelOpen }))
  },
}))

// --- Selector hooks ---

export const useAiMessages = (): ChatMessage[] =>
  useStore(aiStore, useShallow((state) => state.messages))

export const useAiIsGenerating = (): boolean =>
  useStore(aiStore, (state) => state.isGenerating)

export const useAiError = (): string | null =>
  useStore(aiStore, (state) => state.error)

export const useAiPanelOpen = (): boolean =>
  useStore(aiStore, (state) => state.panelOpen)

export const useAiStore = <T>(selector: (state: AiStore) => T): T =>
  useStore(aiStore, selector)
