import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ElementType } from '../stores/sessionStore'
import { sessionStore } from '../stores/sessionStore'
import { getTerminal } from '../terminal/terminalRegistry'

export interface SearchMatch {
  sessionId: string
  sessionTitle: string
  sessionType: ElementType
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

export interface SearchResultGroup {
  sessionId: string
  sessionTitle: string
  sessionType: ElementType
  matches: SearchMatch[]
}

interface CanvasSearchStore {
  isOpen: boolean
  query: string
  results: SearchResultGroup[]

  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => void
  search: (query: string) => void
}

function searchContent(
  lines: string[],
  query: string,
  sessionId: string,
  sessionTitle: string,
  sessionType: ElementType
): SearchMatch[] {
  const matches: SearchMatch[] = []
  const lowerQuery = query.toLowerCase()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lowerLine = line.toLowerCase()
    let searchFrom = 0

    while (searchFrom < lowerLine.length) {
      const idx = lowerLine.indexOf(lowerQuery, searchFrom)
      if (idx === -1) break

      matches.push({
        sessionId,
        sessionTitle,
        sessionType,
        lineNumber: i + 1,
        lineContent: line,
        matchStart: idx,
        matchEnd: idx + query.length,
      })
      searchFrom = idx + 1
    }
  }

  return matches
}

function performSearch(query: string): SearchResultGroup[] {
  if (!query.trim()) return []

  const sessions = sessionStore.getState().sessions
  const groups: SearchResultGroup[] = []

  for (const [id, session] of sessions) {
    let matches: SearchMatch[] = []

    if (session.type === 'terminal') {
      const entry = getTerminal(id)
      if (entry) {
        const buffer = entry.terminal.buffer.active
        const lines: string[] = []
        for (let i = 0; i < buffer.length; i++) {
          lines.push(buffer.getLine(i)?.translateToString() || '')
        }
        matches = searchContent(lines, query, id, session.title, session.type)
      }
    } else if (session.type === 'file') {
      const lines = session.content.split('\n')
      matches = searchContent(lines, query, id, session.title, session.type)
    } else if (session.type === 'note') {
      const lines = session.content.split('\n')
      matches = searchContent(lines, query, id, session.title, session.type)
    }

    if (matches.length > 0) {
      groups.push({
        sessionId: id,
        sessionTitle: session.title,
        sessionType: session.type,
        matches,
      })
    }
  }

  return groups
}

export const canvasSearchStore = createStore<CanvasSearchStore>((set) => ({
  isOpen: false,
  query: '',
  results: [],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', results: [] }),
  toggle: () =>
    set((s) => (s.isOpen ? { isOpen: false, query: '', results: [] } : { isOpen: true })),
  setQuery: (query: string) => {
    const results = performSearch(query)
    set({ query, results })
  },
  search: (query: string) => {
    const results = performSearch(query)
    set({ results })
  },
}))

export const useCanvasSearchOpen = (): boolean =>
  useStore(canvasSearchStore, (s) => s.isOpen)

export const useCanvasSearchQuery = (): string =>
  useStore(canvasSearchStore, (s) => s.query)

export const useCanvasSearchResults = (): SearchResultGroup[] =>
  useStore(canvasSearchStore, useShallow((s) => s.results))
