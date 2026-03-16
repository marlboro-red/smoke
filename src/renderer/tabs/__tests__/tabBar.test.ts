import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tabStore } from '../../stores/tabStore'
import { sessionStore } from '../../stores/sessionStore'
import { canvasStore } from '../../stores/canvasStore'

// Mock window.smokeAPI
const mockSmokeAPI = {
  pty: { kill: vi.fn() },
  layout: {
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  tab: { saveState: vi.fn() },
}

// Mock the layout persistence module
vi.mock('../../layout/useLayoutPersistence', () => ({
  serializeCurrentLayout: vi.fn(() => ({
    name: 'mock',
    sessions: [],
    viewport: { panX: 0, panY: 0, zoom: 1 },
    gridSize: 20,
  })),
  restoreTabLayout: vi.fn().mockResolvedValue(undefined),
}))

Object.defineProperty(globalThis, 'window', {
  value: { smokeAPI: mockSmokeAPI },
  writable: true,
})

function resetStores() {
  tabStore.setState({
    tabs: [{ id: 'default', name: 'Canvas 1' }],
    activeTabId: 'default',
    loaded: false,
  })
  sessionStore.setState({
    sessions: new Map(),
    focusedId: null,
    highlightedId: null,
    selectedIds: new Set(),
    nextZIndex: 1,
    broadcastGroupId: null,
  })
  canvasStore.setState({ panX: 0, panY: 0, zoom: 1.0, gridSize: 20 })
  vi.clearAllMocks()
}

describe('tabStore — tab list derivation', () => {
  beforeEach(resetStores)

  it('starts with a single default tab', () => {
    const { tabs, activeTabId } = tabStore.getState()
    expect(tabs).toEqual([{ id: 'default', name: 'Canvas 1' }])
    expect(activeTabId).toBe('default')
  })

  it('setTabs replaces the tab list and active tab', () => {
    const newTabs = [
      { id: 'a', name: 'Tab A' },
      { id: 'b', name: 'Tab B' },
    ]
    tabStore.getState().setTabs(newTabs, 'b')
    const { tabs, activeTabId, loaded } = tabStore.getState()
    expect(tabs).toEqual(newTabs)
    expect(activeTabId).toBe('b')
    expect(loaded).toBe(true)
  })

  it('createTab appends a new tab to the list', async () => {
    const newId = await tabStore.getState().createTab()
    const { tabs } = tabStore.getState()
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toEqual({ id: 'default', name: 'Canvas 1' })
    expect(tabs[1].id).toBe(newId)
    expect(tabs[1].name).toBe('Canvas 2')
  })

  it('createTab uses custom name when provided', async () => {
    const newId = await tabStore.getState().createTab('My Custom Tab')
    const { tabs } = tabStore.getState()
    expect(tabs[1]).toEqual({ id: newId, name: 'My Custom Tab' })
  })

  it('auto-names tabs based on current count', async () => {
    await tabStore.getState().createTab()
    await tabStore.getState().createTab()
    const { tabs } = tabStore.getState()
    expect(tabs).toHaveLength(3)
    // After first create (2 tabs), next is "Canvas 3"
    expect(tabs[2].name).toBe('Canvas 3')
  })
})

describe('tabStore — active tab tracking', () => {
  beforeEach(resetStores)

  it('createTab switches active tab to the new tab', async () => {
    const newId = await tabStore.getState().createTab()
    expect(tabStore.getState().activeTabId).toBe(newId)
  })

  it('switchTab changes the active tab', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().switchTab('b')
    expect(tabStore.getState().activeTabId).toBe('b')
  })

  it('switchTab is a no-op when switching to the already-active tab', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().switchTab('a')
    expect(tabStore.getState().activeTabId).toBe('a')
    // Should not call layout save since it returned early
    expect(mockSmokeAPI.layout.save).not.toHaveBeenCalled()
  })

  it('switchTab is a no-op for a non-existent tab id', async () => {
    tabStore.setState({
      tabs: [{ id: 'a', name: 'A' }],
      activeTabId: 'a',
    })
    await tabStore.getState().switchTab('nonexistent')
    expect(tabStore.getState().activeTabId).toBe('a')
    expect(mockSmokeAPI.layout.save).not.toHaveBeenCalled()
  })
})

describe('tabStore — tab switch focus behavior', () => {
  beforeEach(resetStores)

  it('switchTab saves the current layout before switching', async () => {
    const { serializeCurrentLayout } = await import('../../layout/useLayoutPersistence')
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().switchTab('b')
    expect(serializeCurrentLayout).toHaveBeenCalledWith('__tab__a')
    expect(mockSmokeAPI.layout.save).toHaveBeenCalled()
  })

  it('switchTab resets canvas pan and zoom', async () => {
    canvasStore.setState({ panX: 500, panY: 300, zoom: 2.0 })
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().switchTab('b')
    const { panX, panY, zoom } = canvasStore.getState()
    expect(panX).toBe(0)
    expect(panY).toBe(0)
    expect(zoom).toBe(1.0)
  })

  it('switchTab attempts to restore the target tab layout', async () => {
    const { restoreTabLayout } = await import('../../layout/useLayoutPersistence')
    const mockLayout = { name: 'test', sessions: [], viewport: { panX: 0, panY: 0, zoom: 1 }, gridSize: 20 }
    mockSmokeAPI.layout.load.mockResolvedValueOnce(mockLayout)

    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().switchTab('b')
    expect(mockSmokeAPI.layout.load).toHaveBeenCalledWith('__tab__b')
    expect(restoreTabLayout).toHaveBeenCalledWith(mockLayout)
  })

  it('switchTab persists tab state', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().switchTab('b')
    expect(mockSmokeAPI.tab.saveState).toHaveBeenCalled()
  })

  it('createTab clears existing sessions before creating new tab', async () => {
    // Add a session to the current canvas
    sessionStore.getState().createSession('/tmp')
    expect(sessionStore.getState().sessions.size).toBe(1)

    await tabStore.getState().createTab()
    // Sessions should be cleared for the new tab
    expect(sessionStore.getState().sessions.size).toBe(0)
  })
})

describe('tabStore — tab close', () => {
  beforeEach(resetStores)

  it('cannot close the last remaining tab', async () => {
    await tabStore.getState().closeTab('default')
    const { tabs } = tabStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0].id).toBe('default')
  })

  it('closes a non-active tab without switching', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().closeTab('b')
    const { tabs, activeTabId } = tabStore.getState()
    expect(tabs).toHaveLength(2)
    expect(tabs.map((t) => t.id)).toEqual(['a', 'c'])
    expect(activeTabId).toBe('a')
  })

  it('closes the active tab and switches to the next tab', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().closeTab('a')
    const { tabs, activeTabId } = tabStore.getState()
    expect(tabs).toHaveLength(2)
    expect(tabs.map((t) => t.id)).toEqual(['b', 'c'])
    expect(activeTabId).toBe('b')
  })

  it('closes the last active tab and switches to the previous one', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      activeTabId: 'c',
    })
    await tabStore.getState().closeTab('c')
    const { tabs, activeTabId } = tabStore.getState()
    expect(tabs).toHaveLength(2)
    expect(tabs.map((t) => t.id)).toEqual(['a', 'b'])
    expect(activeTabId).toBe('b')
  })

  it('closes the middle active tab and switches to the next one', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      activeTabId: 'b',
    })
    await tabStore.getState().closeTab('b')
    const { tabs, activeTabId } = tabStore.getState()
    expect(tabs).toHaveLength(2)
    // closedIndex=1, newTabs=['a','c'], min(1, 1)=1 -> 'c'
    expect(activeTabId).toBe('c')
  })

  it('deletes the closed tab layout from storage', async () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().closeTab('b')
    expect(mockSmokeAPI.layout.delete).toHaveBeenCalledWith('__tab__b')
  })

  it('closing the active tab restores the new active tab layout', async () => {
    const { restoreTabLayout } = await import('../../layout/useLayoutPersistence')
    const mockLayout = { name: 'restored', sessions: [], viewport: { panX: 0, panY: 0, zoom: 1 }, gridSize: 20 }
    mockSmokeAPI.layout.load.mockResolvedValueOnce(mockLayout)

    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    await tabStore.getState().closeTab('a')
    expect(mockSmokeAPI.layout.load).toHaveBeenCalledWith('__tab__b')
    expect(restoreTabLayout).toHaveBeenCalledWith(mockLayout)
  })
})

describe('tabStore — tab rename (reorder)', () => {
  beforeEach(resetStores)

  it('renames a tab by id', () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      activeTabId: 'a',
    })
    tabStore.getState().renameTab('b', 'Renamed B')
    const { tabs } = tabStore.getState()
    expect(tabs[1]).toEqual({ id: 'b', name: 'Renamed B' })
  })

  it('rename does not affect other tabs', () => {
    tabStore.setState({
      tabs: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      activeTabId: 'a',
    })
    tabStore.getState().renameTab('b', 'New Name')
    const { tabs } = tabStore.getState()
    expect(tabs[0].name).toBe('A')
    expect(tabs[1].name).toBe('New Name')
    expect(tabs[2].name).toBe('C')
  })

  it('rename persists tab state', () => {
    tabStore.getState().renameTab('default', 'Main Canvas')
    expect(mockSmokeAPI.tab.saveState).toHaveBeenCalled()
  })

  it('tabs maintain insertion order after multiple operations', async () => {
    const id1 = await tabStore.getState().createTab('Tab 2')
    const id2 = await tabStore.getState().createTab('Tab 3')
    const { tabs } = tabStore.getState()
    expect(tabs.map((t) => t.id)).toEqual(['default', id1, id2])
    expect(tabs.map((t) => t.name)).toEqual(['Canvas 1', 'Tab 2', 'Tab 3'])
  })
})

describe('tabStore — persistTabState', () => {
  beforeEach(resetStores)

  it('calls smokeAPI.tab.saveState with current tabs and activeTabId', () => {
    tabStore.setState({
      tabs: [
        { id: 'x', name: 'X' },
        { id: 'y', name: 'Y' },
      ],
      activeTabId: 'y',
    })
    tabStore.getState().persistTabState()
    expect(mockSmokeAPI.tab.saveState).toHaveBeenCalledWith({
      tabs: [
        { id: 'x', name: 'X' },
        { id: 'y', name: 'Y' },
      ],
      activeTabId: 'y',
    })
  })
})
