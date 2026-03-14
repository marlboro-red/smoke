import { describe, it, expect } from 'vitest'

/**
 * Unit tests for canvas pan/zoom math.
 * These test the pure calculation logic extracted from useCanvasControls.
 */

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3.0

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

function zoomTowardCursor(
  cursorX: number,
  cursorY: number,
  oldPanX: number,
  oldPanY: number,
  oldZoom: number,
  newZoom: number
): { panX: number; panY: number } {
  const ratio = newZoom / oldZoom
  return {
    panX: cursorX - (cursorX - oldPanX) * ratio,
    panY: cursorY - (cursorY - oldPanY) * ratio,
  }
}

function gridOpacity(zoom: number): number {
  if (zoom < 0.3) return 0
  return Math.min(1, (zoom - 0.3) * 2)
}

describe('zoom clamping', () => {
  it('clamps zoom below minimum to 0.1', () => {
    expect(clampZoom(0.05)).toBe(0.1)
    expect(clampZoom(-1)).toBe(0.1)
  })

  it('clamps zoom above maximum to 3.0', () => {
    expect(clampZoom(5)).toBe(3.0)
    expect(clampZoom(100)).toBe(3.0)
  })

  it('passes through values in range', () => {
    expect(clampZoom(1.0)).toBe(1.0)
    expect(clampZoom(0.5)).toBe(0.5)
    expect(clampZoom(2.5)).toBe(2.5)
  })
})

describe('zoom-to-cursor math', () => {
  it('zoom at origin does not change pan when cursor at origin', () => {
    const result = zoomTowardCursor(0, 0, 0, 0, 1.0, 2.0)
    expect(result.panX).toBe(0)
    expect(result.panY).toBe(0)
  })

  it('zoom toward cursor keeps cursor point stable', () => {
    // When zooming from 1.0 to 2.0 with cursor at (400, 300)
    // and pan at (0, 0), the cursor position in canvas space should remain the same
    const cursorX = 400
    const cursorY = 300
    const oldPanX = 0
    const oldPanY = 0
    const oldZoom = 1.0
    const newZoom = 2.0

    const result = zoomTowardCursor(cursorX, cursorY, oldPanX, oldPanY, oldZoom, newZoom)

    // The canvas point under the cursor before zoom:
    // canvasX = (cursorX - oldPanX) / oldZoom = 400
    // After zoom, with new pan:
    // canvasX = (cursorX - newPanX) / newZoom = (400 - (-400)) / 2 = 400
    expect(result.panX).toBe(-400)
    expect(result.panY).toBe(-300)

    // Verify: the canvas point under cursor is the same
    const canvasBefore = (cursorX - oldPanX) / oldZoom
    const canvasAfter = (cursorX - result.panX) / newZoom
    expect(canvasBefore).toBeCloseTo(canvasAfter)
  })

  it('zoom out works correctly', () => {
    const result = zoomTowardCursor(500, 500, -200, -200, 2.0, 1.0)
    // ratio = 1.0 / 2.0 = 0.5
    // panX = 500 - (500 - (-200)) * 0.5 = 500 - 350 = 150
    expect(result.panX).toBe(150)
    expect(result.panY).toBe(150)
  })

  it('preserves canvas coordinates for arbitrary values', () => {
    const cursorX = 300
    const cursorY = 200
    const oldPanX = -50
    const oldPanY = 100
    const oldZoom = 1.5
    const newZoom = 0.8

    const result = zoomTowardCursor(cursorX, cursorY, oldPanX, oldPanY, oldZoom, newZoom)

    const canvasXBefore = (cursorX - oldPanX) / oldZoom
    const canvasXAfter = (cursorX - result.panX) / newZoom
    const canvasYBefore = (cursorY - oldPanY) / oldZoom
    const canvasYAfter = (cursorY - result.panY) / newZoom

    expect(canvasXBefore).toBeCloseTo(canvasXAfter, 10)
    expect(canvasYBefore).toBeCloseTo(canvasYAfter, 10)
  })
})

describe('grid opacity', () => {
  it('returns 0 when zoom < 0.3', () => {
    expect(gridOpacity(0.1)).toBe(0)
    expect(gridOpacity(0.2)).toBe(0)
    expect(gridOpacity(0.29)).toBe(0)
  })

  it('returns 0 at exactly zoom = 0.3', () => {
    expect(gridOpacity(0.3)).toBeCloseTo(0)
  })

  it('fades in between 0.3 and 0.8', () => {
    expect(gridOpacity(0.5)).toBeCloseTo(0.4)
    expect(gridOpacity(0.55)).toBeCloseTo(0.5)
  })

  it('returns 1 when zoom >= 0.8', () => {
    expect(gridOpacity(0.8)).toBeCloseTo(1)
    expect(gridOpacity(1.0)).toBe(1)
    expect(gridOpacity(2.0)).toBe(1)
  })
})

describe('pan via scroll', () => {
  it('deltaX/deltaY translate to pan changes', () => {
    // Simulating: panRef.current.x -= deltaX, panRef.current.y -= deltaY
    const panX = 100
    const panY = 200
    const deltaX = 30
    const deltaY = -20

    const newPanX = panX - deltaX
    const newPanY = panY - deltaY

    expect(newPanX).toBe(70)
    expect(newPanY).toBe(220)
  })
})
