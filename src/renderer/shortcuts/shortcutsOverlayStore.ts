import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface ShortcutsOverlayStore {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const shortcutsOverlayStore = createStore<ShortcutsOverlayStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}))

export const useShortcutsOverlayOpen = (): boolean =>
  useStore(shortcutsOverlayStore, (s) => s.isOpen)
