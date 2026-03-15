import { Terminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'

interface TerminalEntry {
  terminal: Terminal
  webglAddon: WebglAddon | null
  hiddenAt: number | null
  charDims: { width: number; height: number }
}

const WEBGL_DISPOSE_TIMEOUT = 60_000

const registry = new Map<string, TerminalEntry>()
const disposeTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Buffers for PTY data arriving while terminals are off-screen
const hiddenBuffers = new Map<string, string[]>()
const hiddenUnsubs = new Map<string, () => void>()

export function getTerminal(sessionId: string): TerminalEntry | undefined {
  return registry.get(sessionId)
}

export function registerTerminal(
  sessionId: string,
  terminal: Terminal,
  webglAddon: WebglAddon | null,
  charDims: { width: number; height: number }
): void {
  registry.set(sessionId, { terminal, webglAddon, hiddenAt: null, charDims })
}

export function unregisterTerminal(sessionId: string): void {
  const entry = registry.get(sessionId)
  if (entry) {
    if (entry.webglAddon) {
      try {
        entry.webglAddon.dispose()
      } catch {
        // already disposed
      }
    }
    entry.terminal.dispose()
    registry.delete(sessionId)
  }
  const timer = disposeTimers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    disposeTimers.delete(sessionId)
  }
  // Clean up any hidden buffer state
  const unsub = hiddenUnsubs.get(sessionId)
  if (unsub) {
    unsub()
    hiddenUnsubs.delete(sessionId)
  }
  hiddenBuffers.delete(sessionId)
}

export function markHidden(sessionId: string): void {
  const entry = registry.get(sessionId)
  if (!entry) return
  entry.hiddenAt = Date.now()

  // Start buffering PTY data while the terminal is off-screen.
  // The component's usePty listener gets torn down on unmount, so without
  // this buffer any data from active processes would be lost.
  if (window.smokeAPI?.pty?.onData && !hiddenUnsubs.has(sessionId)) {
    const buffer: string[] = []
    hiddenBuffers.set(sessionId, buffer)
    const unsub = window.smokeAPI.pty.onData((event) => {
      if (event.id === sessionId) {
        buffer.push(event.data)
      }
    })
    hiddenUnsubs.set(sessionId, unsub)
  }

  // Schedule WebGL addon disposal after 60s off-screen
  if (entry.webglAddon) {
    const timer = setTimeout(() => {
      const current = registry.get(sessionId)
      if (current?.webglAddon && current.hiddenAt !== null) {
        try {
          current.webglAddon.dispose()
        } catch {
          // already disposed
        }
        current.webglAddon = null
      }
      disposeTimers.delete(sessionId)
    }, WEBGL_DISPOSE_TIMEOUT)
    disposeTimers.set(sessionId, timer)
  }
}

export function markVisible(sessionId: string): void {
  const entry = registry.get(sessionId)
  if (!entry) return
  entry.hiddenAt = null

  // Stop the hidden-buffer PTY listener (buffer data is kept for flushing)
  const unsub = hiddenUnsubs.get(sessionId)
  if (unsub) {
    unsub()
    hiddenUnsubs.delete(sessionId)
  }

  // Cancel WebGL disposal timer
  const timer = disposeTimers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    disposeTimers.delete(sessionId)
  }
}

export function reattachTerminal(
  sessionId: string,
  container: HTMLDivElement
): Terminal | null {
  const entry = registry.get(sessionId)
  if (!entry) return null

  // Always dispose existing WebGL addon before re-opening —
  // terminal.open() creates new DOM/canvas elements, making
  // the old WebGL context stale.
  if (entry.webglAddon) {
    try {
      entry.webglAddon.dispose()
    } catch {
      // already disposed
    }
    entry.webglAddon = null
  }

  // Re-open terminal into new container
  entry.terminal.open(container)

  // Re-create WebGL addon (requires canvas context from open())
  try {
    const webglAddon = new WebglAddon()
    webglAddon.onContextLoss(() => {
      webglAddon.dispose()
      const current = registry.get(sessionId)
      if (current) current.webglAddon = null
    })
    entry.terminal.loadAddon(webglAddon)
    entry.webglAddon = webglAddon
  } catch {
    // WebGL not available — xterm uses canvas renderer
  }

  markVisible(sessionId)
  return entry.terminal
}

/**
 * Flush any PTY data that was buffered while the terminal was off-screen.
 * Must be called after reattach and before the usePty listener starts,
 * so the terminal shows data that arrived during the hidden period.
 */
export function flushHiddenBuffer(sessionId: string, terminal: Terminal): void {
  const buffer = hiddenBuffers.get(sessionId)
  if (buffer && buffer.length > 0) {
    terminal.write(buffer.join(''))
  }
  hiddenBuffers.delete(sessionId)
}

export function getRegistrySize(): number {
  return registry.size
}
