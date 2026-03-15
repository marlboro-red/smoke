import { useEffect, useCallback, useRef } from 'react'
import {
  presentationStore,
  useIsPresenting,
  useBookmarks,
  useCurrentSlideIndex,
} from './presentationStore'
import { setPanTo, setZoomTo, getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import '../styles/presentation-mode.css'

const ANIMATION_DURATION = 400

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2
}

function animateToBookmark(panX: number, panY: number, zoom: number): void {
  const startPan = getCurrentPan()
  const startZoom = getCurrentZoom()
  const startTime = performance.now()
  let frame: number | null = null

  function tick(now: number): void {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / ANIMATION_DURATION)
    const eased = easeInOut(progress)

    const currentX = startPan.x + (panX - startPan.x) * eased
    const currentY = startPan.y + (panY - startPan.y) * eased
    const currentZoom = startZoom + (zoom - startZoom) * eased

    setZoomTo(currentZoom)
    setPanTo(currentX, currentY)

    if (progress < 1) {
      frame = requestAnimationFrame(tick)
    }
  }

  if (frame !== null) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(tick)
}

export default function PresentationMode(): JSX.Element | null {
  const isPresenting = useIsPresenting()
  const bookmarks = useBookmarks()
  const currentIndex = useCurrentSlideIndex()
  const animatedIndexRef = useRef(-1)

  // Navigate to current bookmark when index changes
  useEffect(() => {
    if (!isPresenting) {
      animatedIndexRef.current = -1
      return
    }
    const bookmark = bookmarks[currentIndex]
    if (!bookmark) return
    if (animatedIndexRef.current === currentIndex) return
    animatedIndexRef.current = currentIndex
    animateToBookmark(bookmark.panX, bookmark.panY, bookmark.zoom)
  }, [isPresenting, currentIndex, bookmarks])

  const handleNext = useCallback(() => {
    presentationStore.getState().nextSlide()
  }, [])

  const handlePrev = useCallback(() => {
    presentationStore.getState().prevSlide()
  }, [])

  const handleExit = useCallback(() => {
    presentationStore.getState().stopPresentation()
  }, [])

  // Keyboard navigation (capture phase to intercept before other handlers)
  useEffect(() => {
    if (!isPresenting) return

    const onKeyDown = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault()
          e.stopPropagation()
          handleNext()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          handlePrev()
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          handleExit()
          break
      }
    }

    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isPresenting, handleNext, handlePrev, handleExit])

  // Hide sidebar and apply fullscreen class
  useEffect(() => {
    if (isPresenting) {
      document.documentElement.classList.add('presentation-active')
    } else {
      document.documentElement.classList.remove('presentation-active')
    }
    return () => document.documentElement.classList.remove('presentation-active')
  }, [isPresenting])

  if (!isPresenting) return null

  const total = bookmarks.length
  const current = bookmarks[currentIndex]
  const isFirst = currentIndex === 0
  const isLast = currentIndex === total - 1

  return (
    <div className="presentation-overlay">
      <div className="presentation-controls">
        <button
          className="presentation-btn presentation-btn--nav"
          onClick={handlePrev}
          disabled={isFirst}
          title="Previous (Left Arrow)"
        >
          &#8249;
        </button>

        <div className="presentation-indicator">
          <span className="presentation-slide-name">{current?.name || `Slide ${currentIndex + 1}`}</span>
          <span className="presentation-slide-count">
            {currentIndex + 1} / {total}
          </span>
        </div>

        <button
          className="presentation-btn presentation-btn--nav"
          onClick={handleNext}
          disabled={isLast}
          title="Next (Right Arrow)"
        >
          &#8250;
        </button>

        <div className="presentation-divider" />

        <button
          className="presentation-btn presentation-btn--exit"
          onClick={handleExit}
          title="Exit (Esc)"
        >
          Exit
        </button>
      </div>

      {/* Slide dots for quick navigation */}
      {total > 1 && total <= 20 && (
        <div className="presentation-dots">
          {bookmarks.map((bm, i) => (
            <button
              key={bm.id}
              className={`presentation-dot ${i === currentIndex ? 'presentation-dot--active' : ''}`}
              onClick={() => presentationStore.getState().goToSlide(i)}
              title={bm.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}
