import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { assemblyPreviewStore } from './assemblyPreviewStore'
import { preferencesStore } from '../stores/preferencesStore'

export type AssemblyPhase = 'indexing' | 'searching' | 'scoring' | 'assembling'

export interface TaskHistoryEntry {
  description: string
  timestamp: number
}

const MAX_HISTORY = 20

interface TaskInputStore {
  isOpen: boolean
  query: string
  loading: boolean
  phase: AssemblyPhase | null
  history: TaskHistoryEntry[]

  open: () => void
  close: () => void
  setQuery: (q: string) => void

  submit: (description: string) => Promise<void>

  removeHistoryEntry: (timestamp: number) => void
  clearHistory: () => void
}

// History persists via the main process config store, NOT localStorage:
// the first synchronous localStorage access in a packaged Electron app
// blocks the renderer for ~4-5 seconds (electron/electron#24441), and this
// module loads at startup.
function saveHistory(history: TaskHistoryEntry[]): void {
  window.smokeAPI?.taskHistory?.set(history.slice(0, MAX_HISTORY)).catch(() => {
    // best-effort persistence
  })
}

function addToHistory(history: TaskHistoryEntry[], description: string): TaskHistoryEntry[] {
  // Remove duplicate if exists
  const filtered = history.filter(
    (e) => e.description.toLowerCase() !== description.toLowerCase(),
  )
  const next = [{ description, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY)
  saveHistory(next)
  return next
}

export const taskInputStore = createStore<TaskInputStore>((set, get) => ({
  isOpen: false,
  query: '',
  loading: false,
  phase: null,
  history: [],

  open: () => set({ isOpen: true, query: '', loading: false, phase: null }),

  close: () => set({ isOpen: false, query: '', loading: false, phase: null }),

  setQuery: (q: string) => set({ query: q }),

  submit: async (description: string) => {
    const trimmed = description.trim()
    if (!trimmed) return

    set({ loading: true, phase: 'indexing' })

    const history = addToHistory(get().history, trimmed)
    set({ history })

    const projectRoot =
      preferencesStore.getState().preferences.defaultCwd ||
      preferencesStore.getState().launchCwd ||
      ''

    try {
      // Progress through phases with simulated timing for stages we can't observe
      set({ phase: 'searching' })

      const result = await window.smokeAPI?.context.collect(trimmed, projectRoot, 15)
      if (!result) {
        set({ loading: false, phase: null })
        return
      }

      set({ phase: 'scoring' })
      // Small delay so user sees the scoring phase
      await new Promise((r) => setTimeout(r, 200))

      set({ phase: 'assembling' })

      const skipPreview = preferencesStore.getState().preferences.skipAssemblyPreview

      if (skipPreview) {
        // Dispatch directly — skip preview
        window.dispatchEvent(
          new CustomEvent('assembly:confirm', {
            detail: { files: result.files, projectRoot },
          }),
        )
        set({ isOpen: false, query: '', loading: false, phase: null })
      } else {
        // Open assembly preview for confirmation
        assemblyPreviewStore.getState().showPreview(result, projectRoot, trimmed)
        set({ isOpen: false, query: '', loading: false, phase: null })
      }
    } catch {
      set({ loading: false, phase: null })
    }
  },

  removeHistoryEntry: (timestamp: number) => {
    const history = get().history.filter((e) => e.timestamp !== timestamp)
    saveHistory(history)
    set({ history })
  },

  clearHistory: () => {
    saveHistory([])
    set({ history: [] })
  },
}))

// Selector hooks
export const useTaskInputOpen = (): boolean =>
  useStore(taskInputStore, (s) => s.isOpen)

export const useTaskInputQuery = (): string =>
  useStore(taskInputStore, (s) => s.query)

export const useTaskInputLoading = (): boolean =>
  useStore(taskInputStore, (s) => s.loading)

export const useTaskInputPhase = (): AssemblyPhase | null =>
  useStore(taskInputStore, (s) => s.phase)

export const useTaskHistory = (): TaskHistoryEntry[] =>
  useStore(taskInputStore, useShallow((s) => s.history))

// Hydrate history asynchronously — off the startup critical path
// (typeof guard: this module also loads in node-environment tests)
if (typeof window !== 'undefined') {
  window.smokeAPI?.taskHistory
    ?.get()
    .then((history) => {
      if (Array.isArray(history) && history.length > 0) {
        taskInputStore.setState({ history: history.slice(0, MAX_HISTORY) })
      }
    })
    .catch(() => {
      // best-effort hydration
    })
}
