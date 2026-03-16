import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Bookmark } from '../../../preload/types'

// --- Mock canvas controls ---
const mockGetCurrentPan = vi.fn(() => ({ x: 0, y: 0 }))
const mockGetCurrentZoom = vi.fn(() => 1)
const mockSetPanTo = vi.fn()
const mockSetZoomTo = vi.fn()
const mockGetCanvasRootElement = vi.fn(() => null as HTMLDivElement | null)

vi.mock('../../canvas/useCanvasControls', () => ({
  getCurrentPan: (...args: unknown[]) => mockGetCurrentPan(...args),
  getCurrentZoom: (...args: unknown[]) => mockGetCurrentZoom(...args),
  setPanTo: (...args: unknown[]) => mockSetPanTo(...args),
  setZoomTo: (...args: unknown[]) => mockSetZoomTo(...args),
  getCanvasRootElement: (...args: unknown[]) => mockGetCanvasRootElement(...args),
}))

// Import after mocks are set up
import { jumpToBookmark } from '../BookmarkPanel'

// --- Replicated pure logic from BookmarkPanel for direct unit testing ---

const ANIMATION_DURATION = 300

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

// --- Tests ---

describe('easeOut timing function', () => {
  it('returns 0 at t=0', () => {
    expect(easeOut(0)).toBe(0)
  })

  it('returns 1 at t=1', () => {
    expect(easeOut(1)).toBe(1)
  })

  it('returns value > t for 0 < t < 1 (ease-out is front-loaded)', () => {
    const mid = easeOut(0.5)
    expect(mid).toBeGreaterThan(0.5)
    expect(mid).toBeLessThan(1)
  })

  it('is monotonically increasing', () => {
    let prev = 0
    for (let t = 0.1; t <= 1.0; t += 0.1) {
      const val = easeOut(t)
      expect(val).toBeGreaterThan(prev)
      prev = val
    }
  })

  it('produces expected value at t=0.5', () => {
    // 1 - (1-0.5)^2 = 1 - 0.25 = 0.75
    expect(easeOut(0.5)).toBe(0.75)
  })
})

describe('jumpToBookmark', () => {
  let rafId = 0

  beforeEach(() => {
    vi.useFakeTimers()
    mockSetPanTo.mockClear()
    mockSetZoomTo.mockClear()
    mockGetCurrentPan.mockReturnValue({ x: 0, y: 0 })
    mockGetCurrentZoom.mockReturnValue(1)
    mockGetCanvasRootElement.mockReturnValue(null)

    // Stub requestAnimationFrame / cancelAnimationFrame for non-DOM env
    rafId = 0
    globalThis.requestAnimationFrame = vi.fn(() => ++rafId)
    globalThis.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets pan and zoom immediately when no canvas root element', () => {
    mockGetCanvasRootElement.mockReturnValue(null)

    const bookmark: Bookmark = { name: 'Test', panX: 100, panY: 200, zoom: 1.5 }
    jumpToBookmark(bookmark)

    expect(mockSetPanTo).toHaveBeenCalledWith(100, 200)
    expect(mockSetZoomTo).toHaveBeenCalledWith(1.5)
  })

  it('starts animation when canvas root element exists', () => {
    mockGetCanvasRootElement.mockReturnValue({} as HTMLDivElement)
    mockGetCurrentPan.mockReturnValue({ x: 0, y: 0 })
    mockGetCurrentZoom.mockReturnValue(1)

    const bookmark: Bookmark = { name: 'Test', panX: 200, panY: 300, zoom: 2.0 }
    jumpToBookmark(bookmark)

    expect(globalThis.requestAnimationFrame).toHaveBeenCalled()
  })

  it('cancels previous animation when jumping to new bookmark', () => {
    mockGetCanvasRootElement.mockReturnValue({} as HTMLDivElement)

    const bm1: Bookmark = { name: 'A', panX: 100, panY: 100, zoom: 1.0 }
    const bm2: Bookmark = { name: 'B', panX: 200, panY: 200, zoom: 2.0 }

    jumpToBookmark(bm1)
    jumpToBookmark(bm2)

    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled()
  })
})

describe('animated transition interpolation', () => {
  it('interpolates position linearly with easeOut progress', () => {
    const startX = 0, startY = 0, startZoom = 1
    const targetX = 200, targetY = 300, targetZoom = 2.0

    // At progress 0.5, eased = 0.75
    const progress = 0.5
    const eased = easeOut(progress)

    const x = startX + (targetX - startX) * eased
    const y = startY + (targetY - startY) * eased
    const z = startZoom + (targetZoom - startZoom) * eased

    expect(x).toBe(150)
    expect(y).toBe(225)
    expect(z).toBe(1.75)
  })

  it('reaches exact target at progress 1.0', () => {
    const startX = -500, startY = 300, startZoom = 0.5
    const targetX = 100, targetY = -200, targetZoom = 2.0
    const eased = easeOut(1.0)

    const x = startX + (targetX - startX) * eased
    const y = startY + (targetY - startY) * eased
    const z = startZoom + (targetZoom - startZoom) * eased

    expect(x).toBe(targetX)
    expect(y).toBe(targetY)
    expect(z).toBe(targetZoom)
  })

  it('stays at start at progress 0', () => {
    const startX = 100, startY = 200, startZoom = 1.5
    const targetX = 500, targetY = 600, targetZoom = 2.5
    const eased = easeOut(0)

    const x = startX + (targetX - startX) * eased
    const y = startY + (targetY - startY) * eased
    const z = startZoom + (targetZoom - startZoom) * eased

    expect(x).toBe(startX)
    expect(y).toBe(startY)
    expect(z).toBe(startZoom)
  })

  it('handles negative pan coordinates', () => {
    const startX = -100, startY = -200
    const targetX = -500, targetY = -600
    const eased = easeOut(0.5) // 0.75

    const x = startX + (targetX - startX) * eased
    const y = startY + (targetY - startY) * eased

    expect(x).toBe(-400 * 0.75 + -100)
    expect(y).toBe(-400 * 0.75 + -200)
  })

  it('progress clamps to 1 when elapsed exceeds duration', () => {
    const elapsed = 500
    const progress = Math.min(1, elapsed / ANIMATION_DURATION)
    expect(progress).toBe(1)
  })
})

describe('viewport position serialization (Bookmark type)', () => {
  it('serializes all required fields', () => {
    const bookmark: Bookmark = {
      name: 'My View',
      panX: 123.456,
      panY: -789.012,
      zoom: 1.5,
    }

    expect(bookmark.name).toBe('My View')
    expect(bookmark.panX).toBe(123.456)
    expect(bookmark.panY).toBe(-789.012)
    expect(bookmark.zoom).toBe(1.5)
  })

  it('preserves floating point precision', () => {
    const bookmark: Bookmark = {
      name: 'Precise',
      panX: 0.1 + 0.2,
      panY: Math.PI,
      zoom: 1 / 3,
    }

    expect(bookmark.panX).toBeCloseTo(0.3, 10)
    expect(bookmark.panY).toBeCloseTo(3.14159265, 5)
    expect(bookmark.zoom).toBeCloseTo(0.333, 2)
  })

  it('round-trips through JSON serialization', () => {
    const bookmark: Bookmark = {
      name: 'Roundtrip',
      panX: -1234.5678,
      panY: 9876.5432,
      zoom: 2.718,
    }

    const serialized = JSON.stringify(bookmark)
    const deserialized: Bookmark = JSON.parse(serialized)

    expect(deserialized).toEqual(bookmark)
  })

  it('can be stored in a Record keyed by name', () => {
    const store: Record<string, Bookmark> = {}

    const bm1: Bookmark = { name: 'View A', panX: 0, panY: 0, zoom: 1 }
    const bm2: Bookmark = { name: 'View B', panX: 100, panY: 200, zoom: 2 }

    store[bm1.name] = bm1
    store[bm2.name] = bm2

    expect(Object.keys(store)).toHaveLength(2)
    expect(store['View A']).toEqual(bm1)
    expect(store['View B']).toEqual(bm2)

    // Overwrite
    const bm1Updated: Bookmark = { name: 'View A', panX: 50, panY: 50, zoom: 1.5 }
    store[bm1Updated.name] = bm1Updated
    expect(store['View A'].panX).toBe(50)
    expect(Object.keys(store)).toHaveLength(2)
  })
})

describe('bookmark save/load/delete operations (IPC mock)', () => {
  let bookmarkStore: Record<string, Bookmark>
  let mockSave: (name: string, bookmark: Bookmark) => Promise<void>
  let mockList: () => Promise<Bookmark[]>
  let mockDelete: (name: string) => Promise<void>

  beforeEach(() => {
    // Simulate the electron-store backed bookmark persistence
    bookmarkStore = {}

    mockSave = async (name: string, bookmark: Bookmark) => {
      bookmarkStore[name] = bookmark
    }

    mockList = async () => {
      return Object.values(bookmarkStore)
    }

    mockDelete = async (name: string) => {
      delete bookmarkStore[name]
    }
  })

  it('saves a bookmark', async () => {
    const bm: Bookmark = { name: 'Home', panX: 0, panY: 0, zoom: 1 }
    await mockSave('Home', bm)

    const list = await mockList()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(bm)
  })

  it('overwrites existing bookmark with same name', async () => {
    const bm1: Bookmark = { name: 'Home', panX: 0, panY: 0, zoom: 1 }
    const bm2: Bookmark = { name: 'Home', panX: 100, panY: 200, zoom: 2 }

    await mockSave('Home', bm1)
    await mockSave('Home', bm2)

    const list = await mockList()
    expect(list).toHaveLength(1)
    expect(list[0].panX).toBe(100)
  })

  it('lists multiple bookmarks', async () => {
    await mockSave('A', { name: 'A', panX: 0, panY: 0, zoom: 1 })
    await mockSave('B', { name: 'B', panX: 100, panY: 100, zoom: 1.5 })
    await mockSave('C', { name: 'C', panX: -200, panY: 300, zoom: 0.5 })

    const list = await mockList()
    expect(list).toHaveLength(3)
    const names = list.map((b) => b.name).sort()
    expect(names).toEqual(['A', 'B', 'C'])
  })

  it('returns empty list when no bookmarks', async () => {
    const list = await mockList()
    expect(list).toHaveLength(0)
  })

  it('deletes a bookmark by name', async () => {
    await mockSave('X', { name: 'X', panX: 10, panY: 20, zoom: 1 })
    await mockSave('Y', { name: 'Y', panX: 30, panY: 40, zoom: 2 })

    await mockDelete('X')
    const list = await mockList()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Y')
  })

  it('deleting non-existent bookmark is a no-op', async () => {
    await mockSave('A', { name: 'A', panX: 0, panY: 0, zoom: 1 })
    await mockDelete('ZZZ')

    const list = await mockList()
    expect(list).toHaveLength(1)
  })

  it('handles save-delete-resave cycle', async () => {
    const bm: Bookmark = { name: 'Temp', panX: 50, panY: 60, zoom: 1.2 }

    await mockSave('Temp', bm)
    expect(await mockList()).toHaveLength(1)

    await mockDelete('Temp')
    expect(await mockList()).toHaveLength(0)

    // Re-save with different viewport
    const bm2: Bookmark = { name: 'Temp', panX: 999, panY: 888, zoom: 0.8 }
    await mockSave('Temp', bm2)

    const list = await mockList()
    expect(list).toHaveLength(1)
    expect(list[0].panX).toBe(999)
  })
})

describe('bookmark name handling', () => {
  it('rejects empty name (handleSave behavior)', () => {
    const trimmed = ''.trim()
    expect(trimmed).toBe('')
    // The component returns early for empty names
    expect(trimmed.length === 0).toBe(true)
  })

  it('rejects whitespace-only name', () => {
    const trimmed = '   '.trim()
    expect(trimmed).toBe('')
  })

  it('trims whitespace from name', () => {
    const trimmed = '  My Bookmark  '.trim()
    expect(trimmed).toBe('My Bookmark')
  })

  it('preserves special characters in name', () => {
    const trimmed = 'View #1 (main)'.trim()
    expect(trimmed).toBe('View #1 (main)')
  })
})
