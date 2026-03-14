import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface GridStore {
  gridSize: number
  snapEnabled: boolean
  showGrid: boolean

  setGridSize: (size: number) => void
  toggleSnap: () => void
  toggleGrid: () => void
  snapToGrid: (value: number) => number
}

export const gridStore = createStore<GridStore>((set, get) => ({
  gridSize: 20,
  snapEnabled: true,
  showGrid: true,

  setGridSize: (size: number) => {
    set({ gridSize: size })
  },

  toggleSnap: () => {
    set((state) => ({ snapEnabled: !state.snapEnabled }))
  },

  toggleGrid: () => {
    set((state) => ({ showGrid: !state.showGrid }))
  },

  snapToGrid: (value: number): number => {
    const { gridSize } = get()
    return Math.round(value / gridSize) * gridSize
  },
}))

export const useGridStore = <T>(selector: (state: GridStore) => T): T =>
  useStore(gridStore, selector)
