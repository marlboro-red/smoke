import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { v4 as uuidv4 } from 'uuid'

export type ElementType = 'terminal' | 'file'

export interface BaseSession {
  id: string
  type: ElementType
  title: string
  position: { x: number; y: number }
  size: { cols: number; rows: number; width: number; height: number }
  zIndex: number
  createdAt: number
}

export interface TerminalSession extends BaseSession {
  type: 'terminal'
  cwd: string
  status: 'running' | 'exited'
  exitCode?: number
}

export interface FileViewerSession extends BaseSession {
  type: 'file'
  filePath: string
  content: string
  language: string
}

export type Session = TerminalSession | FileViewerSession

interface SessionStore {
  sessions: Map<string, Session>
  focusedId: string | null
  highlightedId: string | null
  nextZIndex: number

  createSession: (cwd: string, position?: { x: number; y: number }) => Session
  createFileSession: (filePath: string, content: string, language: string, position?: { x: number; y: number }) => FileViewerSession
  removeSession: (id: string) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  focusSession: (id: string | null) => void
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
      type: 'terminal',
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

  createFileSession: (filePath: string, content: string, language: string, position?: { x: number; y: number }): FileViewerSession => {
    const { nextZIndex } = get()
    const fileName = filePath.split('/').pop() || filePath
    const session: FileViewerSession = {
      id: uuidv4(),
      type: 'file',
      title: fileName,
      filePath,
      content,
      language,
      position: position ?? { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
      zIndex: nextZIndex,
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

  focusSession: (id: string | null) => {
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

// Array selector for React list rendering — useShallow prevents infinite loop
// from new array references on every getSnapshot call
export const useSessionList = (): Session[] =>
  useStore(sessionStore, useShallow((state) => Array.from(state.sessions.values())))

export const useSession = (id: string): Session | undefined =>
  useStore(sessionStore, (state) => state.sessions.get(id))

export const useFocusedId = (): string | null =>
  useStore(sessionStore, (state) => state.focusedId)

export const useHighlightedId = (): string | null =>
  useStore(sessionStore, (state) => state.highlightedId)

export const useSessionStore = <T>(selector: (state: SessionStore) => T): T =>
  useStore(sessionStore, selector)

export function findFileSessionByPath(filePath: string): FileViewerSession | undefined {
  for (const session of sessionStore.getState().sessions.values()) {
    if (session.type === 'file' && session.filePath === filePath) {
      return session
    }
  }
  return undefined
}
