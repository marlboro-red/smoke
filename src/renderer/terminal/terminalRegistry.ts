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
}

export function markHidden(sessionId: string): void {
  const entry = registry.get(sessionId)
  if (!entry) return
  entry.hiddenAt = Date.now()

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

  // Re-open terminal into new container
  entry.terminal.open(container)

  // Re-create WebGL addon if it was disposed
  if (!entry.webglAddon) {
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
      // WebGL not available
    }
  }

  markVisible(sessionId)
  return entry.terminal
}

export function getRegistrySize(): number {
  return registry.size
}
