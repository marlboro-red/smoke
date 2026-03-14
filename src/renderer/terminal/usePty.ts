import { useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import { sessionStore } from '../stores/sessionStore'

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
    })

    // PTY exit -> display message + update session status
    const unsubExit = window.smokeAPI.pty.onExit((event) => {
      if (event.id !== sessionId) return

      const terminal = terminalRef.current
      if (terminal) {
        terminal.write(`\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`)
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
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal || !window.smokeAPI) return

    const onDataDisposable = terminal.onData((data) => {
      window.smokeAPI.pty.write(sessionId, data)
    })

    return () => {
      onDataDisposable.dispose()
    }
  }, [sessionId, terminalRef])
}
