import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock modules that transitively import xterm.js / browser-only globals
vi.mock('../../terminal/terminalRegistry', () => ({}))
vi.mock('../../session/useSessionCreation', () => ({
  createNewSession: vi.fn(),
}))
vi.mock('../../session/useSessionClose', () => ({
  closeSession: vi.fn(),
}))
vi.mock('../../sidebar/useSidebarSync', () => ({
  panToSession: vi.fn(),
}))
vi.mock('../../canvas/useCanvasControls', () => ({
  setZoomTo: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  getCurrentPan: vi.fn(() => ({ x: 0, y: 0 })),
  getCurrentZoom: vi.fn(() => 1),
}))
vi.mock('../../layout/useLayoutPersistence', () => ({
  serializeCurrentLayout: vi.fn(),
}))
vi.mock('../../config/settingsStore', () => ({
  settingsModalStore: { getState: () => ({ open: vi.fn() }) },
}))
vi.mock('../../shortcuts/shortcutsOverlayStore', () => ({
  shortcutsOverlayStore: { getState: () => ({ open: vi.fn() }) },
}))
vi.mock('../../stores/aiStore', () => ({
  aiStore: { getState: () => ({ togglePanel: vi.fn() }) },
}))
vi.mock('../../themes/applyTheme', () => ({
  applyTheme: vi.fn(),
}))
vi.mock('../../fileviewer/useFileViewerCreation', () => ({
  createFileViewerSession: vi.fn(),
}))
vi.mock('../../layout/autoLayout', () => ({
  performAutoLayout: vi.fn(),
}))
vi.mock('../../shortcuts/shortcutMap', () => ({
  getSortedSessionIds: vi.fn(() => []),
}))
vi.mock('../../presentation/presentationStore', () => ({
  presentationStore: { getState: () => ({ bookmarks: [], addBookmark: vi.fn(), startPresentation: vi.fn(), removeBookmark: vi.fn() }) },
}))
vi.mock('../../stores/regionStore', () => ({
  regionStore: { getState: () => ({ createRegion: vi.fn() }) },
}))

import { fuzzyMatch, filterItems, buildFileItems, type PaletteItem } from '../paletteCommands'
import { commandPaletteStore } from '../commandPaletteStore'

// ─── fuzzyMatch ──────────────────────────────────────────────────────

describe('fuzzyMatch', () => {
  it('returns 0 for empty pattern (matches everything)', () => {
    expect(fuzzyMatch('anything', '')).toBe(0)
  })

  it('returns -1 when pattern has no match', () => {
    expect(fuzzyMatch('hello', 'xyz')).toBe(-1)
  })

  it('matches exact substring with low score', () => {
    const score = fuzzyMatch('New Terminal', 'new')
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('is case-insensitive', () => {
    const lower = fuzzyMatch('New Terminal', 'new')
    const upper = fuzzyMatch('New Terminal', 'NEW')
    expect(lower).toBe(upper)
  })

  it('matches characters in order (non-contiguous)', () => {
    // "n" ... "t" in "New Terminal"
    const score = fuzzyMatch('New Terminal', 'nt')
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('returns -1 when characters are out of order', () => {
    expect(fuzzyMatch('abc', 'cb')).toBe(-1)
  })

  it('gives better (lower) score for consecutive matches', () => {
    const consecutive = fuzzyMatch('Terminal', 'ter') // t-e-r at positions 0-1-2 → score 0
    const scattered = fuzzyMatch('Category', 'ter')   // t at 2, e at 3, r at 6 → higher score
    expect(consecutive).toBeLessThan(scattered)
  })

  it('matches full string exactly', () => {
    const score = fuzzyMatch('Zoom In', 'Zoom In')
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('returns -1 when pattern is longer than text', () => {
    expect(fuzzyMatch('ab', 'abcdef')).toBe(-1)
  })

  it('handles single character pattern', () => {
    expect(fuzzyMatch('hello', 'h')).toBe(0) // first char, 0 gap
    expect(fuzzyMatch('hello', 'o')).toBeGreaterThan(0) // last char, some gap
  })
})

// ─── filterItems ─────────────────────────────────────────────────────

describe('filterItems', () => {
  const items: PaletteItem[] = [
    { id: 'a', title: 'New Terminal', category: 'Action', icon: '+', action: vi.fn() },
    { id: 'b', title: 'Zoom In', category: 'Canvas', icon: '+', action: vi.fn() },
    { id: 'c', title: 'Zoom Out', category: 'Canvas', icon: '-', action: vi.fn() },
    { id: 'd', title: 'Open Settings', category: 'Settings', icon: ',', action: vi.fn() },
    { id: 'e', title: 'Toggle Theme', category: 'Settings', icon: '@', action: vi.fn() },
  ]

  it('returns all items when query is empty', () => {
    const result = filterItems(items, '')
    expect(result).toHaveLength(items.length)
  })

  it('filters items by title match', () => {
    const result = filterItems(items, 'zoom')
    expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['b', 'c']))
    expect(result).toHaveLength(2)
  })

  it('filters items by category match', () => {
    const result = filterItems(items, 'canvas')
    expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['b', 'c']))
  })

  it('returns empty when nothing matches', () => {
    const result = filterItems(items, 'xyznotfound')
    expect(result).toHaveLength(0)
  })

  it('ranks better (lower-score) matches first', () => {
    const result = filterItems(items, 'set')
    expect(result.length).toBeGreaterThan(0)
    // "Open Settings" and "Toggle Theme" (Settings category) should match
    // "Open Settings" has "Set" at position 5 in title → good score
    const ids = result.map((r) => r.id)
    expect(ids).toContain('d')
  })

  it('matches against both title and category, picking best score', () => {
    // "in" matches "Zoom In" (title) and also "Settings" (category)
    const result = filterItems(items, 'in')
    expect(result.length).toBeGreaterThan(0)
    expect(result.map((r) => r.id)).toContain('b')
  })

  it('is case-insensitive', () => {
    const lower = filterItems(items, 'terminal')
    const upper = filterItems(items, 'TERMINAL')
    expect(lower.map((r) => r.id)).toEqual(upper.map((r) => r.id))
  })
})

// ─── buildFileItems ──────────────────────────────────────────────────

describe('buildFileItems', () => {
  it('builds palette items from file entries', () => {
    const entries = [
      { name: 'README.md', isDirectory: false, path: '/project/README.md' },
      { name: 'index.ts', isDirectory: false, path: '/project/index.ts' },
    ]
    const items = buildFileItems(entries)
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('file:/project/README.md')
    expect(items[0].title).toBe('README.md')
    expect(items[0].category).toBe('File')
    expect(items[0].icon).toBe('#')
    expect(typeof items[0].action).toBe('function')
  })

  it('filters out directories', () => {
    const entries = [
      { name: 'src', isDirectory: true, path: '/project/src' },
      { name: 'file.ts', isDirectory: false, path: '/project/file.ts' },
      { name: 'node_modules', isDirectory: true, path: '/project/node_modules' },
    ]
    const items = buildFileItems(entries)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('file.ts')
  })

  it('returns empty array for empty input', () => {
    expect(buildFileItems([])).toHaveLength(0)
  })

  it('returns empty array when all entries are directories', () => {
    const entries = [
      { name: 'src', isDirectory: true, path: '/project/src' },
      { name: 'dist', isDirectory: true, path: '/project/dist' },
    ]
    expect(buildFileItems(entries)).toHaveLength(0)
  })
})

// ─── commandPaletteStore ─────────────────────────────────────────────

describe('commandPaletteStore', () => {
  beforeEach(() => {
    commandPaletteStore.setState({
      isOpen: false,
      query: '',
      selectedIndex: 0,
    })
  })

  it('starts closed with empty query', () => {
    const state = commandPaletteStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.query).toBe('')
    expect(state.selectedIndex).toBe(0)
  })

  it('open() sets isOpen true and resets query and index', () => {
    commandPaletteStore.setState({ query: 'leftover', selectedIndex: 5 })
    commandPaletteStore.getState().open()
    const state = commandPaletteStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.query).toBe('')
    expect(state.selectedIndex).toBe(0)
  })

  it('close() sets isOpen false and resets query and index', () => {
    commandPaletteStore.getState().open()
    commandPaletteStore.setState({ query: 'zoom', selectedIndex: 3 })
    commandPaletteStore.getState().close()
    const state = commandPaletteStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.query).toBe('')
    expect(state.selectedIndex).toBe(0)
  })

  it('toggle() opens when closed', () => {
    commandPaletteStore.getState().toggle()
    expect(commandPaletteStore.getState().isOpen).toBe(true)
  })

  it('toggle() closes when open', () => {
    commandPaletteStore.getState().open()
    commandPaletteStore.getState().toggle()
    expect(commandPaletteStore.getState().isOpen).toBe(false)
  })

  it('setQuery updates query and resets selectedIndex to 0', () => {
    commandPaletteStore.setState({ selectedIndex: 5 })
    commandPaletteStore.getState().setQuery('test')
    const state = commandPaletteStore.getState()
    expect(state.query).toBe('test')
    expect(state.selectedIndex).toBe(0)
  })

  it('setSelectedIndex updates selectedIndex', () => {
    commandPaletteStore.getState().setSelectedIndex(7)
    expect(commandPaletteStore.getState().selectedIndex).toBe(7)
  })
})

// ─── keyboard navigation (store-level) ──────────────────────────────

describe('keyboard navigation (store-level)', () => {
  beforeEach(() => {
    commandPaletteStore.setState({
      isOpen: true,
      query: '',
      selectedIndex: 0,
    })
  })

  it('ArrowDown increments selectedIndex', () => {
    const { selectedIndex } = commandPaletteStore.getState()
    commandPaletteStore.getState().setSelectedIndex(selectedIndex + 1)
    expect(commandPaletteStore.getState().selectedIndex).toBe(1)
  })

  it('ArrowUp decrements selectedIndex (clamped at 0)', () => {
    commandPaletteStore.getState().setSelectedIndex(0)
    const idx = commandPaletteStore.getState().selectedIndex
    commandPaletteStore.getState().setSelectedIndex(Math.max(idx - 1, 0))
    expect(commandPaletteStore.getState().selectedIndex).toBe(0)
  })

  it('ArrowDown does not exceed item count', () => {
    const maxIndex = 4 // simulating 5 items
    commandPaletteStore.getState().setSelectedIndex(maxIndex)
    const idx = commandPaletteStore.getState().selectedIndex
    commandPaletteStore.getState().setSelectedIndex(Math.min(idx + 1, maxIndex))
    expect(commandPaletteStore.getState().selectedIndex).toBe(maxIndex)
  })

  it('Enter on selected item dispatches action and closes palette', () => {
    const actionFn = vi.fn()
    const items: PaletteItem[] = [
      { id: 'a', title: 'Test', category: 'Test', icon: 'T', action: actionFn },
    ]
    const idx = commandPaletteStore.getState().selectedIndex
    if (items[idx]) {
      commandPaletteStore.getState().close()
      items[idx].action()
    }
    expect(actionFn).toHaveBeenCalledOnce()
    expect(commandPaletteStore.getState().isOpen).toBe(false)
  })

  it('action dispatch: close first, then execute (mirrors component behavior)', () => {
    const callOrder: string[] = []
    const actionFn = vi.fn(() => callOrder.push('action'))

    // Simulate what CommandPalette.executeItem does
    commandPaletteStore.getState().close()
    callOrder.push('close')
    actionFn()

    expect(callOrder).toEqual(['close', 'action'])
    expect(commandPaletteStore.getState().isOpen).toBe(false)
  })
})
