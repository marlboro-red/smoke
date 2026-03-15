import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

interface CommandPaletteStore {
  isOpen: boolean
  query: string
  selectedIndex: number

  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => void
  setSelectedIndex: (index: number) => void
}

export const commandPaletteStore = createStore<CommandPaletteStore>((set) => ({
  isOpen: false,
  query: '',
  selectedIndex: 0,

  open: () => set({ isOpen: true, query: '', selectedIndex: 0 }),
  close: () => set({ isOpen: false, query: '', selectedIndex: 0 }),
  toggle: () =>
    set((s) => (s.isOpen ? { isOpen: false, query: '', selectedIndex: 0 } : { isOpen: true, query: '', selectedIndex: 0 })),
  setQuery: (query) => set({ query, selectedIndex: 0 }),
  setSelectedIndex: (index) => set({ selectedIndex: index }),
}))

export const useCommandPaletteOpen = (): boolean =>
  useStore(commandPaletteStore, (s) => s.isOpen)

export const useCommandPaletteQuery = (): string =>
  useStore(commandPaletteStore, (s) => s.query)

export const useCommandPaletteSelectedIndex = (): number =>
  useStore(commandPaletteStore, (s) => s.selectedIndex)
