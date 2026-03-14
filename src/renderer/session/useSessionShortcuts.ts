import { useEffect } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { createNewSession } from './useSessionCreation'
import { closeSession } from './useSessionClose'

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

export function useSessionShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey

      if (mod && e.key === 'n') {
        e.preventDefault()
        createNewSession()
        return
      }

      if (mod && e.key === 'w') {
        e.preventDefault()
        const focusedId = sessionStore.getState().focusedId
        if (focusedId) {
          closeSession(focusedId)
        }
        return
      }
    }

    // Use capture phase to intercept before xterm.js
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [])
}
