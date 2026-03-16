/**
 * Performance regression thresholds for critical hot paths.
 *
 * Each test establishes a generous ceiling (baseline + ~20% margin).
 * Exceeding a threshold indicates a regression that must be investigated.
 *
 * Baselines were established on an Apple Silicon Mac — thresholds are set
 * conservatively so they pass on slower CI runners as well.
 */

import { describe, it, expect } from 'vitest'
import { TerminalOutputBuffer, stripAnsi } from '../main/ai/TerminalOutputBuffer'
import { SpatialIndex } from '../renderer/canvas/SpatialIndex'
import { parseImports } from '../main/imports/importParser'
import type { Language } from '../main/imports/importParser'

// ——— TerminalOutputBuffer ———

const PLAIN_CHUNK = 'build output line with some typical content here\n'
const ANSI_CHUNK =
  '\x1b[32m✓\x1b[0m \x1b[1mtest passed\x1b[0m: some test name here with extra detail\n'
const MULTIBYTE_CHUNK = '你好世界🚀テスト完了 output line\n'

describe('TerminalOutputBuffer regression thresholds', () => {
  it('10K plain-text appends < 500ms', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    const start = performance.now()
    for (let i = 0; i < 10_000; i++) buf.append('s1', PLAIN_CHUNK)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('10K ANSI-heavy appends < 500ms', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    const start = performance.now()
    for (let i = 0; i < 10_000; i++) buf.append('s1', ANSI_CHUNK)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('5K multibyte appends < 500ms', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    const start = performance.now()
    for (let i = 0; i < 5_000; i++) buf.append('s1', MULTIBYTE_CHUNK)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('stripAnsi 100-line block < 5ms', () => {
    const block = ANSI_CHUNK.repeat(100)
    const start = performance.now()
    for (let i = 0; i < 100; i++) stripAnsi(block)
    expect(performance.now() - start).toBeLessThan(5)
  })
})

// ——— SpatialIndex / viewport culling ———

function makeEntries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    bounds: {
      x: (i % 100) * 700,
      y: Math.floor(i / 100) * 500,
      width: 640,
      height: 480,
    },
  }))
}

const VIEWPORT = { x: -200, y: -200, width: 2320, height: 1480 }

describe('SpatialIndex regression thresholds', () => {
  it('construct + query 100 sessions < 5ms', () => {
    const entries = makeEntries(100)
    const start = performance.now()
    const index = SpatialIndex.fromEntries(entries)
    index.query(VIEWPORT)
    expect(performance.now() - start).toBeLessThan(5)
  })

  it('construct + query 1000 sessions < 20ms', () => {
    const entries = makeEntries(1000)
    const start = performance.now()
    const index = SpatialIndex.fromEntries(entries)
    index.query(VIEWPORT)
    expect(performance.now() - start).toBeLessThan(20)
  })

  it('query 1000-element index 1000 times < 100ms', () => {
    const index = SpatialIndex.fromEntries(makeEntries(1000))
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      index.query({
        x: (i % 50) * 700 - 200,
        y: Math.floor(i / 50) * 500 - 200,
        width: 2320,
        height: 1480,
      })
    }
    expect(performance.now() - start).toBeLessThan(100)
  })
})

// ——— Import parser ———

function generateJSSource(n: number): string {
  return Array.from({ length: n }, (_, i) =>
    i % 3 === 0
      ? `import { thing${i} } from './module${i}'`
      : i % 3 === 1
        ? `const mod${i} = require('./lib${i}')`
        : `export { default } from './reexport${i}'`
  ).join('\n') + '\nfunction main() {}\n'
}

describe('importParser regression thresholds', () => {
  it('parse 100 JS imports < 5ms', () => {
    const source = generateJSSource(100)
    const start = performance.now()
    parseImports(source, 'js')
    expect(performance.now() - start).toBeLessThan(5)
  })

  it('parse 200 mixed-language files < 50ms', () => {
    const sources: Array<{ source: string; lang: Language }> = []
    for (let i = 0; i < 200; i++) {
      sources.push({ source: generateJSSource(20), lang: 'ts' })
    }
    const start = performance.now()
    for (const { source, lang } of sources) parseImports(source, lang)
    expect(performance.now() - start).toBeLessThan(50)
  })
})

// ——— Layout serialization ———

function makeLayout(sessionCount: number) {
  const types = ['terminal', 'file', 'note', 'webview', 'image', 'snippet']
  return {
    name: `bench-${sessionCount}`,
    sessions: Array.from({ length: sessionCount }, (_, i) => ({
      type: types[i % types.length],
      title: `Session ${i}`,
      cwd: `/home/user/p${i}`,
      position: { x: (i % 10) * 700, y: Math.floor(i / 10) * 500 },
      size: { width: 640, height: 480, cols: 80, rows: 24 },
    })),
    viewport: { panX: -500, panY: -300, zoom: 0.75 },
    gridSize: 20,
    regions: [],
  }
}

describe('layout serialization regression thresholds', () => {
  it('round-trip 100-session layout 500 times < 200ms', () => {
    const layout = makeLayout(100)
    const start = performance.now()
    for (let i = 0; i < 500; i++) JSON.parse(JSON.stringify(layout))
    expect(performance.now() - start).toBeLessThan(200)
  })

  it('serialize 100-session layout 1000 times < 200ms', () => {
    const layout = makeLayout(100)
    const start = performance.now()
    for (let i = 0; i < 1000; i++) JSON.stringify(layout)
    expect(performance.now() - start).toBeLessThan(200)
  })
})
