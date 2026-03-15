import { useRef, useCallback } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { snapPreviewStore } from '../stores/snapPreviewStore'
import { snapPosition } from './useSnapping'

interface UseWindowDragOptions {
  sessionId: string
  zoom: () => number
  gridSize: number
}

interface UseWindowDragResult {
  isDragging: boolean
  onDragStart: (e: React.PointerEvent) => void
}

export function useWindowDrag({
  sessionId,
  zoom,
  gridSize,
}: UseWindowDragOptions): UseWindowDragResult {
  const isDraggingRef = useRef(false)
  const startMouseRef = useRef({ x: 0, y: 0 })
  const startPosRef = useRef({ x: 0, y: 0 })
  const windowElRef = useRef<HTMLElement | null>(null)

  const livePosRef = useRef({ x: 0, y: 0 })
  // Multi-select drag: track other selected elements' start positions and DOM refs
  const peerStartsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const peerElsRef = useRef<Map<string, HTMLElement>>(new Map())

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current) return
      const z = zoom()
      const dx = (e.clientX - startMouseRef.current.x) / z
      const dy = (e.clientY - startMouseRef.current.y) / z
      const newX = startPosRef.current.x + dx
      const newY = startPosRef.current.y + dy
      livePosRef.current = { x: newX, y: newY }

      // Update DOM directly to avoid Zustand re-renders during drag
      const el = windowElRef.current
      if (el) {
        el.style.left = `${newX}px`
        el.style.top = `${newY}px`
      }

      // Move peer selected elements
      for (const [id, start] of peerStartsRef.current) {
        const peerEl = peerElsRef.current.get(id)
        if (peerEl) {
          peerEl.style.left = `${start.x + dx}px`
          peerEl.style.top = `${start.y + dy}px`
        }
      }

      // Show snap preview at the target grid position
      const session = sessionStore.getState().sessions.get(sessionId)
      if (session) {
        const snapped = snapPosition({ x: newX, y: newY }, gridSize)
        snapPreviewStore.getState().show({
          x: snapped.x,
          y: snapped.y,
          width: session.size.width,
          height: session.size.height,
        })
      }
    },
    [zoom, sessionId, gridSize]
  )

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false

      const z = zoom()
      const dx = (e.clientX - startMouseRef.current.x) / z
      const dy = (e.clientY - startMouseRef.current.y) / z

      const target = windowElRef.current
      if (target) {
        target.releasePointerCapture(e.pointerId)
        target.classList.remove('dragging')
        // Add snap transition
        target.classList.add('snapping')
        setTimeout(() => target.classList.remove('snapping'), 150)
      }

      // Hide snap preview
      snapPreviewStore.getState().hide()

      // Sync final position to store and snap to grid
      const snapped = snapPosition(livePosRef.current, gridSize)
      sessionStore.getState().updateSession(sessionId, { position: snapped })

      // Sync peer selected elements
      for (const [id, start] of peerStartsRef.current) {
        const peerSnapped = snapPosition({ x: start.x + dx, y: start.y + dy }, gridSize)
        sessionStore.getState().updateSession(id, { position: peerSnapped })
        const peerEl = peerElsRef.current.get(id)
        if (peerEl) {
          peerEl.classList.add('snapping')
          setTimeout(() => peerEl.classList.remove('snapping'), 150)
        }
      }
      peerStartsRef.current.clear()
      peerElsRef.current.clear()

      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    },
    [sessionId, gridSize, zoom, onPointerMove]
  )

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()

      const session = sessionStore.getState().sessions.get(sessionId)
      if (!session) return
      if (session.locked) return

      isDraggingRef.current = true
      startMouseRef.current = { x: e.clientX, y: e.clientY }
      startPosRef.current = { ...session.position }

      // Capture on the terminal-window element (parent of chrome)
      const windowEl = (e.currentTarget as HTMLElement).closest('.terminal-window') as HTMLElement
      windowElRef.current = windowEl
      if (windowEl) {
        windowEl.setPointerCapture(e.pointerId)
        windowEl.classList.add('dragging')
      }

      sessionStore.getState().bringToFront(sessionId)

      // If this element is part of a multi-selection, drag peers too
      const { selectedIds, sessions } = sessionStore.getState()
      if (selectedIds.has(sessionId) && selectedIds.size > 1) {
        peerStartsRef.current.clear()
        peerElsRef.current.clear()
        const viewport = windowEl?.closest('.canvas-viewport')
        for (const peerId of selectedIds) {
          if (peerId === sessionId) continue
          const peer = sessions.get(peerId)
          if (peer) {
            peerStartsRef.current.set(peerId, { ...peer.position })
            // Find peer DOM element within the viewport
            if (viewport) {
              const peerEl = viewport.querySelector(`[data-session-id="${peerId}"]`) as HTMLElement | null
              if (peerEl) peerElsRef.current.set(peerId, peerEl)
            }
          }
        }
      }

      document.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerup', onPointerUp)
    },
    [sessionId, onPointerMove, onPointerUp]
  )

  return { isDragging: isDraggingRef.current, onDragStart }
}
