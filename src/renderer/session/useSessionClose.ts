import { sessionStore } from '../stores/sessionStore'
import { snapshotStore } from '../stores/snapshotStore'
import { unregisterTerminal } from '../terminal/terminalRegistry'

const EXIT_TIMEOUT = 5000

// Tracks pending close operations to prevent double-close
const pendingCloses = new Set<string>()

export function closeSession(sessionId: string): void {
  if (pendingCloses.has(sessionId)) return
  pendingCloses.add(sessionId)

  const session = sessionStore.getState().sessions.get(sessionId)
  if (!session) {
    pendingCloses.delete(sessionId)
    return
  }

  // If already exited, clean up immediately
  if (session.status === 'exited') {
    cleanupSession(sessionId)
    return
  }

  // Kill PTY and wait for onExit confirmation
  if (window.smokeAPI?.pty?.kill) {
    window.smokeAPI.pty.kill(sessionId)
  }

  // Listen for exit event, with timeout fallback
  let unsubExit: (() => void) | null = null
  const timeout = setTimeout(() => {
    // Force-remove after timeout if onExit never fires
    unsubExit?.()
    cleanupSession(sessionId)
  }, EXIT_TIMEOUT)

  unsubExit = window.smokeAPI?.pty.onExit((event) => {
    if (event.id === sessionId) {
      clearTimeout(timeout)
      unsubExit?.()
      cleanupSession(sessionId)
    }
  }) ?? null
}

function cleanupSession(sessionId: string): void {
  unregisterTerminal(sessionId)
  sessionStore.getState().removeSession(sessionId)
  snapshotStore.getState().removeSnapshot(sessionId)
  pendingCloses.delete(sessionId)
}
