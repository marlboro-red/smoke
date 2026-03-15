import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { v4 as uuidv4 } from 'uuid'
import { sessionStore } from './sessionStore'
import { canvasStore } from './canvasStore'
import { serializeCurrentLayout, restoreTabLayout } from '../layout/useLayoutPersistence'
import type { TabInfo } from '../../preload/types'

interface TabStore {
  tabs: TabInfo[]
  activeTabId: string
  loaded: boolean

  setTabs: (tabs: TabInfo[], activeTabId: string) => void
  createTab: (name?: string) => Promise<string>
  closeTab: (id: string) => Promise<void>
  switchTab: (id: string) => Promise<void>
  renameTab: (id: string, name: string) => void
  persistTabState: () => void
}

function layoutKeyForTab(tabId: string): string {
  return `__tab__${tabId}`
}

async function saveCurrentTabLayout(tabId: string): Promise<void> {
  const layout = serializeCurrentLayout(layoutKeyForTab(tabId))
  await window.smokeAPI?.layout.save(layoutKeyForTab(tabId), layout)
}

async function clearCurrentSessions(): Promise<void> {
  const { sessions } = sessionStore.getState()
  for (const session of sessions.values()) {
    if (session.type === 'terminal') {
      window.smokeAPI?.pty.kill(session.id)
    }
    sessionStore.getState().removeSession(session.id)
  }
}

export const tabStore = createStore<TabStore>((set, get) => ({
  tabs: [{ id: 'default', name: 'Canvas 1' }],
  activeTabId: 'default',
  loaded: false,

  setTabs: (tabs: TabInfo[], activeTabId: string) => {
    set({ tabs, activeTabId, loaded: true })
  },

  createTab: async (name?: string): Promise<string> => {
    const { tabs, activeTabId } = get()
    const tabName = name || `Canvas ${tabs.length + 1}`
    const newId = uuidv4()

    // Save current tab's layout before switching
    await saveCurrentTabLayout(activeTabId)

    // Clear current canvas
    await clearCurrentSessions()
    canvasStore.getState().setPan(0, 0)
    canvasStore.getState().setZoom(1.0)

    // Add new tab and switch to it
    const newTabs = [...tabs, { id: newId, name: tabName }]
    set({ tabs: newTabs, activeTabId: newId })
    get().persistTabState()

    return newId
  },

  closeTab: async (id: string): Promise<void> => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return // Can't close the last tab

    const newTabs = tabs.filter((t) => t.id !== id)

    if (activeTabId === id) {
      // Switch to adjacent tab
      const closedIndex = tabs.findIndex((t) => t.id === id)
      const newActiveIndex = Math.min(closedIndex, newTabs.length - 1)
      const newActiveId = newTabs[newActiveIndex].id

      // Clear current canvas and load new active tab
      await clearCurrentSessions()
      canvasStore.getState().setPan(0, 0)
      canvasStore.getState().setZoom(1.0)

      set({ tabs: newTabs, activeTabId: newActiveId })
      get().persistTabState()

      // Restore the new active tab's layout
      const layout = await window.smokeAPI?.layout.load(layoutKeyForTab(newActiveId))
      if (layout) {
        await restoreTabLayout(layout)
      }
    } else {
      set({ tabs: newTabs })
      get().persistTabState()
    }

    // Delete the closed tab's layout
    await window.smokeAPI?.layout.delete(layoutKeyForTab(id))
  },

  switchTab: async (id: string): Promise<void> => {
    const { activeTabId, tabs } = get()
    if (id === activeTabId) return
    if (!tabs.find((t) => t.id === id)) return

    // Save current tab's layout
    await saveCurrentTabLayout(activeTabId)

    // Clear current canvas
    await clearCurrentSessions()
    canvasStore.getState().setPan(0, 0)
    canvasStore.getState().setZoom(1.0)

    // Update active tab
    set({ activeTabId: id })
    get().persistTabState()

    // Restore the target tab's layout
    const layout = await window.smokeAPI?.layout.load(layoutKeyForTab(id))
    if (layout) {
      await restoreTabLayout(layout)
    }
  },

  renameTab: (id: string, name: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
    }))
    get().persistTabState()
  },

  persistTabState: () => {
    const { tabs, activeTabId } = get()
    window.smokeAPI?.tab.saveState({ tabs, activeTabId })
  },
}))

export const useTabList = (): TabInfo[] =>
  useStore(tabStore, useShallow((state) => state.tabs))

export const useActiveTabId = (): string =>
  useStore(tabStore, (state) => state.activeTabId)

export const useTabLoaded = (): boolean =>
  useStore(tabStore, (state) => state.loaded)

export const useTabStore = <T>(selector: (state: TabStore) => T): T =>
  useStore(tabStore, selector)
