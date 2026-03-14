import { useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import { sessionStore } from '../stores/sessionStore'

export function usePty(
  sessionId: string,
  terminalRef: React.MutableRefObject<Terminal | null>
): void {
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal || !window.smokeAPI) return

    // PTY output -> terminal: filter by sessionId
    const unsubData = window.smokeAPI.pty.onData((event) => {
      if (event.id === sessionId) {
        terminal.write(event.data)
      }
    })

    // Terminal input -> PTY
    const onDataDisposable = terminal.onData((data) => {
      window.smokeAPI.pty.write(sessionId, data)
    })

    // PTY exit -> display message + update session status
    const unsubExit = window.smokeAPI.pty.onExit((event) => {
      if (event.id === sessionId) {
        terminal.write(`\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`)
        sessionStore.getState().updateSession(sessionId, {
          status: 'exited',
          exitCode: event.exitCode,
        })
      }
    })

    return () => {
      unsubData()
      onDataDisposable.dispose()
      unsubExit()
    }
  }, [sessionId, terminalRef])
}
