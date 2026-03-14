import { describe, it, expect } from 'vitest'

/**
 * Pure unit tests for terminal size calculation logic.
 * Extracted to avoid importing xterm.js which needs a browser environment.
 */

function calculateTerminalSize(
  widthPx: number,
  heightPx: number,
  charWidth: number,
  charHeight: number
): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.floor(widthPx / charWidth)),
    rows: Math.max(1, Math.floor(heightPx / charHeight)),
  }
}

describe('calculateTerminalSize', () => {
  const charWidth = 7.8
  const charHeight = 15.6

  it('calculates cols and rows from pixel dimensions', () => {
    const result = calculateTerminalSize(640, 480, charWidth, charHeight)
    expect(result.cols).toBe(Math.floor(640 / charWidth))
    expect(result.rows).toBe(Math.floor(480 / charHeight))
  })

  it('enforces minimum cols of 2', () => {
    const result = calculateTerminalSize(5, 480, charWidth, charHeight)
    expect(result.cols).toBe(2)
  })

  it('enforces minimum rows of 1', () => {
    const result = calculateTerminalSize(640, 5, charWidth, charHeight)
    expect(result.rows).toBe(1)
  })

  it('handles exact multiples', () => {
    const width = charWidth * 80
    const height = charHeight * 24
    const result = calculateTerminalSize(width, height, charWidth, charHeight)
    expect(result.cols).toBe(80)
    expect(result.rows).toBe(24)
  })

  it('floors partial cells', () => {
    const width = charWidth * 80 + charWidth * 0.9
    const height = charHeight * 24 + charHeight * 0.5
    const result = calculateTerminalSize(width, height, charWidth, charHeight)
    expect(result.cols).toBe(80)
    expect(result.rows).toBe(24)
  })

  it('handles zero dimensions gracefully', () => {
    const result = calculateTerminalSize(0, 0, charWidth, charHeight)
    expect(result.cols).toBe(2)
    expect(result.rows).toBe(1)
  })

  it('works with different char dimensions', () => {
    const result = calculateTerminalSize(800, 600, 10, 20)
    expect(result.cols).toBe(80)
    expect(result.rows).toBe(30)
  })

  it('recalculates correctly when container changes size', () => {
    const initial = calculateTerminalSize(640, 480, charWidth, charHeight)
    const resized = calculateTerminalSize(800, 600, charWidth, charHeight)
    expect(resized.cols).toBeGreaterThan(initial.cols)
    expect(resized.rows).toBeGreaterThan(initial.rows)
  })
})
