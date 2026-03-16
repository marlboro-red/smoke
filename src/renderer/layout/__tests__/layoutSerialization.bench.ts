import { bench, describe } from 'vitest'
import type { Layout } from '../../../preload/types'

// --- Fixture helpers ---

function makeLayout(sessionCount: number): Layout {
  const sessionTypes = ['terminal', 'file', 'note', 'webview', 'image', 'snippet'] as const
  const sessions = Array.from({ length: sessionCount }, (_, i) => {
    const type = sessionTypes[i % sessionTypes.length]
    const base: Record<string, unknown> = {
      type,
      title: `Session ${i} — ${type}`,
      cwd: type === 'terminal' ? `/home/user/project${i}` : '',
      position: { x: (i % 10) * 700, y: Math.floor(i / 10) * 500 },
      size: { width: 640, height: 480, cols: 80, rows: 24 },
    }
    if (type === 'file') {
      base.filePath = `/home/user/project/src/file${i}.ts`
      base.language = 'typescript'
    }
    if (type === 'note') {
      base.content = `Note content for session ${i}\nWith multiple lines\nAnd some detail.`
      base.color = '#ff6b6b'
    }
    if (type === 'webview') {
      base.url = `http://localhost:${3000 + i}`
    }
    if (type === 'image') {
      base.filePath = `/home/user/images/screenshot${i}.png`
      base.aspectRatio = 1.777
    }
    if (type === 'snippet') {
      base.content = `function example${i}() {\n  return ${i};\n}`
      base.language = 'javascript'
    }
    if (i % 7 === 0) base.locked = true
    if (i % 11 === 0) {
      base.isPinned = true
      base.pinnedViewportPos = { x: 100 + i, y: 50 + i }
    }
    return base
  })

  return {
    name: `bench-layout-${sessionCount}`,
    sessions: sessions as Layout['sessions'],
    viewport: { panX: -500, panY: -300, zoom: 0.75 },
    gridSize: 20,
    regions: Array.from({ length: Math.min(sessionCount / 5, 10) }, (_, i) => ({
      name: `Region ${i}`,
      color: `hsl(${i * 36}, 70%, 50%)`,
      position: { x: i * 2000, y: 0 },
      size: { width: 1800, height: 1200 },
    })),
  }
}

// --- Serialization benchmarks ---

describe('layout serialization', () => {
  const layout10 = makeLayout(10)
  const layout50 = makeLayout(50)
  const layout100 = makeLayout(100)

  bench('JSON.stringify — 10 sessions', () => {
    JSON.stringify(layout10)
  })

  bench('JSON.stringify — 50 sessions', () => {
    JSON.stringify(layout50)
  })

  bench('JSON.stringify — 100 sessions', () => {
    JSON.stringify(layout100)
  })
})

// --- Deserialization benchmarks ---

describe('layout deserialization', () => {
  const json10 = JSON.stringify(makeLayout(10))
  const json50 = JSON.stringify(makeLayout(50))
  const json100 = JSON.stringify(makeLayout(100))

  bench('JSON.parse — 10 sessions', () => {
    JSON.parse(json10)
  })

  bench('JSON.parse — 50 sessions', () => {
    JSON.parse(json50)
  })

  bench('JSON.parse — 100 sessions', () => {
    JSON.parse(json100)
  })
})

// --- Round-trip benchmarks ---

describe('layout round-trip (serialize + deserialize)', () => {
  const layout50 = makeLayout(50)
  const layout100 = makeLayout(100)

  bench('round-trip — 50 sessions', () => {
    JSON.parse(JSON.stringify(layout50))
  })

  bench('round-trip — 100 sessions', () => {
    JSON.parse(JSON.stringify(layout100))
  })
})
