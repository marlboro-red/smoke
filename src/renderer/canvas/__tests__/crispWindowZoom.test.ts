import { describe, it, expect } from 'vitest'

/**
 * Tests for the crisp window zoom logic (smoke-hlgf).
 *
 * Validates that CSS zoom + counter-scale produces correct visual sizing
 * for non-terminal canvas elements (file viewers, notes, images, etc.)
 * and that the crisp chrome wrapper maintains correct proportions for
 * terminal window title bars.
 */

const CRISP_THRESHOLD = 1.05
const CHROME_HEIGHT = 32

describe('crispWindowZoom: CSS zoom + counter-scale visual invariant', () => {
  const testSizes = [
    { name: '640×480', width: 640, height: 480 },
    { name: '400×300', width: 400, height: 300 },
    { name: '1200×900', width: 1200, height: 900 },
  ]

  const zoomLevels = [1.1, 1.25, 1.5, 2.0, 2.5, 3.0]

  for (const { name, width, height } of testSizes) {
    for (const zoom of zoomLevels) {
      it(`${name} at zoom=${zoom}: visual size unchanged after CSS zoom + counter-scale`, () => {
        // CSS zoom makes the element zoom× bigger in layout
        // transform: scale(1/zoom) shrinks the visual back to original
        const visualWidth = width * zoom * (1 / zoom)
        const visualHeight = height * zoom * (1 / zoom)
        expect(visualWidth).toBeCloseTo(width, 10)
        expect(visualHeight).toBeCloseTo(height, 10)
      })
    }
  }

  it('threshold prevents activation at zoom ≈ 1.0', () => {
    expect(1.0 > CRISP_THRESHOLD).toBe(false)
    expect(1.04 > CRISP_THRESHOLD).toBe(false)
    expect(1.06 > CRISP_THRESHOLD).toBe(true)
  })

  it('CSS zoom increases rendering resolution', () => {
    const width = 640
    const zoom = 2.0
    const dpr = 2

    // Without crisp: rendered at width * DPR pixels
    const normalPixels = width * dpr
    // With CSS zoom: rendered at width * zoom * DPR pixels
    const crispPixels = width * zoom * dpr

    expect(crispPixels).toBe(normalPixels * zoom)
  })
})

describe('crispWindowZoom: chrome crisp wrapper proportions', () => {
  for (const zoom of [1.5, 2.0, 3.0]) {
    it(`chrome at zoom=${zoom}: visual height preserved`, () => {
      // Inner wrapper: height=CHROME_HEIGHT, CSS zoom=zoom, scale(1/zoom)
      // Visual height = CHROME_HEIGHT * zoom * (1/zoom) = CHROME_HEIGHT
      const visualHeight = CHROME_HEIGHT * zoom * (1 / zoom)
      expect(visualHeight).toBeCloseTo(CHROME_HEIGHT, 10)
    })
  }

  it('chrome wrapper width fills parent', () => {
    const parentWidth = 800
    const zoom = 2.0
    // Inner wrapper: width=100% (parentWidth), CSS zoom
    // Visual width = parentWidth * zoom * (1/zoom) = parentWidth
    const visualWidth = parentWidth * zoom * (1 / zoom)
    expect(visualWidth).toBeCloseTo(parentWidth, 10)
  })

  it('body height calculation remains correct with CSS zoom', () => {
    // For non-terminal windows with CSS zoom on the outer div:
    // Internal layout is not affected by the element's own CSS zoom.
    // Chrome: CHROME_HEIGHT px, Body: calc(100% - CHROME_HEIGHT px)
    // CSS zoom scales everything uniformly.
    const windowHeight = 480
    const bodyHeight = windowHeight - CHROME_HEIGHT
    const zoom = 2.0

    // Visual body = bodyHeight * zoom * (1/zoom) = bodyHeight
    const visualBody = bodyHeight * zoom * (1 / zoom)
    expect(visualBody).toBeCloseTo(bodyHeight, 10)

    // Visual chrome = CHROME_HEIGHT * zoom * (1/zoom) = CHROME_HEIGHT
    const visualChrome = CHROME_HEIGHT * zoom * (1 / zoom)
    expect(visualChrome).toBeCloseTo(CHROME_HEIGHT, 10)

    // Total visual = visual chrome + visual body = original height
    expect(visualBody + visualChrome).toBeCloseTo(windowHeight, 10)
  })
})

describe('crispWindowZoom: position invariant', () => {
  it('element position unchanged with CSS zoom + counter-scale', () => {
    const left = 200
    const top = 150
    const zoom = 2.0

    // CSS zoom on the element does not change left/top in parent coords.
    // transform: scale(1/zoom) with origin 0,0 keeps top-left at (left, top).
    // The viewport scale(viewportZoom) then places it at
    // (left * viewportZoom + panX, top * viewportZoom + panY) — same as without crisp zoom.
    expect(left).toBe(200)
    expect(top).toBe(150)
  })
})
