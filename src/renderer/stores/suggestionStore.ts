import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

export interface FileSuggestion {
  id: string
  filePath: string
  displayName: string
  relevanceScore: number
  reason: 'import' | 'dependent' | 'keyword'
  /** Canvas position where the ghost should appear */
  position: { x: number; y: number }
}

interface SuggestionStore {
  suggestions: FileSuggestion[]
  /** The file path that triggered the current suggestions */
  sourceFilePath: string | null
  /** Whether suggestion fetching is in progress */
  loading: boolean
  /** Whether the feature is enabled */
  enabled: boolean

  setSuggestions: (suggestions: FileSuggestion[], sourceFilePath: string) => void
  clearSuggestions: () => void
  removeSuggestion: (id: string) => void
  setLoading: (loading: boolean) => void
  setEnabled: (enabled: boolean) => void
}

export const suggestionStore = createStore<SuggestionStore>((set) => ({
  suggestions: [],
  sourceFilePath: null,
  loading: false,
  enabled: true,

  setSuggestions: (suggestions, sourceFilePath) => {
    set({ suggestions, sourceFilePath })
  },

  clearSuggestions: () => {
    set({ suggestions: [], sourceFilePath: null })
  },

  removeSuggestion: (id) => {
    set((state) => ({
      suggestions: state.suggestions.filter((s) => s.id !== id),
    }))
  },

  setLoading: (loading) => {
    set({ loading })
  },

  setEnabled: (enabled) => {
    set({ enabled })
    if (!enabled) {
      set({ suggestions: [], sourceFilePath: null })
    }
  },
}))

export const useSuggestions = (): FileSuggestion[] =>
  useStore(suggestionStore, useShallow((state) => state.suggestions))

export const useSuggestionEnabled = (): boolean =>
  useStore(suggestionStore, (state) => state.enabled)

export const useSuggestionLoading = (): boolean =>
  useStore(suggestionStore, (state) => state.loading)
