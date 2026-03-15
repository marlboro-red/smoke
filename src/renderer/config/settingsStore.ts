import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface SettingsModalStore {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const settingsModalStore = createStore<SettingsModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}))

export const useSettingsModalOpen = (): boolean =>
  useStore(settingsModalStore, (s) => s.isOpen)
