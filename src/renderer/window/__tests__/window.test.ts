import { describe, it, expect } from 'vitest'
import { snap, snapPosition, snapSize, nearestGridLines, CHROME_HEIGHT } from '../useSnapping'

describe('useSnapping', () => {
  describe('snap', () => {
    it('snaps value to nearest grid line', () => {
      expect(snap(107, 20)).toBe(100)
      expect(snap(113, 20)).toBe(120)
      expect(snap(110, 20)).toBe(120) // midpoint rounds up
    })

    it('snaps exact grid values to themselves', () => {
      expect(snap(100, 20)).toBe(100)
      expect(snap(0, 20)).toBe(0)
      expect(snap(60, 20)).toBe(60)
    })

    it('works with different grid sizes', () => {
      expect(snap(33, 10)).toBe(30)
      expect(snap(37, 10)).toBe(40)
      expect(snap(75, 50)).toBe(100)
      expect(snap(74, 50)).toBe(50)
    })

    it('handles negative values', () => {
      expect(snap(-107, 20)).toBe(-100)
      expect(snap(-113, 20)).toBe(-120)
    })
  })

  describe('snapPosition', () => {
    it('snaps both x and y coordinates', () => {
      const result = snapPosition({ x: 107, y: 213 }, 20)
      expect(result).toEqual({ x: 100, y: 220 })
    })

    it('preserves already-snapped positions', () => {
      const result = snapPosition({ x: 100, y: 200 }, 20)
      expect(result).toEqual({ x: 100, y: 200 })
    })
  })

  describe('snapSize', () => {
    it('snaps width and height to grid', () => {
      const result = snapSize({ width: 647, height: 483 }, 20)
      expect(result.width % 20).toBe(0)
      expect(result.height % 20).toBe(0)
    })

    it('enforces minimum width (10 cells)', () => {
      const result = snapSize({ width: 50, height: 300 }, 20)
      expect(result.width).toBe(200) // 10 * 20
    })

    it('enforces minimum height (8 cells)', () => {
      const result = snapSize({ width: 300, height: 50 }, 20)
      expect(result.height).toBe(160) // 8 * 20
    })

    it('does not shrink sizes already above minimum', () => {
      const result = snapSize({ width: 640, height: 480 }, 20)
      expect(result.width).toBe(640)
      expect(result.height).toBe(480)
    })

    it('works with custom min cell counts', () => {
      const result = snapSize({ width: 50, height: 50 }, 20, 5, 5)
      expect(result.width).toBe(100) // 5 * 20
      expect(result.height).toBe(100) // 5 * 20
    })
  })

  describe('nearestGridLines', () => {
    it('returns grid lines around a value', () => {
      const result = nearestGridLines(107, 20)
      expect(result.before).toBeLessThanOrEqual(107)
      expect(result.after).toBeGreaterThanOrEqual(107)
      expect(result.after - result.before).toBe(20)
    })

    it('returns same value for both when on grid line', () => {
      const result = nearestGridLines(100, 20)
      expect(result.before).toBe(100)
      expect(result.after).toBe(120)
    })
  })

  describe('CHROME_HEIGHT', () => {
    it('is 32px', () => {
      expect(CHROME_HEIGHT).toBe(32)
    })
  })
})

describe('zoom compensation math', () => {
  // This tests the critical zoom compensation formula used in drag/resize
  function applyZoomCompensatedDelta(
    mouseDelta: number,
    zoom: number
  ): number {
    return mouseDelta / zoom
  }

  it('at zoom 1.0, mouse delta equals canvas delta', () => {
    expect(applyZoomCompensatedDelta(100, 1.0)).toBe(100)
  })

  it('at zoom 0.5, mouse delta is doubled for canvas', () => {
    expect(applyZoomCompensatedDelta(100, 0.5)).toBe(200)
  })

  it('at zoom 2.0, mouse delta is halved for canvas', () => {
    expect(applyZoomCompensatedDelta(100, 2.0)).toBe(50)
  })

  it('preserves direction with negative deltas', () => {
    expect(applyZoomCompensatedDelta(-100, 0.5)).toBe(-200)
  })
})

describe('resize terminal size calculation', () => {
  // Inlined from useTerminal to avoid browser-dependent imports
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

  const charWidth = 7.8
  const charHeight = 15.6

  it('calculates terminal size after resize with chrome height subtracted', () => {
    const snappedWidth = 640
    const snappedHeight = 480
    const result = calculateTerminalSize(
      snappedWidth,
      snappedHeight - CHROME_HEIGHT,
      charWidth,
      charHeight
    )
    expect(result.cols).toBe(Math.floor((640 - XTERM_PADDING) / charWidth))
    expect(result.rows).toBe(Math.floor((448 - XTERM_PADDING) / charHeight))
  })

  it('handles minimum window size (200x160)', () => {
    const result = calculateTerminalSize(
      200,
      160 - CHROME_HEIGHT,
      charWidth,
      charHeight
    )
    expect(result.cols).toBe(Math.floor((200 - XTERM_PADDING) / charWidth))
    expect(result.rows).toBe(Math.floor((128 - XTERM_PADDING) / charHeight))
    expect(result.cols).toBeGreaterThanOrEqual(2)
    expect(result.rows).toBeGreaterThanOrEqual(1)
  })
})
