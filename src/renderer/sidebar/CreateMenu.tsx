import { useCallback, useEffect, useRef, useState } from 'react'
import { createNewSession } from '../session/useSessionCreation'
import { sessionStore } from '../stores/sessionStore'
import { performAutoLayout } from '../layout/autoLayout'
import { taskInputStore } from '../assembly/taskInputStore'
import ShellSelector from './ShellSelector'

interface CreateMenuProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}

export default function CreateMenu({ anchorRef, onClose }: CreateMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [shellSelectorOpen, setShellSelectorOpen] = useState(false)
  const shellBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [anchorRef, onClose])

  const handleNewTerminal = useCallback(() => {
    createNewSession()
    onClose()
  }, [onClose])

  const handleNewNote = useCallback(() => {
    const session = sessionStore.getState().createNoteSession()
    sessionStore.getState().focusSession(session.id)
    onClose()
  }, [onClose])

  const handleNewWebview = useCallback(() => {
    const session = sessionStore.getState().createWebviewSession()
    sessionStore.getState().focusSession(session.id)
    onClose()
  }, [onClose])

  const handleNewSnippet = useCallback(() => {
    const session = sessionStore.getState().createSnippetSession()
    sessionStore.getState().focusSession(session.id)
    onClose()
  }, [onClose])

  const handleAutoLayout = useCallback(() => {
    performAutoLayout()
    onClose()
  }, [onClose])

  const handleAssemble = useCallback(() => {
    taskInputStore.getState().open()
    onClose()
  }, [onClose])

  // Position below the anchor button
  const rect = anchorRef.current?.getBoundingClientRect()
  const style: React.CSSProperties = rect
    ? { top: rect.bottom + 4, left: rect.left, position: 'fixed' }
    : { top: 0, left: 0, position: 'fixed' }

  return (
    <div className="create-menu" ref={menuRef} style={style}>
      <div className="create-menu-section">
        <div className="create-menu-section-label">Create</div>
        <button className="create-menu-item" onClick={handleNewTerminal}>
          <span className="create-menu-icon">&#9654;</span>
          <span className="create-menu-label">Terminal</span>
          <button
            ref={shellBtnRef}
            className="create-menu-shell-btn"
            onClick={(e) => { e.stopPropagation(); setShellSelectorOpen((v) => !v) }}
            title="Choose shell"
          >
            &#9662;
          </button>
        </button>
        {shellSelectorOpen && (
          <ShellSelector
            buttonRef={shellBtnRef}
            onSelect={(shell) => { createNewSession(undefined, shell); onClose() }}
            onClose={() => setShellSelectorOpen(false)}
          />
        )}
        <button className="create-menu-item" onClick={handleNewNote}>
          <span className="create-menu-icon">&#9998;</span>
          <span className="create-menu-label">Note</span>
        </button>
        <button className="create-menu-item" onClick={handleNewWebview}>
          <span className="create-menu-icon">&#9741;</span>
          <span className="create-menu-label">Web Browser</span>
        </button>
        <button className="create-menu-item" onClick={handleNewSnippet}>
          <span className="create-menu-icon">&lt;/&gt;</span>
          <span className="create-menu-label">Code Snippet</span>
        </button>
      </div>
      <div className="create-menu-divider" />
      <div className="create-menu-section">
        <button className="create-menu-item" onClick={handleAutoLayout}>
          <span className="create-menu-icon">&#9638;</span>
          <span className="create-menu-label">Auto Layout</span>
        </button>
        <button className="create-menu-item" onClick={handleAssemble}>
          <span className="create-menu-icon">&#9883;</span>
          <span className="create-menu-label">Assemble</span>
          <span className="create-menu-shortcut">&#8984;&#8679;A</span>
        </button>
      </div>
    </div>
  )
}
