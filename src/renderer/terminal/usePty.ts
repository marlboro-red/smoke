import { useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import { sessionStore, getGroupSessionIds } from '../stores/sessionStore'
import { addToast } from '../stores/toastStore'

export function usePty(
  sessionId: string,
  terminalRef: React.MutableRefObject<Terminal | null>
): void {
  // Set up PTY data listener immediately — before terminal is ready.
  // Buffer any data that arrives before the terminal is attached,
  // then flush when terminal becomes available.
  useEffect(() => {
    if (!window.smokeAPI) return

    const pendingData: string[] = []

    // PTY output -> terminal: buffer if terminal not ready yet
    const unsubData = window.smokeAPI.pty.onData((event) => {
      if (event.id !== sessionId) return

      const terminal = terminalRef.current
      if (terminal) {
        // Flush any buffered data first
        if (pendingData.length > 0) {
          terminal.write(pendingData.join(''))
          pendingData.length = 0
        }
        terminal.write(event.data)
      } else {
        pendingData.push(event.data)
      }

      // Acknowledge receipt so the main process can manage backpressure
      window.smokeAPI.pty.ack(event.id)
    })

    // PTY exit -> display message + update session status
    const unsubExit = window.smokeAPI.pty.onExit((event) => {
      if (event.id !== sessionId) return

      // Skip exit message and toast for user-initiated closes (X button, Cmd+W)
      if (!event.userInitiated) {
        const terminal = terminalRef.current
        if (terminal) {
          terminal.write(`\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`)
        }

        const session = sessionStore.getState().sessions.get(sessionId)
        const label = session?.title || sessionId
        if (event.exitCode === 0) {
          addToast(`"${label}" exited successfully`, 'success')
        } else {
          addToast(`"${label}" exited with code ${event.exitCode}`, 'error')
        }
      }

      sessionStore.getState().updateSession(sessionId, {
        status: 'exited',
        exitCode: event.exitCode,
      })
    })

    return () => {
      unsubData()
      unsubExit()
    }
  }, [sessionId, terminalRef])

  // Terminal input -> PTY: requires terminal to exist
  // When broadcast mode is active, also writes to all other group members
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal || !window.smokeAPI) return

    const onDataDisposable = terminal.onData((data) => {
      window.smokeAPI.pty.write(sessionId, data)

      // Broadcast to group members if broadcast mode is active
      const state = sessionStore.getState()
      const session = state.sessions.get(sessionId)
      if (
        session?.type === 'terminal' &&
        session.groupId &&
        state.broadcastGroupId === session.groupId
      ) {
        const groupIds = getGroupSessionIds(session.groupId)
        for (const id of groupIds) {
          if (id !== sessionId) {
            window.smokeAPI.pty.write(id, data)
          }
        }
      }
    })

    return () => {
      onDataDisposable.dispose()
    }
  }, [sessionId, terminalRef])
}

/**
 * Write data to all terminals in a broadcast group.
 * Used by the broadcast input in the sidebar group header.
 */
export function broadcastToGroup(groupId: string, data: string): void {
  const groupIds = getGroupSessionIds(groupId)
  for (const id of groupIds) {
    window.smokeAPI.pty.write(id, data)
  }
}
