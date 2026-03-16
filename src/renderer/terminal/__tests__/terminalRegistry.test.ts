import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Unit tests for terminal registry logic.
 * Uses extracted pure logic to avoid importing xterm.js browser dependencies.
 */

const WEBGL_DISPOSE_TIMEOUT = 60_000

interface MockTerminalEntry {
  terminal: { disposed: boolean }
  webglAddon: { disposed: boolean; dispose: () => void } | null
  hiddenAt: number | null
  charDims: { width: number; height: number }
}

// Minimal re-implementation of registry logic for testing
function createRegistry() {
  const registry = new Map<string, MockTerminalEntry>()
  const disposeTimers = new Map<string, ReturnType<typeof setTimeout>>()

  return {
    get: (id: string) => registry.get(id),
    size: () => registry.size,

    register: (
      id: string,
      terminal: { disposed: boolean },
      webglAddon: { disposed: boolean; dispose: () => void } | null,
      charDims: { width: number; height: number }
    ) => {
      registry.set(id, { terminal, webglAddon, hiddenAt: null, charDims })
    },

    unregister: (id: string) => {
      const entry = registry.get(id)
      if (entry) {
        if (entry.webglAddon) {
          entry.webglAddon.dispose()
        }
        entry.terminal.disposed = true
        registry.delete(id)
      }
      const timer = disposeTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        disposeTimers.delete(id)
      }
    },

    markHidden: (id: string) => {
      const entry = registry.get(id)
      if (!entry) return
      entry.hiddenAt = Date.now()

      if (entry.webglAddon) {
        const timer = setTimeout(() => {
          const current = registry.get(id)
          if (current?.webglAddon && current.hiddenAt !== null) {
            current.webglAddon.dispose()
            current.webglAddon = null
          }
          disposeTimers.delete(id)
        }, WEBGL_DISPOSE_TIMEOUT)
        disposeTimers.set(id, timer)
      }
    },

    markVisible: (id: string) => {
      const entry = registry.get(id)
      if (!entry) return
      entry.hiddenAt = null

      const timer = disposeTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        disposeTimers.delete(id)
      }
    },
  }
}

function mockWebglAddon() {
  const addon = { disposed: false, dispose: () => { addon.disposed = true } }
  return addon
}

// --- Hidden buffer cap logic (mirrors appendToHiddenBuffer in terminalRegistry.ts) ---

interface HiddenBuffer {
  chunks: string[]
  totalChars: number
}

function appendToHiddenBuffer(buf: HiddenBuffer, data: string, maxChars: number): void {
  buf.chunks.push(data)
  buf.totalChars += data.length

  while (buf.totalChars > maxChars && buf.chunks.length > 1) {
    const oldest = buf.chunks.shift()!
    buf.totalChars -= oldest.length
  }

  if (buf.totalChars > maxChars && buf.chunks.length === 1) {
    const excess = buf.totalChars - maxChars
    buf.chunks[0] = buf.chunks[0].slice(excess)
    buf.totalChars = maxChars
  }
}

describe('hiddenBuffer cap (regression: smoke-curu)', () => {
  it('evicts oldest chunks when exceeding max chars', () => {
    const buf: HiddenBuffer = { chunks: [], totalChars: 0 }
    const maxChars = 100

    // Push 60 chars, then another 60 — total would be 120, exceeding 100
    appendToHiddenBuffer(buf, 'a'.repeat(60), maxChars)
    appendToHiddenBuffer(buf, 'b'.repeat(60), maxChars)

    expect(buf.totalChars).toBeLessThanOrEqual(maxChars)
    // First chunk should have been evicted, leaving only the second
    expect(buf.chunks.length).toBe(1)
    expect(buf.chunks[0]).toBe('b'.repeat(60))
    expect(buf.totalChars).toBe(60)
  })

  it('truncates a single oversized chunk from the front', () => {
    const buf: HiddenBuffer = { chunks: [], totalChars: 0 }
    const maxChars = 50

    // Push a single chunk larger than the cap
    appendToHiddenBuffer(buf, 'x'.repeat(200), maxChars)

    expect(buf.totalChars).toBe(maxChars)
    expect(buf.chunks.length).toBe(1)
    expect(buf.chunks[0].length).toBe(50)
  })

  it('does not evict when within capacity', () => {
    const buf: HiddenBuffer = { chunks: [], totalChars: 0 }
    const maxChars = 100

    appendToHiddenBuffer(buf, 'a'.repeat(30), maxChars)
    appendToHiddenBuffer(buf, 'b'.repeat(30), maxChars)
    appendToHiddenBuffer(buf, 'c'.repeat(30), maxChars)

    expect(buf.totalChars).toBe(90)
    expect(buf.chunks.length).toBe(3)
  })

  it('evicts multiple old chunks to fit a large new chunk', () => {
    const buf: HiddenBuffer = { chunks: [], totalChars: 0 }
    const maxChars = 100

    // Add 5 chunks of 30 chars each (150 total, will be evicted as we go)
    for (let i = 0; i < 5; i++) {
      appendToHiddenBuffer(buf, String(i).repeat(30), maxChars)
    }

    expect(buf.totalChars).toBeLessThanOrEqual(maxChars)
  })

  it('join of chunks gives the most recent data', () => {
    const buf: HiddenBuffer = { chunks: [], totalChars: 0 }
    const maxChars = 20

    appendToHiddenBuffer(buf, 'old-data-', maxChars)
    appendToHiddenBuffer(buf, 'new-data-end', maxChars)

    const result = buf.chunks.join('')
    // Should contain the newest data, old data evicted
    expect(result).toContain('new-data-end')
    expect(buf.totalChars).toBeLessThanOrEqual(maxChars)
  })
})

describe('terminalRegistry', () => {
  let registry: ReturnType<typeof createRegistry>

  beforeEach(() => {
    vi.useFakeTimers()
    registry = createRegistry()
  })

  it('starts empty', () => {
    expect(registry.size()).toBe(0)
  })

  it('register adds a terminal entry', () => {
    const terminal = { disposed: false }
    registry.register('s1', terminal, null, { width: 8, height: 16 })
    expect(registry.size()).toBe(1)
    expect(registry.get('s1')?.terminal).toBe(terminal)
  })

  it('unregister removes terminal and disposes it', () => {
    const terminal = { disposed: false }
    const webgl = mockWebglAddon()
    registry.register('s1', terminal, webgl, { width: 8, height: 16 })
    registry.unregister('s1')
    expect(registry.size()).toBe(0)
    expect(terminal.disposed).toBe(true)
    expect(webgl.disposed).toBe(true)
  })

  it('markHidden sets hiddenAt timestamp', () => {
    registry.register('s1', { disposed: false }, null, { width: 8, height: 16 })
    registry.markHidden('s1')
    expect(registry.get('s1')?.hiddenAt).not.toBeNull()
  })

  it('markVisible clears hiddenAt', () => {
    registry.register('s1', { disposed: false }, null, { width: 8, height: 16 })
    registry.markHidden('s1')
    registry.markVisible('s1')
    expect(registry.get('s1')?.hiddenAt).toBeNull()
  })

  it('WebGL addon is disposed after 60s hidden', () => {
    const webgl = mockWebglAddon()
    registry.register('s1', { disposed: false }, webgl, { width: 8, height: 16 })
    registry.markHidden('s1')

    // Before 60s: WebGL still alive
    vi.advanceTimersByTime(59_999)
    expect(webgl.disposed).toBe(false)
    expect(registry.get('s1')?.webglAddon).not.toBeNull()

    // After 60s: WebGL disposed
    vi.advanceTimersByTime(1)
    expect(webgl.disposed).toBe(true)
    expect(registry.get('s1')?.webglAddon).toBeNull()
  })

  it('WebGL disposal is cancelled when terminal becomes visible again', () => {
    const webgl = mockWebglAddon()
    registry.register('s1', { disposed: false }, webgl, { width: 8, height: 16 })
    registry.markHidden('s1')

    // Advance 30s then mark visible
    vi.advanceTimersByTime(30_000)
    registry.markVisible('s1')

    // Advance past 60s from initial hide
    vi.advanceTimersByTime(40_000)
    expect(webgl.disposed).toBe(false)
    expect(registry.get('s1')?.webglAddon).not.toBeNull()
  })

  it('terminal without WebGL addon: markHidden still works', () => {
    registry.register('s1', { disposed: false }, null, { width: 8, height: 16 })
    registry.markHidden('s1')
    vi.advanceTimersByTime(120_000)
    // No error, terminal still exists
    expect(registry.get('s1')).toBeDefined()
    expect(registry.get('s1')?.hiddenAt).not.toBeNull()
  })

  it('preserves charDims through register', () => {
    registry.register('s1', { disposed: false }, null, { width: 7.8, height: 15.6 })
    expect(registry.get('s1')?.charDims).toEqual({ width: 7.8, height: 15.6 })
  })

  it('unregister is no-op for unknown session', () => {
    registry.unregister('unknown')
    expect(registry.size()).toBe(0)
  })

  it('multiple terminals can be registered', () => {
    registry.register('s1', { disposed: false }, null, { width: 8, height: 16 })
    registry.register('s2', { disposed: false }, null, { width: 8, height: 16 })
    expect(registry.size()).toBe(2)
  })
})
