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
