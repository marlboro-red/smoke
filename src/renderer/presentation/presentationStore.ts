import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export interface Bookmark {
  id: string
  name: string
  panX: number
  panY: number
  zoom: number
}

interface PresentationStore {
  bookmarks: Bookmark[]
  isPresenting: boolean
  currentIndex: number

  addBookmark: (bookmark: Omit<Bookmark, 'id'>) => void
  removeBookmark: (id: string) => void
  renameBookmark: (id: string, name: string) => void
  reorderBookmark: (fromIndex: number, toIndex: number) => void

  startPresentation: () => void
  stopPresentation: () => void
  goToSlide: (index: number) => void
  nextSlide: () => void
  prevSlide: () => void
}

let _nextId = 1

export const presentationStore = createStore<PresentationStore>((set, get) => ({
  bookmarks: [],
  isPresenting: false,
  currentIndex: 0,

  addBookmark: (bookmark) =>
    set((s) => ({
      bookmarks: [...s.bookmarks, { ...bookmark, id: `bm-${_nextId++}` }],
    })),

  removeBookmark: (id) =>
    set((s) => ({
      bookmarks: s.bookmarks.filter((b) => b.id !== id),
    })),

  renameBookmark: (id, name) =>
    set((s) => ({
      bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, name } : b)),
    })),

  reorderBookmark: (fromIndex, toIndex) =>
    set((s) => {
      const next = [...s.bookmarks]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return { bookmarks: next }
    }),

  startPresentation: () => {
    const { bookmarks } = get()
    if (bookmarks.length === 0) return
    set({ isPresenting: true, currentIndex: 0 })
  },

  stopPresentation: () => set({ isPresenting: false }),

  goToSlide: (index) => {
    const { bookmarks } = get()
    if (index >= 0 && index < bookmarks.length) {
      set({ currentIndex: index })
    }
  },

  nextSlide: () => {
    const { currentIndex, bookmarks } = get()
    if (currentIndex < bookmarks.length - 1) {
      set({ currentIndex: currentIndex + 1 })
    }
  },

  prevSlide: () => {
    const { currentIndex } = get()
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 })
    }
  },
}))

export const useIsPresenting = (): boolean =>
  useStore(presentationStore, (s) => s.isPresenting)

export const useBookmarks = (): Bookmark[] =>
  useStore(presentationStore, (s) => s.bookmarks)

export const useCurrentSlideIndex = (): number =>
  useStore(presentationStore, (s) => s.currentIndex)
