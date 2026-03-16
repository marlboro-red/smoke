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
  caseSensitive: boolean
  regex: boolean

  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => void
  search: (query: string) => void
  toggleCaseSensitive: () => void
  toggleRegex: () => void
}

export function searchContent(
  lines: string[],
  query: string,
  sessionId: string,
  sessionTitle: string,
  sessionType: ElementType,
  caseSensitive: boolean,
  useRegex: boolean
): SearchMatch[] {
  const matches: SearchMatch[] = []

  if (useRegex) {
    let re: RegExp
    try {
      re = new RegExp(query, caseSensitive ? 'g' : 'gi')
    } catch {
      return matches
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue }
        matches.push({
          sessionId,
          sessionTitle,
          sessionType,
          lineNumber: i + 1,
          lineContent: line,
          matchStart: m.index,
          matchEnd: m.index + m[0].length,
        })
      }
    }
  } else {
    const searchQuery = caseSensitive ? query : query.toLowerCase()

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const searchLine = caseSensitive ? line : line.toLowerCase()
      let searchFrom = 0

      while (searchFrom < searchLine.length) {
        const idx = searchLine.indexOf(searchQuery, searchFrom)
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
  }

  return matches
}

function performSearch(query: string, caseSensitive: boolean, useRegex: boolean): SearchResultGroup[] {
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
        matches = searchContent(lines, query, id, session.title, session.type, caseSensitive, useRegex)
      }
    } else if (session.type === 'file') {
      const lines = session.content.split('\n')
      matches = searchContent(lines, query, id, session.title, session.type, caseSensitive, useRegex)
    } else if (session.type === 'note') {
      const lines = session.content.split('\n')
      matches = searchContent(lines, query, id, session.title, session.type, caseSensitive, useRegex)
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

export const canvasSearchStore = createStore<CanvasSearchStore>((set, get) => ({
  isOpen: false,
  query: '',
  results: [],
  caseSensitive: false,
  regex: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', results: [] }),
  toggle: () =>
    set((s) => (s.isOpen ? { isOpen: false, query: '', results: [] } : { isOpen: true })),
  setQuery: (query: string) => {
    const { caseSensitive, regex } = get()
    const results = performSearch(query, caseSensitive, regex)
    set({ query, results })
  },
  search: (query: string) => {
    const { caseSensitive, regex } = get()
    const results = performSearch(query, caseSensitive, regex)
    set({ results })
  },
  toggleCaseSensitive: () => {
    const { caseSensitive, query, regex } = get()
    const newCs = !caseSensitive
    const results = performSearch(query, newCs, regex)
    set({ caseSensitive: newCs, results })
  },
  toggleRegex: () => {
    const { regex, query, caseSensitive } = get()
    const newRegex = !regex
    const results = performSearch(query, caseSensitive, newRegex)
    set({ regex: newRegex, results })
  },
}))

export const useCanvasSearchOpen = (): boolean =>
  useStore(canvasSearchStore, (s) => s.isOpen)

export const useCanvasSearchQuery = (): string =>
  useStore(canvasSearchStore, (s) => s.query)

export const useCanvasSearchResults = (): SearchResultGroup[] =>
  useStore(canvasSearchStore, useShallow((s) => s.results))

export const useCanvasSearchCaseSensitive = (): boolean =>
  useStore(canvasSearchStore, (s) => s.caseSensitive)

export const useCanvasSearchRegex = (): boolean =>
  useStore(canvasSearchStore, (s) => s.regex)
