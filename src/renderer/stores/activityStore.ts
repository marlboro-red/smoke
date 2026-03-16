import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

interface ActivityStore {
  /** Session IDs that have unread terminal output while off-screen */
  activeIds: Set<string>

  markActive: (sessionId: string) => void
  clearActive: (sessionId: string) => void
  clearAll: () => void
}

export const activityStore = createStore<ActivityStore>((set) => ({
  activeIds: new Set(),

  markActive: (sessionId: string) => {
    set((state) => {
      if (state.activeIds.has(sessionId)) return state
      const activeIds = new Set(state.activeIds)
      activeIds.add(sessionId)
      return { activeIds }
    })
  },

  clearActive: (sessionId: string) => {
    set((state) => {
      if (!state.activeIds.has(sessionId)) return state
      const activeIds = new Set(state.activeIds)
      activeIds.delete(sessionId)
      return { activeIds }
    })
  },

  clearAll: () => {
    set({ activeIds: new Set() })
  },
}))

export const useActiveIds = (): Set<string> =>
  useStore(activityStore, useShallow((state) => state.activeIds))

export const useHasActivity = (sessionId: string): boolean =>
  useStore(activityStore, (state) => state.activeIds.has(sessionId))
