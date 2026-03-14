import { useCallback, useRef } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { setPanTo, getCurrentPan, getCurrentZoom, getCanvasRootElement } from '../canvas/useCanvasControls'

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

const ANIMATION_DURATION = 300

export function usePanToSession(): (sessionId: string) => void {
  const animFrameRef = useRef<number | null>(null)

  return useCallback((sessionId: string) => {
    const session = sessionStore.getState().sessions.get(sessionId)
    if (!session) return

    // Cancel any ongoing animation
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
    }

    // Focus and bring to front
    sessionStore.getState().focusSession(sessionId)
    sessionStore.getState().bringToFront(sessionId)

    // Get viewport dimensions
    const rootEl = getCanvasRootElement()
    if (!rootEl) return
    const rect = rootEl.getBoundingClientRect()
    const viewportWidth = rect.width
    const viewportHeight = rect.height

    const zoom = getCurrentZoom()
    const startPan = getCurrentPan()
    const startX = startPan.x
    const startY = startPan.y

    // Calculate target pan to center session in viewport
    const targetX = viewportWidth / 2 - (session.position.x + session.size.width / 2) * zoom
    const targetY = viewportHeight / 2 - (session.position.y + session.size.height / 2) * zoom

    const startTime = performance.now()

    function animate(now: number): void {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / ANIMATION_DURATION)
      const eased = easeOut(progress)

      const currentX = startX + (targetX - startX) * eased
      const currentY = startY + (targetY - startY) * eased

      setPanTo(currentX, currentY)

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        animFrameRef.current = null
      }
    }

    animFrameRef.current = requestAnimationFrame(animate)
  }, [])
}
