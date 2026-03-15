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

      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    },
    [sessionId, gridSize, onPointerMove]
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

      document.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerup', onPointerUp)
    },
    [sessionId, onPointerMove, onPointerUp]
  )

  return { isDragging: isDraggingRef.current, onDragStart }
}
