import { describe, it, expect, beforeEach } from 'vitest'
import { presentationStore } from '../presentationStore'

function addTestBookmarks(count: number) {
  const store = presentationStore.getState()
  for (let i = 0; i < count; i++) {
    store.addBookmark({ name: `Slide ${i + 1}`, panX: i * 100, panY: 0, zoom: 1 })
  }
}

describe('presentationStore', () => {
  beforeEach(() => {
    presentationStore.setState({
      bookmarks: [],
      isPresenting: false,
      currentIndex: 0,
    })
  })

  describe('bookmark management', () => {
    it('adds a bookmark with generated id', () => {
      const { addBookmark } = presentationStore.getState()
      addBookmark({ name: 'First', panX: 10, panY: 20, zoom: 1.5 })

      const { bookmarks } = presentationStore.getState()
      expect(bookmarks).toHaveLength(1)
      expect(bookmarks[0].name).toBe('First')
      expect(bookmarks[0].panX).toBe(10)
      expect(bookmarks[0].panY).toBe(20)
      expect(bookmarks[0].zoom).toBe(1.5)
      expect(bookmarks[0].id).toMatch(/^bm-\d+$/)
    })

    it('assigns unique ids to each bookmark', () => {
      addTestBookmarks(3)

      const { bookmarks } = presentationStore.getState()
      const ids = bookmarks.map((b) => b.id)
      expect(new Set(ids).size).toBe(3)
    })

    it('removes a bookmark by id', () => {
      addTestBookmarks(3)
      const { bookmarks } = presentationStore.getState()
      const idToRemove = bookmarks[1].id

      presentationStore.getState().removeBookmark(idToRemove)

      const updated = presentationStore.getState().bookmarks
      expect(updated).toHaveLength(2)
      expect(updated.find((b) => b.id === idToRemove)).toBeUndefined()
    })

    it('renames a bookmark', () => {
      addTestBookmarks(1)
      const { bookmarks } = presentationStore.getState()
      const id = bookmarks[0].id

      presentationStore.getState().renameBookmark(id, 'Renamed')

      expect(presentationStore.getState().bookmarks[0].name).toBe('Renamed')
    })

    it('reorders bookmarks', () => {
      addTestBookmarks(3)
      const originalNames = presentationStore.getState().bookmarks.map((b) => b.name)

      presentationStore.getState().reorderBookmark(0, 2)

      const reordered = presentationStore.getState().bookmarks.map((b) => b.name)
      expect(reordered).toEqual([originalNames[1], originalNames[2], originalNames[0]])
    })
  })

  describe('slide list generation from bookmarks', () => {
    it('starts with an empty bookmark list', () => {
      expect(presentationStore.getState().bookmarks).toEqual([])
    })

    it('builds slide list in order of bookmark addition', () => {
      const { addBookmark } = presentationStore.getState()
      addBookmark({ name: 'A', panX: 0, panY: 0, zoom: 1 })
      addBookmark({ name: 'B', panX: 100, panY: 0, zoom: 1 })
      addBookmark({ name: 'C', panX: 200, panY: 0, zoom: 1 })

      const names = presentationStore.getState().bookmarks.map((b) => b.name)
      expect(names).toEqual(['A', 'B', 'C'])
    })

    it('reflects removals in the slide list', () => {
      addTestBookmarks(3)
      const idToRemove = presentationStore.getState().bookmarks[1].id
      presentationStore.getState().removeBookmark(idToRemove)

      const names = presentationStore.getState().bookmarks.map((b) => b.name)
      expect(names).toEqual(['Slide 1', 'Slide 3'])
    })
  })

  describe('enter/exit state transitions', () => {
    it('starts not presenting', () => {
      expect(presentationStore.getState().isPresenting).toBe(false)
    })

    it('enters presentation mode and resets to slide 0', () => {
      addTestBookmarks(3)
      presentationStore.setState({ currentIndex: 2 })

      presentationStore.getState().startPresentation()

      const state = presentationStore.getState()
      expect(state.isPresenting).toBe(true)
      expect(state.currentIndex).toBe(0)
    })

    it('does not enter presentation mode with no bookmarks', () => {
      presentationStore.getState().startPresentation()

      expect(presentationStore.getState().isPresenting).toBe(false)
    })

    it('exits presentation mode', () => {
      addTestBookmarks(2)
      presentationStore.getState().startPresentation()
      presentationStore.getState().stopPresentation()

      expect(presentationStore.getState().isPresenting).toBe(false)
    })

    it('preserves currentIndex on exit', () => {
      addTestBookmarks(3)
      presentationStore.getState().startPresentation()
      presentationStore.getState().nextSlide()
      presentationStore.getState().nextSlide()

      presentationStore.getState().stopPresentation()

      expect(presentationStore.getState().currentIndex).toBe(2)
    })
  })

  describe('slide index tracking', () => {
    it('starts at index 0', () => {
      expect(presentationStore.getState().currentIndex).toBe(0)
    })

    it('goToSlide sets index within bounds', () => {
      addTestBookmarks(5)

      presentationStore.getState().goToSlide(3)
      expect(presentationStore.getState().currentIndex).toBe(3)
    })

    it('goToSlide ignores negative index', () => {
      addTestBookmarks(3)
      presentationStore.getState().goToSlide(1)

      presentationStore.getState().goToSlide(-1)
      expect(presentationStore.getState().currentIndex).toBe(1)
    })

    it('goToSlide ignores index beyond last slide', () => {
      addTestBookmarks(3)

      presentationStore.getState().goToSlide(3)
      expect(presentationStore.getState().currentIndex).toBe(0)

      presentationStore.getState().goToSlide(100)
      expect(presentationStore.getState().currentIndex).toBe(0)
    })
  })

  describe('next/previous navigation with bounds checking', () => {
    it('nextSlide advances index by 1', () => {
      addTestBookmarks(3)

      presentationStore.getState().nextSlide()
      expect(presentationStore.getState().currentIndex).toBe(1)

      presentationStore.getState().nextSlide()
      expect(presentationStore.getState().currentIndex).toBe(2)
    })

    it('nextSlide does not go past the last slide', () => {
      addTestBookmarks(3)
      presentationStore.getState().goToSlide(2)

      presentationStore.getState().nextSlide()
      expect(presentationStore.getState().currentIndex).toBe(2)
    })

    it('prevSlide decrements index by 1', () => {
      addTestBookmarks(3)
      presentationStore.getState().goToSlide(2)

      presentationStore.getState().prevSlide()
      expect(presentationStore.getState().currentIndex).toBe(1)

      presentationStore.getState().prevSlide()
      expect(presentationStore.getState().currentIndex).toBe(0)
    })

    it('prevSlide does not go below 0', () => {
      addTestBookmarks(3)

      presentationStore.getState().prevSlide()
      expect(presentationStore.getState().currentIndex).toBe(0)
    })

    it('navigates through all slides sequentially', () => {
      addTestBookmarks(4)
      const indices: number[] = []

      indices.push(presentationStore.getState().currentIndex)
      for (let i = 0; i < 3; i++) {
        presentationStore.getState().nextSlide()
        indices.push(presentationStore.getState().currentIndex)
      }

      expect(indices).toEqual([0, 1, 2, 3])

      for (let i = 0; i < 3; i++) {
        presentationStore.getState().prevSlide()
      }
      expect(presentationStore.getState().currentIndex).toBe(0)
    })
  })
})
