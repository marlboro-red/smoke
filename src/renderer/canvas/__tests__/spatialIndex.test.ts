import { describe, it, expect } from 'vitest'
import { SpatialIndex } from '../SpatialIndex'

describe('SpatialIndex', () => {
  it('returns empty results for empty index', () => {
    const index = SpatialIndex.fromEntries([])
    const results = index.query({ x: 0, y: 0, width: 1000, height: 1000 })
    expect(results).toEqual([])
  })

  it('finds items within viewport', () => {
    const index = SpatialIndex.fromEntries([
      { id: 'a', bounds: { x: 100, y: 100, width: 200, height: 200 } },
      { id: 'b', bounds: { x: 500, y: 500, width: 200, height: 200 } },
    ])
    const results = index.query({ x: 0, y: 0, width: 400, height: 400 })
    expect(results).toContain('a')
    expect(results).not.toContain('b')
  })

  it('excludes items outside viewport', () => {
    const index = SpatialIndex.fromEntries([
      { id: 'a', bounds: { x: 5000, y: 5000, width: 100, height: 100 } },
    ])
    const results = index.query({ x: 0, y: 0, width: 1000, height: 1000 })
    expect(results).toEqual([])
  })

  it('finds partially overlapping items', () => {
    const index = SpatialIndex.fromEntries([
      { id: 'a', bounds: { x: -50, y: -50, width: 200, height: 200 } },
    ])
    const results = index.query({ x: 0, y: 0, width: 100, height: 100 })
    expect(results).toContain('a')
  })

  it('handles many items (stress test)', () => {
    const entries = []
    for (let i = 0; i < 500; i++) {
      entries.push({
        id: `s-${i}`,
        bounds: {
          x: (i % 25) * 700,
          y: Math.floor(i / 25) * 600,
          width: 640,
          height: 480,
        },
      })
    }
    const index = SpatialIndex.fromEntries(entries)

    // Query a small viewport — should only find items near origin
    const results = index.query({ x: 0, y: 0, width: 1920, height: 1080 })
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThan(500)

    // All returned items should actually overlap the viewport
    for (const id of results) {
      const i = parseInt(id.split('-')[1])
      const x = (i % 25) * 700
      const y = Math.floor(i / 25) * 600
      const overlaps =
        x + 640 > 0 && x < 1920 && y + 480 > 0 && y < 1080
      expect(overlaps).toBe(true)
    }
  })

  it('returns correct results with negative coordinates', () => {
    const index = SpatialIndex.fromEntries([
      { id: 'neg', bounds: { x: -500, y: -500, width: 200, height: 200 } },
      { id: 'pos', bounds: { x: 100, y: 100, width: 200, height: 200 } },
    ])
    const results = index.query({ x: -600, y: -600, width: 400, height: 400 })
    expect(results).toContain('neg')
    expect(results).not.toContain('pos')
  })

  it('finds items at exact viewport boundary', () => {
    const index = SpatialIndex.fromEntries([
      { id: 'edge', bounds: { x: 999, y: 0, width: 100, height: 100 } },
    ])
    // Viewport ends at x=1000, item starts at x=999 — overlaps by 1px
    const results = index.query({ x: 0, y: 0, width: 1000, height: 1000 })
    expect(results).toContain('edge')
  })

  it('single item is found when viewport covers it', () => {
    const index = SpatialIndex.fromEntries([
      { id: 'only', bounds: { x: 50, y: 50, width: 100, height: 100 } },
    ])
    const results = index.query({ x: 0, y: 0, width: 200, height: 200 })
    expect(results).toContain('only')
  })
})
