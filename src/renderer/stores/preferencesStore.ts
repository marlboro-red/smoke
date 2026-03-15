import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Preferences } from '../../preload/types'
import { shortcutBindingsStore } from '../shortcuts/shortcutMap'

const defaultPreferences: Preferences = {
  defaultShell: '',
  autoLaunchClaude: false,
  claudeCommand: 'claude',
  gridSize: 20,
  sidebarPosition: 'left',
  sidebarWidth: 240,
  sidebarSectionSizes: {},
  theme: 'dark',
  defaultCwd: '',
  aiApiKey: '',
  aiModel: 'claude-sonnet-4-20250514',
  terminalOpacity: 1,
  fontFamily: '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  customShortcuts: {},
  startupCommand: '',
}

interface PreferencesStore {
  preferences: Preferences
  launchCwd: string
  loaded: boolean

  setPreferences: (prefs: Preferences) => void
  setLaunchCwd: (cwd: string) => void
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
}

export const preferencesStore = createStore<PreferencesStore>((set) => ({
  preferences: defaultPreferences,
  launchCwd: '',
  loaded: false,

  setPreferences: (prefs: Preferences) => {
    set({ preferences: prefs, loaded: true })
    if (prefs.customShortcuts && Object.keys(prefs.customShortcuts).length > 0) {
      shortcutBindingsStore.getState().setCustomBindings(prefs.customShortcuts)
    }
  },

  setLaunchCwd: (cwd: string) => {
    set({ launchCwd: cwd })
  },

  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    set((state) => ({
      preferences: { ...state.preferences, [key]: value },
    }))
  },
}))

export const usePreferences = (): Preferences =>
  useStore(preferencesStore, (state) => state.preferences)

export const usePreference = <K extends keyof Preferences>(key: K): Preferences[K] =>
  useStore(preferencesStore, (state) => state.preferences[key])

export const usePreferencesStore = <T>(selector: (state: PreferencesStore) => T): T =>
  useStore(preferencesStore, selector)
