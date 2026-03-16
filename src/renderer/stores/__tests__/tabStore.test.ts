import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tabStore } from '../tabStore'

// Mock external dependencies
vi.mock('../sessionStore', () => {
  const sessions = new Map()
  return {
    sessionStore: {
      getState: () => ({
        sessions,
        removeSession: vi.fn((id: string) => sessions.delete(id)),
      }),
    },
  }
})

vi.mock('../canvasStore', () => ({
  canvasStore: {
    getState: () => ({
      setPan: vi.fn(),
      setZoom: vi.fn(),
    }),
  },
}))

vi.mock('../../layout/useLayoutPersistence', () => ({
  serializeCurrentLayout: vi.fn(() => ({})),
  restoreTabLayout: vi.fn(),
}))

// Mock window.smokeAPI
Object.defineProperty(globalThis, 'window', {
  value: {
    smokeAPI: {
      layout: {
        save: vi.fn(),
        load: vi.fn(),
        delete: vi.fn(),
      },
      tab: {
        saveState: vi.fn(),
      },
      pty: {
        kill: vi.fn(),
      },
    },
  },
  writable: true,
})

describe('tabStore', () => {
  beforeEach(() => {
    // Reset to default state
    tabStore.setState({
      tabs: [{ id: 'default', name: 'Canvas 1' }],
      activeTabId: 'default',
      loaded: false,
    })
  })

  it('starts with one default tab', () => {
    const state = tabStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].id).toBe('default')
    expect(state.tabs[0].name).toBe('Canvas 1')
    expect(state.activeTabId).toBe('default')
  })

  describe('setTabs', () => {
    it('replaces tabs and sets active tab', () => {
      const tabs = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]
      tabStore.getState().setTabs(tabs, 'b')

      const state = tabStore.getState()
      expect(state.tabs).toEqual(tabs)
      expect(state.activeTabId).toBe('b')
      expect(state.loaded).toBe(true)
    })
  })

  describe('renameTab', () => {
    it('renames a tab by id', () => {
      tabStore.getState().renameTab('default', 'My Workspace')
      expect(tabStore.getState().tabs[0].name).toBe('My Workspace')
    })

    it('does not affect other tabs', () => {
      tabStore.setState({
        tabs: [
          { id: 'a', name: 'Tab A' },
          { id: 'b', name: 'Tab B' },
        ],
        activeTabId: 'a',
      })
      tabStore.getState().renameTab('b', 'Renamed B')

      const tabs = tabStore.getState().tabs
      expect(tabs[0].name).toBe('Tab A')
      expect(tabs[1].name).toBe('Renamed B')
    })
  })

  describe('createTab', () => {
    it('adds a new tab and switches to it', async () => {
      const newId = await tabStore.getState().createTab('New Tab')

      const state = tabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.tabs[1].name).toBe('New Tab')
      expect(state.activeTabId).toBe(newId)
    })

    it('uses default name when not provided', async () => {
      await tabStore.getState().createTab()
      const state = tabStore.getState()
      expect(state.tabs[1].name).toBe('Canvas 2')
    })
  })

  describe('closeTab', () => {
    it('does not close the last remaining tab', async () => {
      await tabStore.getState().closeTab('default')
      expect(tabStore.getState().tabs).toHaveLength(1)
    })

    it('removes a non-active tab without switching', async () => {
      tabStore.setState({
        tabs: [
          { id: 'a', name: 'Tab A' },
          { id: 'b', name: 'Tab B' },
          { id: 'c', name: 'Tab C' },
        ],
        activeTabId: 'a',
      })

      await tabStore.getState().closeTab('b')

      const state = tabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe('a')
      expect(state.tabs.find((t) => t.id === 'b')).toBeUndefined()
    })

    it('switches to adjacent tab when closing active tab', async () => {
      tabStore.setState({
        tabs: [
          { id: 'a', name: 'Tab A' },
          { id: 'b', name: 'Tab B' },
          { id: 'c', name: 'Tab C' },
        ],
        activeTabId: 'b',
      })

      await tabStore.getState().closeTab('b')

      const state = tabStore.getState()
      expect(state.tabs).toHaveLength(2)
      // After closing index 1, new active should be at min(1, 1) = index 1 → 'c'
      expect(state.activeTabId).toBe('c')
    })

    it('switches to previous tab when closing the last tab in list', async () => {
      tabStore.setState({
        tabs: [
          { id: 'a', name: 'Tab A' },
          { id: 'b', name: 'Tab B' },
        ],
        activeTabId: 'b',
      })

      await tabStore.getState().closeTab('b')

      const state = tabStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe('a')
    })
  })

  describe('switchTab', () => {
    it('does nothing when switching to the already active tab', async () => {
      const saveFn = vi.mocked(window.smokeAPI.layout.save)
      saveFn.mockClear()
      await tabStore.getState().switchTab('default')
      expect(saveFn).not.toHaveBeenCalled()
    })

    it('does nothing when switching to a non-existent tab', async () => {
      const saveFn = vi.mocked(window.smokeAPI.layout.save)
      saveFn.mockClear()
      await tabStore.getState().switchTab('nonexistent')
      expect(saveFn).not.toHaveBeenCalled()
    })

    it('switches the active tab', async () => {
      tabStore.setState({
        tabs: [
          { id: 'a', name: 'Tab A' },
          { id: 'b', name: 'Tab B' },
        ],
        activeTabId: 'a',
      })

      await tabStore.getState().switchTab('b')
      expect(tabStore.getState().activeTabId).toBe('b')
    })
  })
})
