import { useRef, useCallback } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { snapPreviewStore } from '../stores/snapPreviewStore'
import { snapSize } from '../window/useSnapping'
import type { ResizeDirection } from '../window/ResizeHandle'

interface UseWebviewResizeOptions {
  sessionId: string
  zoom: () => number
  gridSize: number
}

interface UseWebviewResizeResult {
  onResizeStart: (e: React.PointerEvent, direction: ResizeDirection) => void
}

/**
 * Resize hook optimized for webview sessions. Instead of updating dimensions
 * on every pointer move (which forces the webview to reflow its content),
 * this applies a CSS transform to visually stretch the window during drag
 * and only sets the real dimensions on pointer up.
 */
export function useWebviewResize({
  sessionId,
  zoom,
  gridSize,
}: UseWebviewResizeOptions): UseWebviewResizeResult {
  const startMouseRef = useRef({ x: 0, y: 0 })
  const startSizeRef = useRef({ width: 0, height: 0 })
  const directionRef = useRef<ResizeDirection>('se')
  const windowElRef = useRef<HTMLElement | null>(null)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const z = zoom()
      const dx = (e.clientX - startMouseRef.current.x) / z
      const dy = (e.clientY - startMouseRef.current.y) / z
      const dir = directionRef.current

      const minWidth = 10 * gridSize
      const minHeight = 8 * gridSize

      let newWidth = startSizeRef.current.width
      let newHeight = startSizeRef.current.height

      if (dir === 'e' || dir === 'se') {
        newWidth = Math.max(minWidth, startSizeRef.current.width + dx)
      }
      if (dir === 's' || dir === 'se') {
        newHeight = Math.max(minHeight, startSizeRef.current.height + dy)
      }

      // Apply CSS transform to visually stretch — no store update, no webview reflow
      const el = windowElRef.current
      if (el) {
        const scaleX = newWidth / startSizeRef.current.width
        const scaleY = newHeight / startSizeRef.current.height
        el.style.transform = `scale(${scaleX}, ${scaleY})`
      }

      // Show snap preview at the target grid size
      const session = sessionStore.getState().sessions.get(sessionId)
      if (session) {
        const snapped = snapSize({ width: newWidth, height: newHeight }, gridSize)
        snapPreviewStore.getState().show({
          x: session.position.x,
          y: session.position.y,
          width: snapped.width,
          height: snapped.height,
        })
      }
    },
    [sessionId, zoom, gridSize]
  )

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const target = windowElRef.current
      if (target) {
        // Remove the visual stretch transform
        target.style.transform = ''
        target.releasePointerCapture(e.pointerId)
        target.classList.remove('resizing')
        target.classList.add('snapping')
        setTimeout(() => target.classList.remove('snapping'), 150)
      }

      snapPreviewStore.getState().hide()

      // Calculate final size from pointer delta and apply once
      const z = zoom()
      const dx = (e.clientX - startMouseRef.current.x) / z
      const dy = (e.clientY - startMouseRef.current.y) / z
      const dir = directionRef.current

      let newWidth = startSizeRef.current.width
      let newHeight = startSizeRef.current.height

      if (dir === 'e' || dir === 'se') {
        newWidth = startSizeRef.current.width + dx
      }
      if (dir === 's' || dir === 'se') {
        newHeight = startSizeRef.current.height + dy
      }

      const minWidth = 10 * gridSize
      const minHeight = 8 * gridSize
      newWidth = Math.max(minWidth, newWidth)
      newHeight = Math.max(minHeight, newHeight)

      // Snap to grid and apply final dimensions
      const snapped = snapSize({ width: newWidth, height: newHeight }, gridSize)
      const session = sessionStore.getState().sessions.get(sessionId)
      if (session) {
        sessionStore.getState().updateSession(sessionId, {
          size: { ...session.size, ...snapped },
        })
      }

      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    },
    [sessionId, zoom, gridSize, onPointerMove]
  )

  const onResizeStart = useCallback(
    (e: React.PointerEvent, direction: ResizeDirection) => {
      e.stopPropagation()

      const session = sessionStore.getState().sessions.get(sessionId)
      if (!session) return
      if (session.locked) return

      directionRef.current = direction
      startMouseRef.current = { x: e.clientX, y: e.clientY }
      startSizeRef.current = {
        width: session.size.width,
        height: session.size.height,
      }

      const windowEl = (e.currentTarget as HTMLElement).closest(
        '.terminal-window'
      ) as HTMLElement
      windowElRef.current = windowEl
      if (windowEl) {
        windowEl.setPointerCapture(e.pointerId)
        windowEl.classList.add('resizing')
      }

      document.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerup', onPointerUp)
    },
    [sessionId, onPointerMove, onPointerUp]
  )

  return { onResizeStart }
}
