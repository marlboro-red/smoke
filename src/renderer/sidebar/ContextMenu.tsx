import { useEffect, useRef, useState } from 'react'
import { getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import { sessionStore } from '../stores/sessionStore'
import type { ShellInfo } from '../../preload/types'

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
  const [shellSubmenuOpen, setShellSubmenuOpen] = useState(false)
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [shellsLoaded, setShellsLoaded] = useState(false)

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
        title="Rename this session"
      >
        Rename
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          sessionStore.getState().toggleLock(state.sessionId)
          onClose()
        }}
        title="Prevent or allow moving this window"
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
        title="Command to run automatically when this terminal starts"
      >
        Set Startup Command
      </button>
      <div
        className="context-menu-item context-menu-submenu-trigger"
        onMouseEnter={() => {
          setShellSubmenuOpen(true)
          if (!shellsLoaded) {
            window.smokeAPI?.shell.list().then((list) => {
              setShells(list)
              setShellsLoaded(true)
            }).catch(() => setShellsLoaded(true))
          }
        }}
        onMouseLeave={() => setShellSubmenuOpen(false)}
        title="Change the shell used by this terminal (requires restart)"
      >
        Change Shell &#9656;
        {shellSubmenuOpen && (
          <div className="context-submenu">
            <button
              className="context-menu-item"
              onClick={() => {
                sessionStore.getState().updateSession(state.sessionId, { shell: undefined })
                onClose()
              }}
            >
              Default Shell
            </button>
            {shells.map((shell) => (
              <button
                key={shell.path}
                className="context-menu-item"
                onClick={() => {
                  sessionStore.getState().updateSession(state.sessionId, { shell: shell.path })
                  onClose()
                }}
                title={shell.path}
              >
                {shell.name}
              </button>
            ))}
            {!shellsLoaded && (
              <div className="context-menu-item disabled">Loading...</div>
            )}
          </div>
        )}
      </div>
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
        title="Keep this window fixed on screen while panning"
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
        title="Close this session"
      >
        Close
      </button>
    </div>
  )
}
