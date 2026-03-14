import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { canvasStore } from '../../stores/canvasStore'

/**
 * Tests for canvas control module-level functions and zoom math.
 *
 * The module-level functions (setPanTo, getCurrentPan, getCurrentZoom, setZoomTo,
 * zoomIn, zoomOut) rely on refs that are initialized by useCanvasControls.
 * Since we can't invoke React hooks in tests, we test the zoom math and
 * canvas store interaction separately.
 */

describe('zoom math', () => {
  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 3.0
  const ZOOM_SENSITIVITY = 0.002
  const ZOOM_STEP = 1.2

  function clampZoom(zoom: number): number {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
  }

  function zoomTowardCursor(
    oldZoom: number,
    delta: number,
    cursorX: number,
    cursorY: number,
    panX: number,
    panY: number
  ): { zoom: number; panX: number; panY: number } {
    const newZoom = clampZoom(oldZoom * (1 + delta))
    const ratio = newZoom / oldZoom
    return {
      zoom: newZoom,
      panX: cursorX - (cursorX - panX) * ratio,
      panY: cursorY - (cursorY - panY) * ratio,
    }
  }

  it('clamps zoom to minimum 0.1', () => {
    expect(clampZoom(0.05)).toBe(0.1)
    expect(clampZoom(-1)).toBe(0.1)
  })

  it('clamps zoom to maximum 3.0', () => {
    expect(clampZoom(5.0)).toBe(3.0)
    expect(clampZoom(100)).toBe(3.0)
  })

  it('passes through valid zoom values', () => {
    expect(clampZoom(1.0)).toBe(1.0)
    expect(clampZoom(0.5)).toBe(0.5)
    expect(clampZoom(2.5)).toBe(2.5)
  })

  it('zooms toward cursor — pan adjusts to keep cursor position stable', () => {
    const result = zoomTowardCursor(1.0, 0.2, 400, 300, 0, 0)
    expect(result.zoom).toBe(1.2)
    // At zoom 1.2, cursor position in canvas space should be preserved
    // panX = 400 - (400 - 0) * 1.2 = 400 - 480 = -80
    expect(result.panX).toBeCloseTo(-80, 1)
    expect(result.panY).toBeCloseTo(-60, 1)
  })

  it('zoom toward cursor at center with no pan returns centered result', () => {
    const result = zoomTowardCursor(1.0, 0.2, 0, 0, 0, 0)
    // When cursor is at origin with zero pan, pan stays at 0
    expect(result.panX).toBeCloseTo(0, 1)
    expect(result.panY).toBeCloseTo(0, 1)
  })

  describe('zoomIn/zoomOut step', () => {
    it('zoomIn multiplies by ZOOM_STEP (1.2)', () => {
      const current = 1.0
      const result = clampZoom(current * ZOOM_STEP)
      expect(result).toBe(1.2)
    })

    it('zoomOut divides by ZOOM_STEP (1.2)', () => {
      const current = 1.2
      const result = clampZoom(current / ZOOM_STEP)
      expect(result).toBe(1.0)
    })

    it('zoomIn from max stays at max', () => {
      const result = clampZoom(3.0 * ZOOM_STEP)
      expect(result).toBe(3.0)
    })

    it('zoomOut from min stays at min', () => {
      const result = clampZoom(0.1 / ZOOM_STEP)
      expect(result).toBe(0.1)
    })
  })
})

describe('scroll-to-pan math', () => {
  it('subtracts deltaX/deltaY from pan', () => {
    let panX = 100
    let panY = 200
    const deltaX = 50
    const deltaY = -30

    panX -= deltaX
    panY -= deltaY

    expect(panX).toBe(50)
    expect(panY).toBe(230)
  })
})

describe('grid opacity based on zoom', () => {
  // Grid opacity is linearly interpolated based on zoom level
  function gridOpacity(zoom: number): number {
    if (zoom < 0.3) return 0
    if (zoom > 0.6) return 1
    return (zoom - 0.3) / 0.3
  }

  it('returns 0 at very low zoom', () => {
    expect(gridOpacity(0.1)).toBe(0)
    expect(gridOpacity(0.29)).toBe(0)
  })

  it('returns 1 at normal zoom', () => {
    expect(gridOpacity(1.0)).toBe(1)
    expect(gridOpacity(0.61)).toBe(1)
  })

  it('interpolates between 0.3 and 0.6', () => {
    const opacity = gridOpacity(0.45)
    expect(opacity).toBeCloseTo(0.5, 1)
  })
})

describe('canvasStore integration', () => {
  beforeEach(() => {
    canvasStore.setState({ panX: 0, panY: 0, zoom: 1.0, gridSize: 20 })
  })

  it('setPan and setZoom update the store', () => {
    canvasStore.getState().setPan(100, 200)
    canvasStore.getState().setZoom(1.5)

    expect(canvasStore.getState().panX).toBe(100)
    expect(canvasStore.getState().panY).toBe(200)
    expect(canvasStore.getState().zoom).toBe(1.5)
  })

  it('setZoom clamps values', () => {
    canvasStore.getState().setZoom(0.01)
    expect(canvasStore.getState().zoom).toBe(0.1)

    canvasStore.getState().setZoom(10)
    expect(canvasStore.getState().zoom).toBe(3.0)
  })
})
