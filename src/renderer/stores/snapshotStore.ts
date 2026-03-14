import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface SnapshotStore {
  snapshots: Map<string, string[]>
  setSnapshot: (sessionId: string, lines: string[]) => void
  removeSnapshot: (sessionId: string) => void
}

export const snapshotStore = createStore<SnapshotStore>((set) => ({
  snapshots: new Map(),

  setSnapshot: (sessionId: string, lines: string[]) => {
    set((state) => {
      const snapshots = new Map(state.snapshots)
      snapshots.set(sessionId, lines)
      return { snapshots }
    })
  },

  removeSnapshot: (sessionId: string) => {
    set((state) => {
      const snapshots = new Map(state.snapshots)
      snapshots.delete(sessionId)
      return { snapshots }
    })
  },
}))

const EMPTY_LINES: string[] = []

export const useSnapshot = (sessionId: string): string[] =>
  useStore(snapshotStore, (state) => state.snapshots.get(sessionId) ?? EMPTY_LINES)

export const useSnapshotStore = <T>(selector: (state: SnapshotStore) => T): T =>
  useStore(snapshotStore, selector)
