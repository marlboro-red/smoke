import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface Session {
  id: string
  title: string
  cwd: string
  position: { x: number; y: number }
  size: { cols: number; rows: number; width: number; height: number }
  zIndex: number
  status: 'running' | 'exited'
  exitCode?: number
  createdAt: number
}

interface SessionStore {
  sessions: Map<string, Session>
  focusedId: string | null
  highlightedId: string | null
  nextZIndex: number

  createSession: (cwd: string, position?: { x: number; y: number }) => Session
  removeSession: (id: string) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  focusSession: (id: string) => void
  highlightSession: (id: string | null) => void
  bringToFront: (id: string) => void
}

export const sessionStore = createStore<SessionStore>((set, get) => ({
  sessions: new Map(),
  focusedId: null,
  highlightedId: null,
  nextZIndex: 1,

  createSession: (cwd: string, position?: { x: number; y: number }): Session => {
    const { nextZIndex } = get()
    const session: Session = {
      id: uuidv4(),
      title: cwd.split('/').pop() || cwd,
      cwd,
      position: position ?? { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
      zIndex: nextZIndex,
      status: 'running',
      createdAt: Date.now(),
    }
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.set(session.id, session)
      return { sessions, nextZIndex: nextZIndex + 1 }
    })
    return session
  },

  removeSession: (id: string) => {
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.delete(id)
      return {
        sessions,
        focusedId: state.focusedId === id ? null : state.focusedId,
        highlightedId: state.highlightedId === id ? null : state.highlightedId,
      }
    })
  },

  updateSession: (id: string, patch: Partial<Session>) => {
    set((state) => {
      const existing = state.sessions.get(id)
      if (!existing) return state
      const sessions = new Map(state.sessions)
      sessions.set(id, { ...existing, ...patch })
      return { sessions }
    })
  },

  focusSession: (id: string) => {
    set({ focusedId: id })
  },

  highlightSession: (id: string | null) => {
    set({ highlightedId: id })
  },

  bringToFront: (id: string) => {
    set((state) => {
      const existing = state.sessions.get(id)
      if (!existing) return state
      const sessions = new Map(state.sessions)
      sessions.set(id, { ...existing, zIndex: state.nextZIndex })
      return { sessions, nextZIndex: state.nextZIndex + 1 }
    })
  },
}))

// Array selector for React list rendering
export const useSessionList = (): Session[] =>
  useStore(sessionStore, (state) => Array.from(state.sessions.values()))

export const useSession = (id: string): Session | undefined =>
  useStore(sessionStore, (state) => state.sessions.get(id))

export const useFocusedId = (): string | null =>
  useStore(sessionStore, (state) => state.focusedId)

export const useHighlightedId = (): string | null =>
  useStore(sessionStore, (state) => state.highlightedId)

export const useSessionStore = <T>(selector: (state: SessionStore) => T): T =>
  useStore(sessionStore, selector)
