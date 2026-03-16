import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { Preferences } from '../../preload/types'
import { shortcutBindingsStore, validateBindings, type ShortcutConflictWarning } from '../shortcuts/shortcutMap'

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
  terminalOpacity: 1,
  fontFamily: '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  customShortcuts: {},
  startupCommand: '',
  skipAssemblyPreview: false,
  sidebarCollapsed: false,
}

interface PreferencesStore {
  preferences: Preferences
  launchCwd: string
  loaded: boolean
  shortcutWarnings: ShortcutConflictWarning[]

  setPreferences: (prefs: Preferences) => void
  setLaunchCwd: (cwd: string) => void
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  clearShortcutWarnings: () => void
}

export const preferencesStore = createStore<PreferencesStore>((set) => ({
  preferences: defaultPreferences,
  launchCwd: '',
  loaded: false,
  shortcutWarnings: [],

  setPreferences: (prefs: Preferences) => {
    set({ preferences: prefs, loaded: true })
    if (prefs.customShortcuts && Object.keys(prefs.customShortcuts).length > 0) {
      shortcutBindingsStore.getState().setCustomBindings(prefs.customShortcuts)
      // Validate bindings on startup to catch conflicts from manual config edits
      const warnings = validateBindings()
      for (const w of warnings) {
        console.warn(`[Shortcuts] ${w.detail}`)
      }
      if (warnings.length > 0) {
        // Store warnings so UI can display them
        set({ shortcutWarnings: warnings })
      }
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

  clearShortcutWarnings: () => set({ shortcutWarnings: [] }),
}))

export const usePreferences = (): Preferences =>
  useStore(preferencesStore, useShallow((state) => state.preferences))

export const usePreference = <K extends keyof Preferences>(key: K): Preferences[K] =>
  useStore(preferencesStore, (state) => state.preferences[key])

export const usePreferencesStore = <T>(selector: (state: PreferencesStore) => T): T =>
  useStore(preferencesStore, selector)
