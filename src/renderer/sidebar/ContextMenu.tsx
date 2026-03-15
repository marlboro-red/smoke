import { useEffect, useRef } from 'react'
import { getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import { sessionStore } from '../stores/sessionStore'

export interface ContextMenuState {
  sessionId: string
  x: number
  y: number
}

interface ContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onCloseSession: (sessionId: string) => void
  onRenameSession: (sessionId: string) => void
}

export default function ContextMenu({ state, onClose, onCloseSession, onRenameSession }: ContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${state.y - rect.height}px`
    }
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${state.x - rect.width}px`
    }
  }, [state.x, state.y])

  return (
    <div
      ref={menuRef}
      className="sidebar-context-menu"
      style={{ top: state.y, left: state.x }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          onRenameSession(state.sessionId)
          onClose()
        }}
      >
        Rename
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          sessionStore.getState().toggleLock(state.sessionId)
          onClose()
        }}
      >
        {sessionStore.getState().sessions.get(state.sessionId)?.locked ? 'Unlock Position' : 'Lock Position'}
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          const session = sessionStore.getState().sessions.get(state.sessionId)
          if (session?.type !== 'terminal') return
          const current = session.startupCommand || ''
          const cmd = prompt('Startup command for this terminal:', current)
          if (cmd !== null) {
            sessionStore.getState().updateSession(state.sessionId, { startupCommand: cmd || undefined })
          }
          onClose()
        }}
      >
        Set Startup Command
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          const session = sessionStore.getState().sessions.get(state.sessionId)
          if (session) {
            if (!session.isPinned) {
              const pan = getCurrentPan()
              const z = getCurrentZoom()
              sessionStore.getState().togglePin(state.sessionId, {
                x: session.position.x * z + pan.x,
                y: session.position.y * z + pan.y,
              })
            } else {
              sessionStore.getState().togglePin(state.sessionId)
            }
          }
          onClose()
        }}
      >
        {(() => {
          const session = sessionStore.getState().sessions.get(state.sessionId)
          return session?.isPinned ? 'Unpin from Viewport' : 'Pin to Viewport'
        })()}
      </button>
      <button
        className="context-menu-item destructive"
        onClick={() => {
          onCloseSession(state.sessionId)
          onClose()
        }}
      >
        Close
      </button>
    </div>
  )
}
