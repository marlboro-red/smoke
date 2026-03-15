/**
 * Indexing progress store (smoke-phq.12).
 *
 * Tracks search index and structure analyzer progress so the status bar
 * (and context assembly) can display progress and gracefully degrade
 * when indexing is still in progress.
 */

import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

export interface IndexingState {
  // Search index progress
  searchIndexing: boolean
  searchIndexed: number
  searchTotal: number
  searchStartedAt: number | null
  searchCompletedAt: number | null

  // Structure analyzer state
  structureAnalyzing: boolean
  structureModuleCount: number | null

  // Actions
  setSearchProgress: (indexed: number, total: number) => void
  setSearchIndexing: (indexing: boolean) => void
  setSearchComplete: () => void
  setStructureAnalyzing: (analyzing: boolean) => void
  setStructureComplete: (moduleCount: number) => void
}

export const indexingStore = createStore<IndexingState>((set, get) => ({
  searchIndexing: false,
  searchIndexed: 0,
  searchTotal: 0,
  searchStartedAt: null,
  searchCompletedAt: null,

  structureAnalyzing: false,
  structureModuleCount: null,

  setSearchProgress: (indexed, total) => {
    const state = get()
    set({
      searchIndexed: indexed,
      searchTotal: total,
      searchIndexing: true,
      searchStartedAt: state.searchStartedAt ?? Date.now(),
    })
  },

  setSearchIndexing: (indexing) => {
    if (indexing) {
      set({
        searchIndexing: true,
        searchIndexed: 0,
        searchTotal: 0,
        searchStartedAt: Date.now(),
        searchCompletedAt: null,
      })
    }
  },

  setSearchComplete: () => {
    const state = get()
    set({
      searchIndexing: false,
      searchIndexed: state.searchTotal,
      searchCompletedAt: Date.now(),
    })
  },

  setStructureAnalyzing: (analyzing) => {
    set({ structureAnalyzing: analyzing })
  },

  setStructureComplete: (moduleCount) => {
    set({
      structureAnalyzing: false,
      structureModuleCount: moduleCount,
    })
  },
}))

// -- Selector hooks --

export function useSearchIndexing(): boolean {
  return useStore(indexingStore, (s) => s.searchIndexing)
}

export function useSearchProgress(): { indexed: number; total: number; startedAt: number | null } {
  return useStore(indexingStore, useShallow((s) => ({
    indexed: s.searchIndexed,
    total: s.searchTotal,
    startedAt: s.searchStartedAt,
  })))
}

export function useStructureAnalyzing(): boolean {
  return useStore(indexingStore, (s) => s.structureAnalyzing)
}

/** True if any indexing operation (search or structure) is in progress. */
export function useIsIndexing(): boolean {
  return useStore(indexingStore, (s) => s.searchIndexing || s.structureAnalyzing)
}

/** Estimated ms remaining, or null if not enough data. */
export function computeSearchEta(state: IndexingState): number | null {
  if (!state.searchIndexing || !state.searchStartedAt || state.searchIndexed <= 0 || state.searchTotal <= 0) {
    return null
  }
  const elapsed = Date.now() - state.searchStartedAt
  const rate = state.searchIndexed / elapsed // files per ms
  const remaining = state.searchTotal - state.searchIndexed
  if (rate <= 0) return null
  return remaining / rate
}

/** Format ms to human-readable ETA string. */
export function formatEta(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `~${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSec = seconds % 60
  if (remainSec === 0) return `~${minutes}m`
  return `~${minutes}m ${remainSec}s`
}
