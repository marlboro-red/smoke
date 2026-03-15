import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search'
import { getTerminal } from './terminalRegistry'

interface TerminalSearchState {
  /** Session ID of the terminal currently being searched, or null */
  activeSessionId: string | null
  query: string
  caseSensitive: boolean
  regex: boolean
  resultIndex: number
  resultCount: number
}

interface TerminalSearchActions {
  open: (sessionId: string) => void
  close: () => void
  setQuery: (query: string) => void
  toggleCaseSensitive: () => void
  toggleRegex: () => void
  findNext: () => void
  findPrevious: () => void
  setResults: (index: number, count: number) => void
}

type TerminalSearchStore = TerminalSearchState & TerminalSearchActions

// Map of sessionId -> SearchAddon instance
const searchAddons = new Map<string, SearchAddon>()

function getSearchOptions(state: TerminalSearchState): ISearchOptions {
  return {
    caseSensitive: state.caseSensitive,
    regex: state.regex,
    incremental: true,
    decorations: {
      matchBackground: '#614D1A',
      matchBorder: '#00000000',
      matchOverviewRuler: '#D19A66',
      activeMatchBackground: '#515C6A',
      activeMatchBorder: '#00000000',
      activeMatchColorOverviewRuler: '#A0D8EF',
    },
  }
}

export function getOrCreateSearchAddon(sessionId: string): SearchAddon | null {
  let addon = searchAddons.get(sessionId)
  if (addon) return addon

  const entry = getTerminal(sessionId)
  if (!entry) return null

  addon = new SearchAddon()
  entry.terminal.loadAddon(addon)
  searchAddons.set(sessionId, addon)

  addon.onDidChangeResults((e) => {
    terminalSearchStore.getState().setResults(e.resultIndex, e.resultCount)
  })

  return addon
}

export function disposeSearchAddon(sessionId: string): void {
  const addon = searchAddons.get(sessionId)
  if (addon) {
    addon.dispose()
    searchAddons.delete(sessionId)
  }
}

export const terminalSearchStore = createStore<TerminalSearchStore>((set, get) => ({
  activeSessionId: null,
  query: '',
  caseSensitive: false,
  regex: false,
  resultIndex: -1,
  resultCount: 0,

  open: (sessionId) => {
    const current = get()
    if (current.activeSessionId === sessionId) return
    // Close previous search if any
    if (current.activeSessionId) {
      const prevAddon = searchAddons.get(current.activeSessionId)
      prevAddon?.clearDecorations()
    }
    set({ activeSessionId: sessionId, query: '', resultIndex: -1, resultCount: 0 })
    getOrCreateSearchAddon(sessionId)
  },

  close: () => {
    const { activeSessionId } = get()
    if (activeSessionId) {
      const addon = searchAddons.get(activeSessionId)
      addon?.clearDecorations()
    }
    set({ activeSessionId: null, query: '', resultIndex: -1, resultCount: 0 })
  },

  setQuery: (query) => {
    set({ query })
    const { activeSessionId } = get()
    if (!activeSessionId) return
    const addon = searchAddons.get(activeSessionId)
    if (!addon) return
    if (query) {
      addon.findNext(query, getSearchOptions(get()))
    } else {
      addon.clearDecorations()
      set({ resultIndex: -1, resultCount: 0 })
    }
  },

  toggleCaseSensitive: () => {
    set((s) => ({ caseSensitive: !s.caseSensitive }))
    const state = get()
    if (state.activeSessionId && state.query) {
      const addon = searchAddons.get(state.activeSessionId)
      addon?.findNext(state.query, getSearchOptions(state))
    }
  },

  toggleRegex: () => {
    set((s) => ({ regex: !s.regex }))
    const state = get()
    if (state.activeSessionId && state.query) {
      const addon = searchAddons.get(state.activeSessionId)
      addon?.findNext(state.query, getSearchOptions(state))
    }
  },

  findNext: () => {
    const { activeSessionId, query } = get()
    if (!activeSessionId || !query) return
    const addon = searchAddons.get(activeSessionId)
    addon?.findNext(query, { ...getSearchOptions(get()), incremental: false })
  },

  findPrevious: () => {
    const { activeSessionId, query } = get()
    if (!activeSessionId || !query) return
    const addon = searchAddons.get(activeSessionId)
    addon?.findPrevious(query, getSearchOptions(get()))
  },

  setResults: (resultIndex, resultCount) => {
    set({ resultIndex, resultCount })
  },
}))

export function useTerminalSearch(): TerminalSearchStore {
  return useStore(terminalSearchStore)
}

export function useTerminalSearchActive(sessionId: string): boolean {
  return useStore(terminalSearchStore, (s) => s.activeSessionId === sessionId)
}
