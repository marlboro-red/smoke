import { useEffect, useRef } from 'react'
import { sessionStore } from '../stores/sessionStore'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Rubber-band drag-to-select on empty canvas space.
 *
 * Left-click + drag on empty canvas draws a selection rectangle.
 * Sessions whose bounding box overlaps the rectangle get selected.
 * Hold Shift to add to the existing selection.
 */
export function useRubberBandSelect(
  rootRef: React.RefObject<HTMLDivElement | null>,
  panRef: React.RefObject<{ x: number; y: number }>,
  zoomRef: React.RefObject<number>
): void {
  const isDraggingRef = useRef(false)
  const startCanvasRef = useRef({ x: 0, y: 0 })
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const shiftRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  // Track start screen position to detect intentional drag vs click
  const startScreenRef = useRef({ x: 0, y: 0 })
  const didDragRef = useRef(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    function screenToCanvas(clientX: number, clientY: number): { x: number; y: number } {
      const rect = root!.getBoundingClientRect()
      const pan = panRef.current ?? { x: 0, y: 0 }
      const zoom = zoomRef.current ?? 1
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      }
    }

    function canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } {
      const rect = root!.getBoundingClientRect()
      const pan = panRef.current ?? { x: 0, y: 0 }
      const zoom = zoomRef.current ?? 1
      return {
        x: canvasX * zoom + pan.x + rect.left,
        y: canvasY * zoom + pan.y + rect.top,
      }
    }

    function getBandRect(current: { x: number; y: number }): Rect {
      const start = startCanvasRef.current
      const x = Math.min(start.x, current.x)
      const y = Math.min(start.y, current.y)
      return {
        x,
        y,
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      }
    }

    function rectsOverlap(a: Rect, b: Rect): boolean {
      return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      )
    }

    function getSelectedInBand(band: Rect): Set<string> {
      const sessions = sessionStore.getState().sessions
      const ids = new Set<string>()
      for (const [id, session] of sessions) {
        const sessionRect: Rect = {
          x: session.position.x,
          y: session.position.y,
          width: session.size.width,
          height: session.size.height,
        }
        if (rectsOverlap(band, sessionRect)) {
          ids.add(id)
        }
      }
      return ids
    }

    function createOverlay(): HTMLDivElement {
      const el = document.createElement('div')
      el.className = 'rubber-band-overlay'
      root!.appendChild(el)
      return el
    }

    function updateOverlay(band: Rect): void {
      if (!overlayRef.current) return
      const topLeft = canvasToScreen(band.x, band.y)
      const bottomRight = canvasToScreen(band.x + band.width, band.y + band.height)
      const rootRect = root!.getBoundingClientRect()
      const el = overlayRef.current
      el.style.left = `${topLeft.x - rootRect.left}px`
      el.style.top = `${topLeft.y - rootRect.top}px`
      el.style.width = `${bottomRight.x - topLeft.x}px`
      el.style.height = `${bottomRight.y - topLeft.y}px`
    }

    function removeOverlay(): void {
      if (overlayRef.current) {
        overlayRef.current.remove()
        overlayRef.current = null
      }
    }

    const DRAG_THRESHOLD = 5

    const onPointerDown = (e: PointerEvent): void => {
      // Only left button
      if (e.button !== 0) return
      // Don't activate if already tracking a pointer interaction
      if (pointerIdRef.current !== null) return
      // Don't activate when clicking on a window element
      if ((e.target as HTMLElement).closest('.terminal-window')) return
      // Don't activate when space is held (pan mode)
      if (root!.classList.contains('panning')) return

      shiftRef.current = e.shiftKey
      startScreenRef.current = { x: e.clientX, y: e.clientY }
      startCanvasRef.current = screenToCanvas(e.clientX, e.clientY)
      didDragRef.current = false
      pointerIdRef.current = e.pointerId

      // We don't start the visual drag yet — wait until the pointer moves
      // past the threshold to distinguish from click
      document.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerup', onPointerUp)
    }

    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerId !== pointerIdRef.current) return

      const dx = e.clientX - startScreenRef.current.x
      const dy = e.clientY - startScreenRef.current.y

      if (!isDraggingRef.current) {
        // Check threshold
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        // Start dragging
        isDraggingRef.current = true
        didDragRef.current = true
        root!.setPointerCapture(e.pointerId)
        overlayRef.current = createOverlay()
        root!.classList.add('rubber-band-active')
      }

      const currentCanvas = screenToCanvas(e.clientX, e.clientY)
      const band = getBandRect(currentCanvas)
      updateOverlay(band)

      // Live-preview selection
      const bandSelected = getSelectedInBand(band)
      if (shiftRef.current) {
        // Additive: union with previous selection
        const prev = sessionStore.getState().selectedIds
        const merged = new Set(prev)
        for (const id of bandSelected) merged.add(id)
        sessionStore.getState().setSelectedIds(merged)
      } else {
        sessionStore.getState().setSelectedIds(bandSelected)
      }
    }

    const onPointerUp = (e: PointerEvent): void => {
      if (e.pointerId !== pointerIdRef.current) return

      if (isDraggingRef.current) {
        root!.releasePointerCapture(e.pointerId)
        root!.classList.remove('rubber-band-active')
        removeOverlay()
        isDraggingRef.current = false
      }

      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      pointerIdRef.current = null
    }

    root.addEventListener('pointerdown', onPointerDown)

    return () => {
      root.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      removeOverlay()
    }
  }, [rootRef, panRef, zoomRef])
}
