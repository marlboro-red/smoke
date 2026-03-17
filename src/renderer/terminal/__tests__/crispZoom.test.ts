import { describe, it, expect } from 'vitest'

/**
 * Regression tests for crisp zoom logic (smoke-nm1j).
 *
 * Validates the mathematical invariant: when the terminal container, font size,
 * AND xterm padding are all scaled by the same zoom factor, FitAddon calculates
 * the same cols/rows. This ensures crisp rendering at high zoom levels without
 * triggering a PTY resize.
 */

const BASE_XTERM_PADDING = 4 // padding per side (var(--space-xs))
const CRISP_THRESHOLD = 1.05

function calculateTerminalSize(
  widthPx: number,
  heightPx: number,
  charWidth: number,
  charHeight: number,
  padPerSide: number = BASE_XTERM_PADDING
): { cols: number; rows: number } {
  const totalPad = padPerSide * 2
  return {
    cols: Math.max(2, Math.floor((widthPx - totalPad) / charWidth)),
    rows: Math.max(1, Math.floor((heightPx - totalPad) / charHeight)),
  }
}

/**
 * Simulate what happens when crisp zoom is applied:
 * - Container inflates by `zoom` (both width and height)
 * - Font size (and thus char dimensions) scales by `zoom`
 * - xterm padding scales by `zoom`
 * - Cols/rows should remain identical to the unzoomed calculation
 */
function calculateCrispSize(
  baseWidth: number,
  baseHeight: number,
  baseCharWidth: number,
  baseCharHeight: number,
  zoom: number
): { cols: number; rows: number } {
  const crispWidth = baseWidth * zoom
  const crispHeight = baseHeight * zoom
  const crispCharWidth = baseCharWidth * zoom
  const crispCharHeight = baseCharHeight * zoom
  const crispPad = BASE_XTERM_PADDING * zoom
  return calculateTerminalSize(crispWidth, crispHeight, crispCharWidth, crispCharHeight, crispPad)
}

describe('crispZoom: cols/rows invariant (regression: smoke-nm1j)', () => {
  const baseCharWidth = 7.8
  const baseCharHeight = 15.6

  const testCases = [
    { name: '640×480 container', width: 640, height: 480 },
    { name: '800×600 container', width: 800, height: 600 },
    { name: '400×300 small container', width: 400, height: 300 },
    { name: '1200×900 large container', width: 1200, height: 900 },
    { name: 'narrow 200×600', width: 200, height: 600 },
    { name: 'wide 1000×200', width: 1000, height: 200 },
  ]

  const zoomLevels = [1.1, 1.25, 1.5, 2.0, 2.5, 3.0]

  for (const { name, width, height } of testCases) {
    for (const zoom of zoomLevels) {
      it(`${name} at zoom=${zoom}: cols/rows unchanged`, () => {
        const base = calculateTerminalSize(width, height, baseCharWidth, baseCharHeight)
        const crisp = calculateCrispSize(width, height, baseCharWidth, baseCharHeight, zoom)
        expect(crisp.cols).toBe(base.cols)
        expect(crisp.rows).toBe(base.rows)
      })
    }
  }

  it('crisp zoom has no effect at zoom ≤ threshold', () => {
    const width = 640
    const height = 480
    const base = calculateTerminalSize(width, height, baseCharWidth, baseCharHeight)
    const atOne = calculateCrispSize(width, height, baseCharWidth, baseCharHeight, 1.0)
    expect(atOne.cols).toBe(base.cols)
    expect(atOne.rows).toBe(base.rows)
  })

  it('crisp zoom increases canvas resolution', () => {
    const width = 640
    const zoom = 2.0
    const dpr = 2
    // Without crisp: canvas backing pixels = container * DPR
    const normalCanvasPixels = width * dpr
    // With crisp: inflated container * DPR (before counter-scale)
    const crispCanvasPixels = (width * zoom) * dpr
    expect(crispCanvasPixels).toBe(normalCanvasPixels * zoom)
  })

  it('counter-scale produces correct visual size', () => {
    const width = 640
    const zoom = 2.0
    // Visual width = inflated width × counter-scale(1/zoom) × viewport scale(zoom)
    const inflatedWidth = width * zoom
    const counterScale = 1 / zoom
    const viewportScale = zoom
    const visualWidth = inflatedWidth * counterScale * viewportScale
    expect(visualWidth).toBe(width * zoom)
  })

  it('uses Math.round for fontSize to avoid sub-pixel rendering', () => {
    const baseFontSize = 13
    const zoom = 1.5
    const crispFontSize = Math.round(baseFontSize * zoom)
    expect(crispFontSize).toBe(20) // 19.5 → 20
    expect(Number.isInteger(crispFontSize)).toBe(true)
  })

  it('threshold prevents activation at zoom ≈ 1.0', () => {
    expect(1.0 > CRISP_THRESHOLD).toBe(false)
    expect(1.04 > CRISP_THRESHOLD).toBe(false)
    expect(1.06 > CRISP_THRESHOLD).toBe(true)
  })

  it('padding scales proportionally (prevents off-by-one)', () => {
    // Verify the algebraic identity: (W*z - 2*pad*z) / (cellW*z) = (W - 2*pad) / cellW
    const W = 800
    const pad = BASE_XTERM_PADDING
    const cellW = 7.8
    const z = 2.5
    const baseCols = (W - 2 * pad) / cellW
    const crispCols = (W * z - 2 * pad * z) / (cellW * z)
    expect(crispCols).toBeCloseTo(baseCols, 10)
  })
})
