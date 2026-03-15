import { useState, useEffect, useCallback, useRef } from 'react'
import { sessionStore, type Session } from '../stores/sessionStore'
import { canvasStore } from '../stores/canvasStore'

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

export function useViewportCulling(
  panRef: React.MutableRefObject<{ x: number; y: number }>,
  zoomRef: React.MutableRefObject<number>,
  rootRef: React.MutableRefObject<HTMLDivElement | null>
): { visibleIds: Set<string>; isThumbnailMode: boolean; isClusterMode: boolean; recalculate: () => void } {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const [isThumbnailMode, setIsThumbnailMode] = useState(false)
  const [isClusterMode, setIsClusterMode] = useState(false)
  const recalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recalculate = useCallback(() => {
    const root = rootRef.current
    if (!root) return

    const rect = root.getBoundingClientRect()
    const canvasRect: ViewportRect = { width: rect.width, height: rect.height }
    const pan = panRef.current
    const zoom = zoomRef.current

    const sessions = sessionStore.getState().sessions
    const newVisible = new Set<string>()

    for (const [id, session] of sessions) {
      if (session.isPinned || isVisible(session, pan, zoom, canvasRect)) {
        newVisible.add(id)
      }
    }

    setVisibleIds(newVisible)
    setIsThumbnailMode(zoom < THUMBNAIL_THRESHOLD)
    setIsClusterMode(zoom < CLUSTER_THRESHOLD)
  }, [panRef, zoomRef, rootRef])

  const debouncedRecalculate = useCallback(() => {
    if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current)
    recalcTimeoutRef.current = setTimeout(recalculate, 100)
  }, [recalculate])

  // Subscribe to session store changes (create/delete/move)
  useEffect(() => {
    const unsub = sessionStore.subscribe(() => {
      debouncedRecalculate()
    })
    return unsub
  }, [debouncedRecalculate])

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

  // Initial calculation
  useEffect(() => {
    recalculate()
  }, [recalculate])

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current)
    }
  }, [])

  return { visibleIds, isThumbnailMode, isClusterMode, recalculate: debouncedRecalculate }
}
