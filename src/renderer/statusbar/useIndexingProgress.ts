/**
 * Hook that wires IPC indexing events to the indexing store (smoke-phq.12).
 *
 * Subscribes to search:index-progress push events and periodically polls
 * search:stats to detect start/completion transitions. Mount once in App
 * so all components can read indexing state from the store.
 */

import { useEffect, useRef } from 'react'
import { indexingStore } from '../stores/indexingStore'

const POLL_INTERVAL_MS = 2000

export function useIndexingProgress(): void {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const store = indexingStore.getState

    // Listen to push events from main process
    const unsubProgress = window.smokeAPI?.search.onProgress((event) => {
      store().setSearchProgress(event.indexed, event.total)
    })

    // Poll stats to detect indexing start/completion (covers cases where
    // the build was triggered before this component mounted).
    const pollStats = async (): Promise<void> => {
      try {
        const stats = await window.smokeAPI?.search.getStats()
        if (!stats) return

        const current = store()
        if (stats.indexing && !current.searchIndexing) {
          current.setSearchIndexing(true)
        } else if (!stats.indexing && current.searchIndexing) {
          current.setSearchComplete()
        }
      } catch {
        // ignore — main process may not be ready yet
      }
    }

    pollStats()
    pollRef.current = setInterval(pollStats, POLL_INTERVAL_MS)

    return () => {
      unsubProgress?.()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])
}
