import { sessionStore, type Session } from '../stores/sessionStore'
import { canvasStore } from '../stores/canvasStore'
import { setPanTo, setZoomTo, getCanvasRootElement } from '../canvas/useCanvasControls'
import { snap } from '../window/useSnapping'

export type LayoutStrategy = 'grid' | 'horizontal' | 'vertical'

const GAP = 40 // pixels between elements
const PADDING = 60 // padding around the entire layout
const ANIMATION_DURATION = 400 // ms

/**
 * Compute grid layout positions for all sessions.
 * Returns a map of session ID -> new position.
 */
function computeGridLayout(
  sessions: Session[],
  gridSize: number
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  if (sessions.length === 0) return result

  const cols = Math.ceil(Math.sqrt(sessions.length))
  // Sort by createdAt for consistent ordering
  const sorted = [...sessions].sort((a, b) => a.createdAt - b.createdAt)

  let x = PADDING
  let y = PADDING
  let rowMaxHeight = 0

  sorted.forEach((session, i) => {
    if (i > 0 && i % cols === 0) {
      x = PADDING
      y += rowMaxHeight + GAP
      rowMaxHeight = 0
    }

    result.set(session.id, {
      x: snap(x, gridSize),
      y: snap(y, gridSize),
    })

    rowMaxHeight = Math.max(rowMaxHeight, session.size.height)
    x += session.size.width + GAP
  })

  return result
}

function computeHorizontalLayout(
  sessions: Session[],
  gridSize: number
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  const sorted = [...sessions].sort((a, b) => a.createdAt - b.createdAt)

  let x = PADDING
  sorted.forEach((session) => {
    result.set(session.id, {
      x: snap(x, gridSize),
      y: snap(PADDING, gridSize),
    })
    x += session.size.width + GAP
  })

  return result
}

function computeVerticalLayout(
  sessions: Session[],
  gridSize: number
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  const sorted = [...sessions].sort((a, b) => a.createdAt - b.createdAt)

  let y = PADDING
  sorted.forEach((session) => {
    result.set(session.id, {
      x: snap(PADDING, gridSize),
      y: snap(y, gridSize),
    })
    y += session.size.height + GAP
  })

  return result
}

/**
 * Compute the bounding box of all sessions after layout.
 */
function computeBounds(
  sessions: Session[],
  positions: Map<string, { x: number; y: number }>
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const session of sessions) {
    const pos = positions.get(session.id)
    if (!pos) continue
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + session.size.width)
    maxY = Math.max(maxY, pos.y + session.size.height)
  }

  return { minX, minY, maxX, maxY }
}

/**
 * Add and remove the `auto-layout-animating` class on all terminal windows
 * to enable CSS transitions for position changes.
 */
function enableLayoutAnimation(): void {
  const windows = document.querySelectorAll('.terminal-window')
  windows.forEach((el) => el.classList.add('auto-layout-animating'))

  setTimeout(() => {
    windows.forEach((el) => el.classList.remove('auto-layout-animating'))
  }, ANIMATION_DURATION + 50)
}

/**
 * Pan and zoom the viewport to fit all elements with some padding.
 */
function fitViewport(sessions: Session[], positions: Map<string, { x: number; y: number }>): void {
  const rootEl = getCanvasRootElement()
  if (!rootEl || sessions.length === 0) return

  const rect = rootEl.getBoundingClientRect()
  const viewportWidth = rect.width
  const viewportHeight = rect.height

  const bounds = computeBounds(sessions, positions)
  const contentWidth = bounds.maxX - bounds.minX + PADDING * 2
  const contentHeight = bounds.maxY - bounds.minY + PADDING * 2

  // Calculate zoom to fit, clamped to [0.2, 1.0]
  const zoomX = viewportWidth / contentWidth
  const zoomY = viewportHeight / contentHeight
  const zoom = Math.max(0.2, Math.min(1.0, Math.min(zoomX, zoomY)))

  // Center the content
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  const panX = viewportWidth / 2 - centerX * zoom
  const panY = viewportHeight / 2 - centerY * zoom

  setZoomTo(zoom)
  setPanTo(panX, panY)
}

/**
 * Perform auto-layout on all canvas elements.
 */
export function performAutoLayout(strategy: LayoutStrategy = 'grid'): void {
  const { sessions } = sessionStore.getState()
  const sessionList = Array.from(sessions.values())
  if (sessionList.length === 0) return

  const gridSize = canvasStore.getState().gridSize

  let positions: Map<string, { x: number; y: number }>
  switch (strategy) {
    case 'horizontal':
      positions = computeHorizontalLayout(sessionList, gridSize)
      break
    case 'vertical':
      positions = computeVerticalLayout(sessionList, gridSize)
      break
    case 'grid':
    default:
      positions = computeGridLayout(sessionList, gridSize)
      break
  }

  // Enable CSS transitions for smooth animation
  enableLayoutAnimation()

  // Update all session positions
  for (const [id, pos] of positions) {
    sessionStore.getState().updateSession(id, { position: pos })
  }

  // Fit viewport to show all elements after animation completes
  setTimeout(() => {
    fitViewport(sessionList, positions)
  }, ANIMATION_DURATION)
}
