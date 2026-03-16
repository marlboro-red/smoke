import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { PluginInfo } from '../../preload/types'

interface PluginStore {
  plugins: PluginInfo[]
  loading: boolean
  loadPlugins: () => Promise<void>
}

export const pluginStore = createStore<PluginStore>((set) => ({
  plugins: [],
  loading: false,

  loadPlugins: async () => {
    set({ loading: true })
    try {
      const result = await window.smokeAPI?.plugin.list()
      set({ plugins: result?.plugins ?? [], loading: false })
    } catch {
      set({ loading: false })
    }
  },
}))

export const usePlugins = (): PluginInfo[] =>
  useStore(pluginStore, (state) => state.plugins)

export const usePluginStore = <T>(selector: (state: PluginStore) => T): T =>
  useStore(pluginStore, selector)
