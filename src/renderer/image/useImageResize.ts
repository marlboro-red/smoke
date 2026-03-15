import { useRef, useCallback } from 'react'
import { sessionStore } from '../stores/sessionStore'
import type { ImageSession } from '../stores/sessionStore'
import { snapPreviewStore } from '../stores/snapPreviewStore'
import { snapSize } from '../window/useSnapping'
import type { ResizeDirection } from '../window/ResizeHandle'

interface UseImageResizeOptions {
  sessionId: string
  zoom: () => number
  gridSize: number
}

interface UseImageResizeResult {
  onResizeStart: (e: React.PointerEvent, direction: ResizeDirection) => void
}

export function useImageResize({
  sessionId,
  zoom,
  gridSize,
}: UseImageResizeOptions): UseImageResizeResult {
  const startMouseRef = useRef({ x: 0, y: 0 })
  const startSizeRef = useRef({ width: 0, height: 0 })
  const directionRef = useRef<ResizeDirection>('se')
  const windowElRef = useRef<HTMLElement | null>(null)
  const aspectRatioRef = useRef(1)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const z = zoom()
      const dx = (e.clientX - startMouseRef.current.x) / z
      const dy = (e.clientY - startMouseRef.current.y) / z
      const dir = directionRef.current
      const ar = aspectRatioRef.current

      let newWidth = startSizeRef.current.width
      let newHeight = startSizeRef.current.height

      if (dir === 'se') {
        // Use the larger delta to drive both dimensions
        const dw = startSizeRef.current.width + dx
        const dh = startSizeRef.current.height + dy
        if (Math.abs(dx) > Math.abs(dy)) {
          newWidth = dw
          newHeight = newWidth / ar
        } else {
          newHeight = dh
          newWidth = newHeight * ar
        }
      } else if (dir === 'e') {
        newWidth = startSizeRef.current.width + dx
        newHeight = newWidth / ar
      } else if (dir === 's') {
        newHeight = startSizeRef.current.height + dy
        newWidth = newHeight * ar
      }

      const minWidth = 100
      const minHeight = minWidth / ar
      newWidth = Math.max(minWidth, newWidth)
      newHeight = Math.max(minHeight, newHeight)

      const session = sessionStore.getState().sessions.get(sessionId)
      sessionStore.getState().updateSession(sessionId, {
        size: {
          width: newWidth,
          height: newHeight,
          cols: 0,
          rows: 0,
        },
      })

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

      snapPreviewStore.getState().hide()

      // Snap to grid while preserving aspect ratio
      const session = sessionStore.getState().sessions.get(sessionId) as ImageSession | undefined
      if (session) {
        const snappedWidth = Math.round(session.size.width / gridSize) * gridSize
        const snappedHeight = Math.round(snappedWidth / session.aspectRatio / gridSize) * gridSize
        sessionStore.getState().updateSession(sessionId, {
          size: {
            ...session.size,
            width: Math.max(100, snappedWidth),
            height: Math.max(100, snappedHeight),
          },
        })
      }

      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    },
    [sessionId, gridSize, onPointerMove]
  )

  const onResizeStart = useCallback(
    (e: React.PointerEvent, direction: ResizeDirection) => {
      e.stopPropagation()

      const session = sessionStore.getState().sessions.get(sessionId) as ImageSession | undefined
      if (!session) return

      directionRef.current = direction
      startMouseRef.current = { x: e.clientX, y: e.clientY }
      startSizeRef.current = {
        width: session.size.width,
        height: session.size.height,
      }
      aspectRatioRef.current = session.aspectRatio

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
