import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface SnapPreviewState {
  visible: boolean
  x: number
  y: number
  width: number
  height: number
}

interface SnapPreviewStore extends SnapPreviewState {
  show: (rect: { x: number; y: number; width: number; height: number }) => void
  hide: () => void
}

export const snapPreviewStore = createStore<SnapPreviewStore>((set) => ({
  visible: false,
  x: 0,
  y: 0,
  width: 0,
  height: 0,

  show: (rect) => set({ visible: true, ...rect }),
  hide: () => set({ visible: false }),
}))

export const useSnapPreview = <T>(selector: (state: SnapPreviewStore) => T): T =>
  useStore(snapPreviewStore, selector)
