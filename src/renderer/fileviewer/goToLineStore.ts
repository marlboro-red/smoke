import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface GoToLineState {
  sessionId: string | null
  open: (sessionId: string) => void
  close: () => void
}

export const goToLineStore = createStore<GoToLineState>((set) => ({
  sessionId: null,
  open: (sessionId) => set({ sessionId }),
  close: () => set({ sessionId: null }),
}))

export const useGoToLineSessionId = (): string | null =>
  useStore(goToLineStore, (s) => s.sessionId)
