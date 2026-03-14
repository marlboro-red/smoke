import { describe, it, expect } from 'vitest'

/**
 * Pure unit tests for viewport culling math.
 * Extracted to avoid importing React hooks in vitest.
 */

const CULLING_MARGIN = 200
const THUMBNAIL_THRESHOLD = 0.4

interface SessionLike {
  position: { x: number; y: number }
  size: { width: number; height: number }
}

function isVisible(
  session: SessionLike,
  pan: { x: number; y: number },
  zoom: number,
  canvasRect: { width: number; height: number },
  margin: number = CULLING_MARGIN
): boolean {
  const vpLeft = -pan.x / zoom
  const vpTop = -pan.y / zoom
  const vpRight = vpLeft + canvasRect.width / zoom
  const vpBottom = vpTop + canvasRect.height / zoom

  return (
    session.position.x + session.size.width >= vpLeft - margin &&
    session.position.x <= vpRight + margin &&
    session.position.y + session.size.height >= vpTop - margin &&
    session.position.y <= vpBottom + margin
  )
}

const CANVAS = { width: 1920, height: 1080 }

describe('isVisible - viewport culling', () => {
  it('session at origin is visible with default pan/zoom', () => {
    const session = { position: { x: 0, y: 0 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(true)
  })

  it('session within viewport is visible', () => {
    const session = { position: { x: 500, y: 300 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(true)
  })

  it('session far off-screen to the right is not visible', () => {
    const session = { position: { x: 5000, y: 0 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
  })

  it('session far off-screen to the left is not visible', () => {
    const session = { position: { x: -3000, y: 0 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
  })

  it('session far off-screen above is not visible', () => {
    const session = { position: { x: 0, y: -3000 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
  })

  it('session far off-screen below is not visible', () => {
    const session = { position: { x: 0, y: 5000 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
  })

  it('session within margin is still visible (prevents pop-in)', () => {
    // Session is just outside the right edge of viewport but within 200px margin
    // Viewport right = 0 + 1920/1 = 1920, session at x=2000 with width 640
    // vpRight + margin = 1920 + 200 = 2120, session.x = 2000 <= 2120 ✓
    // vpLeft - margin = 0 - 200 = -200, session.x + width = 2640 >= -200 ✓
    const session = { position: { x: 2000, y: 0 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(true)
  })

  it('session beyond margin is not visible', () => {
    // Session at x=2200, vpRight + margin = 1920 + 200 = 2120, session.x = 2200 > 2120
    const session = { position: { x: 2200, y: 0 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
  })

  it('custom margin overrides default', () => {
    const session = { position: { x: 2200, y: 0 }, size: { width: 640, height: 480 } }
    // With default 200px margin: not visible
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS, 200)).toBe(false)
    // With 500px margin: visible
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS, 500)).toBe(true)
  })
})

describe('isVisible - with pan offset', () => {
  it('panning right reveals sessions to the right', () => {
    const session = { position: { x: 3000, y: 0 }, size: { width: 640, height: 480 } }
    // Without pan: not visible
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
    // Pan left by -2000 (reveals right side): vpLeft = -(-2000)/1 = 2000
    expect(isVisible(session, { x: -2000, y: 0 }, 1.0, CANVAS)).toBe(true)
  })

  it('panning down reveals sessions below', () => {
    const session = { position: { x: 0, y: 3000 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
    expect(isVisible(session, { x: 0, y: -2500 }, 1.0, CANVAS)).toBe(true)
  })
})

describe('isVisible - with zoom', () => {
  it('zooming out reveals more sessions', () => {
    const session = { position: { x: 5000, y: 0 }, size: { width: 640, height: 480 } }
    // At zoom 1.0: viewport extends to 1920, way too far
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(false)
    // At zoom 0.2: viewport extends to 1920/0.2 = 9600
    expect(isVisible(session, { x: 0, y: 0 }, 0.2, CANVAS)).toBe(true)
  })

  it('zooming in hides distant sessions', () => {
    const session = { position: { x: 1500, y: 0 }, size: { width: 640, height: 480 } }
    // At zoom 1.0: visible (within 1920 + margin)
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(true)
    // At zoom 3.0: viewport extends to 1920/3 = 640, session at 1500 > 640+200
    expect(isVisible(session, { x: 0, y: 0 }, 3.0, CANVAS)).toBe(false)
  })
})

describe('isVisible - partially visible sessions', () => {
  it('session partially off left edge is visible', () => {
    const session = { position: { x: -300, y: 0 }, size: { width: 640, height: 480 } }
    // x + width = -300 + 640 = 340, vpLeft - margin = -200. 340 >= -200 ✓
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(true)
  })

  it('session partially off top edge is visible', () => {
    const session = { position: { x: 0, y: -200 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: 0, y: 0 }, 1.0, CANVAS)).toBe(true)
  })
})

describe('thumbnail threshold', () => {
  it('threshold is 0.4', () => {
    expect(THUMBNAIL_THRESHOLD).toBe(0.4)
  })

  it('zoom below threshold triggers thumbnail mode', () => {
    expect(0.3 < THUMBNAIL_THRESHOLD).toBe(true)
    expect(0.39 < THUMBNAIL_THRESHOLD).toBe(true)
  })

  it('zoom at or above threshold stays in full mode', () => {
    expect(0.4 < THUMBNAIL_THRESHOLD).toBe(false)
    expect(1.0 < THUMBNAIL_THRESHOLD).toBe(false)
  })
})

describe('culling with combined pan and zoom', () => {
  it('panned and zoomed viewport correctly includes visible session', () => {
    // Pan = (-500, -300), zoom = 0.5
    // vpLeft = 500/0.5 = 1000, vpTop = 300/0.5 = 600
    // vpRight = 1000 + 1920/0.5 = 1000 + 3840 = 4840
    // vpBottom = 600 + 1080/0.5 = 600 + 2160 = 2760
    const session = { position: { x: 2000, y: 1000 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: -500, y: -300 }, 0.5, CANVAS)).toBe(true)
  })

  it('panned and zoomed viewport correctly excludes distant session', () => {
    // Same viewport as above: vpRight + margin = 4840 + 200 = 5040
    const session = { position: { x: 6000, y: 1000 }, size: { width: 640, height: 480 } }
    expect(isVisible(session, { x: -500, y: -300 }, 0.5, CANVAS)).toBe(false)
  })
})
