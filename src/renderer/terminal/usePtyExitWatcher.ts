import { useEffect } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { addToast } from '../stores/toastStore'
import { writeToSession } from './terminalRegistry'

/**
 * App-level PTY exit listener. This must NOT live in the per-widget hook
 * (usePty): widgets unmount under viewport culling / thumbnail mode, and an
 * exit arriving while unmounted would leave the session status stuck on
 * 'running' forever.
 */
export function usePtyExitWatcher(): void {
  useEffect(() => {
    if (!window.smokeAPI) return

    const unsubExit = window.smokeAPI.pty.onExit((event) => {
      // Skip exit message and toast for user-initiated closes (X button, Cmd+W)
      if (!event.userInitiated) {
        writeToSession(
          event.id,
          `\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`
        )

        const session = sessionStore.getState().sessions.get(event.id)
        const label = session?.title || event.id
        if (event.exitCode === 0) {
          addToast(`"${label}" exited successfully`, 'success')
        } else {
          addToast(`"${label}" exited with code ${event.exitCode}`, 'error')
        }
      }

      sessionStore.getState().updateSession(event.id, {
        status: 'exited',
        exitCode: event.exitCode,
      })
    })

    return () => {
      unsubExit()
    }
  }, [])
}
