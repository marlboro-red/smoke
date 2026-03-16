import { bench, describe } from 'vitest'
import { SpatialIndex } from '../SpatialIndex'

// --- Helpers ---

function makeEntries(count: number) {
  const entries: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }> = []
  for (let i = 0; i < count; i++) {
    entries.push({
      id: `s${i}`,
      bounds: {
        x: (i % 100) * 700,
        y: Math.floor(i / 100) * 500,
        width: 640,
        height: 480,
      },
    })
  }
  return entries
}

const VIEWPORT_CENTER = { x: 20_000, y: 10_000, width: 1920, height: 1080 }
const VIEWPORT_ORIGIN = { x: -200, y: -200, width: 2320, height: 1480 }

// --- Construction benchmarks ---

describe('SpatialIndex construction', () => {
  const entries10 = makeEntries(10)
  const entries50 = makeEntries(50)
  const entries100 = makeEntries(100)
  const entries1000 = makeEntries(1000)

  bench('fromEntries — 10 sessions', () => {
    SpatialIndex.fromEntries(entries10)
  })

  bench('fromEntries — 50 sessions', () => {
    SpatialIndex.fromEntries(entries50)
  })

  bench('fromEntries — 100 sessions', () => {
    SpatialIndex.fromEntries(entries100)
  })

  bench('fromEntries — 1000 sessions', () => {
    SpatialIndex.fromEntries(entries1000)
  })
})

// --- Query benchmarks ---

describe('SpatialIndex query', () => {
  const index100 = SpatialIndex.fromEntries(makeEntries(100))
  const index1000 = SpatialIndex.fromEntries(makeEntries(1000))

  bench('query 100-element index (center viewport)', () => {
    index100.query(VIEWPORT_CENTER)
  })

  bench('query 100-element index (origin viewport)', () => {
    index100.query(VIEWPORT_ORIGIN)
  })

  bench('query 1000-element index (center viewport)', () => {
    index1000.query(VIEWPORT_CENTER)
  })

  bench('query 1000-element index (origin viewport)', () => {
    index1000.query(VIEWPORT_ORIGIN)
  })
})

// --- Viewport culling math (isVisible equivalent) ---

describe('viewport culling recalculation', () => {
  bench('build + query cycle — 100 sessions', () => {
    const entries = makeEntries(100)
    const index = SpatialIndex.fromEntries(entries)
    index.query(VIEWPORT_ORIGIN)
  })

  bench('build + query cycle — 1000 sessions', () => {
    const entries = makeEntries(1000)
    const index = SpatialIndex.fromEntries(entries)
    index.query(VIEWPORT_ORIGIN)
  })
})
