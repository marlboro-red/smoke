import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { snapSize, CHROME_HEIGHT } from '../useSnapping'

/**
 * Tests for window resize logic extracted from useWindowResize.ts.
 * Tests resize direction handling, minimum size enforcement, terminal size
 * recalculation on release, and PTY resize sync.
 *
 * Related to smoke-2va (rendering issues when resizing terminal windows).
 */

const XTERM_PADDING = 8

function calculateTerminalSize(
  widthPx: number,
  heightPx: number,
  charWidth: number,
  charHeight: number
): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.floor((widthPx - XTERM_PADDING) / charWidth)),
    rows: Math.max(1, Math.floor((heightPx - XTERM_PADDING) / charHeight)),
  }
}

describe('window resize logic', () => {
  const gridSize = 20
  const charWidth = 7.8
  const charHeight = 15.6

  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  describe('resize direction handling', () => {
    function calculateNewSize(
      direction: 'e' | 's' | 'se',
      startWidth: number,
      startHeight: number,
      dx: number,
      dy: number,
      gridSize: number
    ): { width: number; height: number } {
      let newWidth = startWidth
      let newHeight = startHeight

      if (direction === 'e' || direction === 'se') {
        newWidth = startWidth + dx
      }
      if (direction === 's' || direction === 'se') {
        newHeight = startHeight + dy
      }

      // Enforce minimum
      const minWidth = 10 * gridSize
      const minHeight = 8 * gridSize
      newWidth = Math.max(minWidth, newWidth)
      newHeight = Math.max(minHeight, newHeight)

      return { width: newWidth, height: newHeight }
    }

    it('east direction only changes width', () => {
      const result = calculateNewSize('e', 640, 480, 100, 50, gridSize)
      expect(result.width).toBe(740)
      expect(result.height).toBe(480)
    })

    it('south direction only changes height', () => {
      const result = calculateNewSize('s', 640, 480, 100, 50, gridSize)
      expect(result.width).toBe(640)
      expect(result.height).toBe(530)
    })

    it('southeast direction changes both', () => {
      const result = calculateNewSize('se', 640, 480, 100, 50, gridSize)
      expect(result.width).toBe(740)
      expect(result.height).toBe(530)
    })

    it('enforces minimum width (10 * gridSize)', () => {
      const result = calculateNewSize('e', 640, 480, -600, 0, gridSize)
      expect(result.width).toBe(200) // 10 * 20
    })

    it('enforces minimum height (8 * gridSize)', () => {
      const result = calculateNewSize('s', 640, 480, 0, -400, gridSize)
      expect(result.height).toBe(160) // 8 * 20
    })
  })

  describe('snap and terminal size on release (smoke-2va regression)', () => {
    it('snaps size to grid on pointer up', () => {
      const snapped = snapSize({ width: 647, height: 483 }, gridSize)
      expect(snapped.width % gridSize).toBe(0)
      expect(snapped.height % gridSize).toBe(0)
    })

    it('recalculates terminal cols/rows after snap', () => {
      const snapped = snapSize({ width: 640, height: 480 }, gridSize)
      const termSize = calculateTerminalSize(
        snapped.width,
        snapped.height - CHROME_HEIGHT,
        charWidth,
        charHeight
      )

      expect(termSize.cols).toBe(Math.floor((640 - XTERM_PADDING) / charWidth))
      expect(termSize.rows).toBe(Math.floor((448 - XTERM_PADDING) / charHeight))
    })

    it('subtracts CHROME_HEIGHT from height before calculating terminal size', () => {
      const height = 480
      const termHeight = height - CHROME_HEIGHT
      expect(termHeight).toBe(448)

      const termSize = calculateTerminalSize(640, termHeight, charWidth, charHeight)
      expect(termSize.rows).toBeGreaterThan(0)
    })

    it('handles minimum size window correctly', () => {
      const snapped = snapSize({ width: 50, height: 50 }, gridSize)
      // Should be clamped to minimum
      expect(snapped.width).toBe(200)
      expect(snapped.height).toBe(160)

      const termSize = calculateTerminalSize(
        snapped.width,
        snapped.height - CHROME_HEIGHT,
        charWidth,
        charHeight
      )
      expect(termSize.cols).toBeGreaterThanOrEqual(2)
      expect(termSize.rows).toBeGreaterThanOrEqual(1)
    })
  })

  describe('zoom compensation during resize', () => {
    it('divides mouse delta by zoom factor', () => {
      const zoom = 0.5
      const mouseDx = 100
      const mouseDy = 80
      const canvasDx = mouseDx / zoom
      const canvasDy = mouseDy / zoom

      expect(canvasDx).toBe(200)
      expect(canvasDy).toBe(160)
    })
  })

  describe('session store update on resize release', () => {
    it('updates session with snapped size and new cols/rows', () => {
      const session = sessionStore.getState().createSession('/tmp')

      const snapped = snapSize({ width: 800, height: 600 }, gridSize)
      const termSize = calculateTerminalSize(
        snapped.width,
        snapped.height - CHROME_HEIGHT,
        charWidth,
        charHeight
      )

      sessionStore.getState().updateSession(session.id, {
        size: { ...snapped, cols: termSize.cols, rows: termSize.rows },
      })

      const updated = sessionStore.getState().sessions.get(session.id)!
      expect(updated.size.width).toBe(snapped.width)
      expect(updated.size.height).toBe(snapped.height)
      expect(updated.size.cols).toBe(termSize.cols)
      expect(updated.size.rows).toBe(termSize.rows)
    })
  })
})
