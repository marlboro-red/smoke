import { useRef, useCallback } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { snapPreviewStore } from '../stores/snapPreviewStore'
import { snapSize, CHROME_HEIGHT } from './useSnapping'
import { calculateTerminalSize } from '../terminal/useTerminal'
import type { ResizeDirection } from './ResizeHandle'

interface UseWindowResizeOptions {
  sessionId: string
  zoom: () => number
  gridSize: number
  charDims: () => { width: number; height: number }
}

interface UseWindowResizeResult {
  onResizeStart: (e: React.PointerEvent, direction: ResizeDirection) => void
}

export function useWindowResize({
  sessionId,
  zoom,
  gridSize,
  charDims,
}: UseWindowResizeOptions): UseWindowResizeResult {
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

      let newWidth = startSizeRef.current.width
      let newHeight = startSizeRef.current.height

      if (dir === 'e' || dir === 'se') {
        newWidth = startSizeRef.current.width + dx
      }
      if (dir === 's' || dir === 'se') {
        newHeight = startSizeRef.current.height + dy
      }

      // Enforce minimum (before snap, using raw pixels)
      const minWidth = 10 * gridSize
      const minHeight = 8 * gridSize
      newWidth = Math.max(minWidth, newWidth)
      newHeight = Math.max(minHeight, newHeight)

      sessionStore.getState().updateSession(sessionId, {
        size: {
          width: newWidth,
          height: newHeight,
          // Keep cols/rows during live resize — update on release
          cols: sessionStore.getState().sessions.get(sessionId)?.size.cols ?? 80,
          rows: sessionStore.getState().sessions.get(sessionId)?.size.rows ?? 24,
        },
      })

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
        target.releasePointerCapture(e.pointerId)
        target.classList.remove('resizing')
        target.classList.add('snapping')
        setTimeout(() => target.classList.remove('snapping'), 150)
      }

      // Hide snap preview
      snapPreviewStore.getState().hide()

      // Snap size to grid and recalculate terminal dimensions
      const session = sessionStore.getState().sessions.get(sessionId)
      if (session) {
        const snapped = snapSize(
          { width: session.size.width, height: session.size.height },
          gridSize
        )
        const dims = charDims()
        const termSize = calculateTerminalSize(
          snapped.width,
          snapped.height - CHROME_HEIGHT,
          dims.width,
          dims.height
        )
        sessionStore.getState().updateSession(sessionId, {
          size: { ...snapped, cols: termSize.cols, rows: termSize.rows },
        })

        // Resize PTY
        if (window.smokeAPI?.pty?.resize) {
          window.smokeAPI.pty.resize(sessionId, termSize.cols, termSize.rows)
        }
      }

      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    },
    [sessionId, gridSize, charDims, onPointerMove]
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

      const windowEl = (e.currentTarget as HTMLElement).closest('.terminal-window') as HTMLElement
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
