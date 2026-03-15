import { memo, useCallback } from 'react'
import type { Session } from '../stores/sessionStore'
import { sessionStore } from '../stores/sessionStore'

interface SessionListItemProps {
  session: Session
  isFocused: boolean
  isHighlighted: boolean
  isInBroadcastGroup?: boolean
  onPanTo: (sessionId: string) => void
  onContextMenu: (sessionId: string, x: number, y: number) => void
}

function shortenPath(path: string): string {
  const home = '~'
  const parts = path.replace(/^\/Users\/[^/]+/, home).split('/')
  if (parts.length <= 3) return parts.join('/')
  return parts[0] + '/.../' + parts[parts.length - 1]
}

function SessionListItem({ session, isFocused, isHighlighted, isInBroadcastGroup, onPanTo, onContextMenu }: SessionListItemProps): JSX.Element {
  const isExited = session.type === 'terminal' && session.status === 'exited'

  const handleMouseEnter = useCallback(() => {
    sessionStore.getState().highlightSession(session.id)
  }, [session.id])

  const handleMouseLeave = useCallback(() => {
    sessionStore.getState().highlightSession(null)
  }, [])

  const handleClick = useCallback(() => {
    onPanTo(session.id)
  }, [session.id, onPanTo])

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
      <span className={`status-dot ${session.type === 'file' ? 'file' : session.type === 'note' ? 'note' : isExited ? 'exited' : 'running'}`} />
      <div className="session-info">
        <span className="session-title">{session.title}</span>
        {session.type === 'terminal' && (
          <span className="session-cwd">{shortenPath(session.cwd)}</span>
        )}
        {session.type === 'file' && (
          <span className="session-cwd">{shortenPath(session.filePath)}</span>
        )}
        {session.type === 'note' && session.content && (
          <span className="session-cwd">{session.content.slice(0, 40)}</span>
        )}
      </div>
    </div>
  )
}

export default memo(SessionListItem)
