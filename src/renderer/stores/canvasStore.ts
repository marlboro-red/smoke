import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface CanvasStore {
  panX: number
  panY: number
  zoom: number
  gridSize: number

  setPan: (x: number, y: number) => void
  setZoom: (zoom: number) => void
  setGridSize: (size: number) => void
}

export const canvasStore = createStore<CanvasStore>((set) => ({
  panX: 0,
  panY: 0,
  zoom: 1.0,
  gridSize: 20,

  setPan: (x: number, y: number) => {
    set({ panX: x, panY: y })
  },

  setZoom: (zoom: number) => {
    set({ zoom: Math.max(0.1, Math.min(3.0, zoom)) })
  },

  setGridSize: (size: number) => {
    set({ gridSize: size })
  },
}))

export const useCanvasStore = <T>(selector: (state: CanvasStore) => T): T =>
  useStore(canvasStore, selector)
