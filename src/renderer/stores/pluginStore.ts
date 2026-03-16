import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { PluginInfo } from '../../preload/types'

interface PluginStore {
  plugins: PluginInfo[]
  loading: boolean
  installing: boolean
  loadPlugins: () => Promise<void>
  installPlugin: (source: string) => Promise<{ success: boolean; pluginName?: string; error?: string }>
  uninstallPlugin: (name: string, force?: boolean) => Promise<{ success: boolean; error?: string }>
}

export const pluginStore = createStore<PluginStore>((set) => ({
  plugins: [],
  loading: false,
  installing: false,

  loadPlugins: async () => {
    set({ loading: true })
    try {
      const result = await window.smokeAPI?.plugin.list()
      set({ plugins: result?.plugins ?? [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  installPlugin: async (source: string) => {
    set({ installing: true })
    try {
      const result = await window.smokeAPI?.plugin.install(source)
      if (result?.success) {
        // Reload to pick up the newly installed plugin
        const listResult = await window.smokeAPI?.plugin.list()
        set({ plugins: listResult?.plugins ?? [], installing: false })
      } else {
        set({ installing: false })
      }
      return result ?? { success: false, error: 'API not available' }
    } catch (err) {
      set({ installing: false })
      return { success: false, error: String(err) }
    }
  },

  uninstallPlugin: async (name: string, force?: boolean) => {
    try {
      const result = await window.smokeAPI?.plugin.uninstall(name, force)
      if (result?.success) {
        // Reload to reflect the removal
        const listResult = await window.smokeAPI?.plugin.list()
        set({ plugins: listResult?.plugins ?? [] })
      }
      return result ?? { success: false, error: 'API not available' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}))

export const usePlugins = (): PluginInfo[] =>
  useStore(pluginStore, (state) => state.plugins)

export const usePluginStore = <T>(selector: (state: PluginStore) => T): T =>
  useStore(pluginStore, selector)
