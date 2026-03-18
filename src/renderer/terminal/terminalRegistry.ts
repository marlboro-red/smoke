import { Terminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { activityStore } from '../stores/activityStore'
import { disposeSearchAddon } from './terminalSearchStore'

interface TerminalEntry {
  terminal: Terminal
  webglAddon: WebglAddon | null
  hiddenAt: number | null
  charDims: { width: number; height: number }
}

const WEBGL_DISPOSE_TIMEOUT = 60_000
const HIDDEN_BUFFER_MAX_CHARS = 5 * 1024 * 1024 // ~5MB cap per session

interface HiddenBuffer {
  chunks: string[]
  totalChars: number
}

const registry = new Map<string, TerminalEntry>()
const disposeTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Buffers for PTY data arriving while terminals are off-screen
const hiddenBuffers = new Map<string, HiddenBuffer>()
const hiddenUnsubs = new Map<string, () => void>()

function appendToHiddenBuffer(buf: HiddenBuffer, data: string): void {
  buf.chunks.push(data)
  buf.totalChars += data.length

  // Evict oldest chunks until within capacity
  while (buf.totalChars > HIDDEN_BUFFER_MAX_CHARS && buf.chunks.length > 1) {
    const oldest = buf.chunks.shift()!
    buf.totalChars -= oldest.length
  }

  // If a single chunk still exceeds the cap, truncate from the front
  if (buf.totalChars > HIDDEN_BUFFER_MAX_CHARS && buf.chunks.length === 1) {
    const excess = buf.totalChars - HIDDEN_BUFFER_MAX_CHARS
    buf.chunks[0] = buf.chunks[0].slice(excess)
    buf.totalChars = HIDDEN_BUFFER_MAX_CHARS
  }
}

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
    disposeSearchAddon(sessionId)
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
  activityStore.getState().clearActive(sessionId)
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

  // Idempotency: already hidden — avoid duplicate listeners/timers
  if (entry.hiddenAt !== null) return

  entry.hiddenAt = Date.now()

  // Start buffering PTY data while the terminal is off-screen.
  // The component's usePty listener gets torn down on unmount, so without
  // this buffer any data from active processes would be lost.
  if (window.smokeAPI?.pty?.onData) {
    // Defensive: clean up any stale listener before registering a new one
    const existingUnsub = hiddenUnsubs.get(sessionId)
    if (existingUnsub) {
      existingUnsub()
      hiddenUnsubs.delete(sessionId)
    }

    const buffer: HiddenBuffer = { chunks: [], totalChars: 0 }
    hiddenBuffers.set(sessionId, buffer)
    const unsub = window.smokeAPI.pty.onData((event) => {
      if (event.id === sessionId) {
        // Staleness guard: if this listener was orphaned (unsub removed
        // from map but IPC removal was delayed), skip the write.
        if (!hiddenUnsubs.has(sessionId)) return
        appendToHiddenBuffer(buffer, event.data)
        activityStore.getState().markActive(sessionId)
      }
    })
    hiddenUnsubs.set(sessionId, unsub)
  }

  // Schedule WebGL addon disposal after 60s off-screen
  if (entry.webglAddon) {
    // Clear any existing timer to prevent orphaned timers
    const existingTimer = disposeTimers.get(sessionId)
    if (existingTimer) clearTimeout(existingTimer)

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

  // Idempotency: already visible — nothing to clean up
  if (entry.hiddenAt === null) return

  entry.hiddenAt = null

  // Clear activity indicator — the user can now see this terminal
  activityStore.getState().clearActive(sessionId)

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

  // Always dispose existing WebGL addon before moving —
  // WebGL contexts can't survive DOM reparenting.
  if (entry.webglAddon) {
    try {
      entry.webglAddon.dispose()
    } catch {
      // already disposed
    }
    entry.webglAddon = null
  }

  // Move the terminal element to the new container.
  // xterm.js 5.x's open() early-returns when the terminal was already
  // opened (even if the element is detached from the DOM), so calling
  // open() again would leave the new container empty.
  if (entry.terminal.element) {
    container.appendChild(entry.terminal.element)
  } else {
    entry.terminal.open(container)
  }

  // Re-create WebGL addon
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
  if (buffer && buffer.chunks.length > 0) {
    terminal.write(buffer.chunks.join(''))
  }
  hiddenBuffers.delete(sessionId)
}

export function getRegistrySize(): number {
  return registry.size
}

export function getAllTerminals(): TerminalEntry[] {
  return Array.from(registry.values())
}
