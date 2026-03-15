import { sessionStore } from '../stores/sessionStore'
import { snapshotStore } from '../stores/snapshotStore'
import { splitPaneStore, getAllPaneIds } from '../stores/splitPaneStore'
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

  // Non-terminal elements can be cleaned up immediately
  if (session.type !== 'terminal') {
    cleanupSession(sessionId)
    return
  }

  // Clean up all split panes first
  const extraPaneIds = splitPaneStore.getState().cleanupSession(sessionId)
  for (const paneId of extraPaneIds) {
    killPty(paneId)
    unregisterTerminal(paneId)
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

/**
 * Close a single split pane within a terminal window.
 * If it's the last pane, closes the whole session.
 */
export function closeSplitPane(sessionId: string): void {
  const paneStore = splitPaneStore.getState()
  const tree = paneStore.getTree(sessionId)

  if (!tree) {
    // Not split — close the whole session
    closeSession(sessionId)
    return
  }

  const focusedPaneId = paneStore.getFocusedPane(sessionId)
  const { remaining } = paneStore.closePane(sessionId, focusedPaneId)

  // Kill the PTY for the closed pane (unless it's the main session ID)
  if (focusedPaneId !== sessionId) {
    killPty(focusedPaneId)
    unregisterTerminal(focusedPaneId)
  } else if (!remaining) {
    // The main session pane was the last one — close the whole session
    closeSession(sessionId)
    return
  }

  // If no panes remain, close the whole session
  if (!remaining) {
    closeSession(sessionId)
  }
}

function killPty(id: string): void {
  if (window.smokeAPI?.pty?.kill) {
    window.smokeAPI.pty.kill(id)
  }
}

function cleanupSession(sessionId: string): void {
  unregisterTerminal(sessionId)
  sessionStore.getState().removeSession(sessionId)
  snapshotStore.getState().removeSnapshot(sessionId)
  pendingCloses.delete(sessionId)
}
