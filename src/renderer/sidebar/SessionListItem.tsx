import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '../stores/sessionStore'
import { sessionStore } from '../stores/sessionStore'

interface SessionListItemProps {
  session: Session
  isFocused: boolean
  isHighlighted: boolean
  isInBroadcastGroup?: boolean
  isRenaming?: boolean
  onPanTo: (sessionId: string) => void
  onContextMenu: (sessionId: string, x: number, y: number) => void
  onStartRename?: (sessionId: string) => void
  onFinishRename?: () => void
}

function shortenPath(path: string): string {
  const home = '~'
  const parts = path.replace(/^\/Users\/[^/]+/, home).split('/')
  if (parts.length <= 3) return parts.join('/')
  return parts[0] + '/.../' + parts[parts.length - 1]
}

function SessionListItem({ session, isFocused, isHighlighted, isInBroadcastGroup, isRenaming, onPanTo, onContextMenu, onStartRename, onFinishRename }: SessionListItemProps): JSX.Element {
  const isExited = session.type === 'terminal' && session.status === 'exited'
  const [editValue, setEditValue] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      setEditValue(session.title)
      // Focus after render
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [isRenaming, session.title])

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== session.title) {
      sessionStore.getState().updateSession(session.id, { title: trimmed })
    }
    onFinishRename?.()
  }, [editValue, session.id, session.title, onFinishRename])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onFinishRename?.()
    }
  }, [commitRename, onFinishRename])

  const handleMouseEnter = useCallback(() => {
    sessionStore.getState().highlightSession(session.id)
  }, [session.id])

  const handleMouseLeave = useCallback(() => {
    sessionStore.getState().highlightSession(null)
  }, [])

  const handleClick = useCallback(() => {
    if (!isRenaming) onPanTo(session.id)
  }, [session.id, onPanTo, isRenaming])

  const handleDoubleClick = useCallback(() => {
    onStartRename?.(session.id)
  }, [session.id, onStartRename])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onContextMenu(session.id, e.clientX, e.clientY)
  }, [session.id, onContextMenu])

  let className = 'session-list-item'
  if (isFocused) className += ' focused'
  if (isHighlighted) className += ' highlighted'
  if (isExited) className += ' exited'
  if (isInBroadcastGroup) className += ' broadcasting'

  return (
    <div
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <span className={`status-dot ${session.type === 'file' ? 'file' : session.type === 'note' ? 'note' : session.type === 'webview' ? 'webview' : session.type === 'image' ? 'image' : session.type === 'snippet' ? 'snippet' : isExited ? 'exited' : 'running'}`} />
      <div className="session-info">
        {isRenaming ? (
          <input
            ref={inputRef}
            className="session-title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKeyDown}
          />
        ) : (
          <span className="session-title" onDoubleClick={handleDoubleClick}>{session.title}</span>
        )}
        {session.type === 'terminal' && (
          <span className="session-cwd">{shortenPath(session.cwd)}</span>
        )}
        {session.type === 'file' && (
          <span className="session-cwd">{shortenPath(session.filePath)}</span>
        )}
        {session.type === 'note' && session.content && (
          <span className="session-cwd">{session.content.slice(0, 40)}</span>
        )}
        {session.type === 'webview' && (
          <span className="session-cwd">{session.url}</span>
        )}
        {session.type === 'image' && (
          <span className="session-cwd">{shortenPath(session.filePath)}</span>
        )}
        {session.type === 'snippet' && (
          <span className="session-cwd">{session.language}</span>
        )}
      </div>
    </div>
  )
}

export default memo(SessionListItem)
