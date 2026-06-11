import { useState, useEffect, useCallback, useRef } from 'react'
import { sessionStore, type Session } from '../stores/sessionStore'
import { canvasStore } from '../stores/canvasStore'
import { SpatialIndex } from './SpatialIndex'

const CULLING_MARGIN = 200

export const THUMBNAIL_THRESHOLD = 0.4
export const CLUSTER_THRESHOLD = 0.2

interface ViewportRect {
  width: number
  height: number
}

export function isVisible(
  session: Session,
  pan: { x: number; y: number },
  zoom: number,
  canvasRect: ViewportRect,
  margin: number = CULLING_MARGIN
): boolean {
  const vpLeft = -pan.x / zoom
  const vpTop = -pan.y / zoom
  const vpRight = vpLeft + canvasRect.width / zoom
  const vpBottom = vpTop + canvasRect.height / zoom

  return (
    session.position.x + session.size.width >= vpLeft - margin &&
    session.position.x <= vpRight + margin &&
    session.position.y + session.size.height >= vpTop - margin &&
    session.position.y <= vpBottom + margin
  )
}

function buildSpatialIndex(sessions: Map<string, Session>): SpatialIndex {
  const entries: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }> = []
  for (const [id, session] of sessions) {
    if (!session.isPinned) {
      entries.push({
        id,
        bounds: {
          x: session.position.x,
          y: session.position.y,
          width: session.size.width,
          height: session.size.height,
        },
      })
    }
  }
  return SpatialIndex.fromEntries(entries)
}

export function useViewportCulling(
  panRef: React.MutableRefObject<{ x: number; y: number }>,
  zoomRef: React.MutableRefObject<number>,
  rootRef: React.MutableRefObject<HTMLDivElement | null>
): { visibleIds: Set<string>; isThumbnailMode: boolean; isClusterMode: boolean; recalculate: () => void } {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const [isThumbnailMode, setIsThumbnailMode] = useState(false)
  const [isClusterMode, setIsClusterMode] = useState(false)
  const recalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spatialIndexRef = useRef<SpatialIndex | null>(null)
  const pinnedIdsRef = useRef<string[]>([])
  const geometrySigRef = useRef('')

  // Rebuild spatial index when session GEOMETRY changes. The store notifies
  // on every mutation (focus, selection, title...), so compare a cheap
  // signature of the geometry-relevant fields and skip rebuilds when only
  // non-spatial state changed. Returns whether geometry actually changed.
  const rebuildIndex = useCallback((): boolean => {
    const sessions = sessionStore.getState().sessions

    let sig = ''
    for (const [id, s] of sessions) {
      sig += `${id}:${s.position.x},${s.position.y},${s.size.width},${s.size.height},${s.isPinned ? 1 : 0};`
    }
    if (sig === geometrySigRef.current) return false
    geometrySigRef.current = sig

    spatialIndexRef.current = buildSpatialIndex(sessions)
    // Cache pinned IDs separately (always visible, not in spatial index)
    const pinned: string[] = []
    for (const [id, session] of sessions) {
      if (session.isPinned) pinned.push(id)
    }
    pinnedIdsRef.current = pinned
    return true
  }, [])

  const recalculate = useCallback(() => {
    const root = rootRef.current
    if (!root) return

    const rect = root.getBoundingClientRect()
    const pan = panRef.current
    const zoom = zoomRef.current

    const newVisible = new Set<string>()

    // Add pinned sessions (always visible)
    for (const id of pinnedIdsRef.current) {
      newVisible.add(id)
    }

    // Query spatial index for viewport intersection
    const index = spatialIndexRef.current
    if (index) {
      const vpLeft = -pan.x / zoom - CULLING_MARGIN
      const vpTop = -pan.y / zoom - CULLING_MARGIN
      const vpWidth = rect.width / zoom + CULLING_MARGIN * 2
      const vpHeight = rect.height / zoom + CULLING_MARGIN * 2

      const hits = index.query({
        x: vpLeft,
        y: vpTop,
        width: vpWidth,
        height: vpHeight,
      })
      for (const id of hits) {
        newVisible.add(id)
      }
    }

    // Keep the previous Set when membership is unchanged — a fresh Set
    // reference re-renders every visibleIds consumer for nothing.
    setVisibleIds((prev) => {
      if (prev.size === newVisible.size) {
        let same = true
        for (const id of newVisible) {
          if (!prev.has(id)) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return newVisible
    })
    setIsThumbnailMode(zoom < THUMBNAIL_THRESHOLD)
    setIsClusterMode(zoom < CLUSTER_THRESHOLD)
  }, [panRef, zoomRef, rootRef])

  const debouncedRecalculate = useCallback(() => {
    if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current)
    recalcTimeoutRef.current = setTimeout(recalculate, 100)
  }, [recalculate])

  // Subscribe to session store changes (create/delete/move) — rebuild index + recalc
  useEffect(() => {
    const unsub = sessionStore.subscribe(() => {
      if (rebuildIndex()) {
        debouncedRecalculate()
      }
    })
    return unsub
  }, [rebuildIndex, debouncedRecalculate])

  // Subscribe to canvas store changes (pan-end, zoom-end trigger store sync)
  useEffect(() => {
    const unsub = canvasStore.subscribe(() => {
      recalculate()
    })
    return unsub
  }, [recalculate])

  // Recalculate on Electron/browser window resize
  useEffect(() => {
    const onResize = () => recalculate()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [recalculate])

  // Initial index build + calculation
  useEffect(() => {
    rebuildIndex()
    recalculate()
  }, [rebuildIndex, recalculate])

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current)
    }
  }, [])

  return { visibleIds, isThumbnailMode, isClusterMode, recalculate: debouncedRecalculate }
}
