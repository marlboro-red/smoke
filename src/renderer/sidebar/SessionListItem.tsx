import { memo, useCallback } from 'react'
import type { Session } from '../stores/sessionStore'
import { sessionStore } from '../stores/sessionStore'

interface SessionListItemProps {
  session: Session
  isFocused: boolean
  isHighlighted: boolean
  onPanTo: (sessionId: string) => void
}

function shortenCwd(cwd: string): string {
  const home = '~'
  const parts = cwd.replace(/^\/Users\/[^/]+/, home).split('/')
  if (parts.length <= 3) return parts.join('/')
  return parts[0] + '/.../' + parts[parts.length - 1]
}

function SessionListItem({ session, isFocused, isHighlighted, onPanTo }: SessionListItemProps): JSX.Element {
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

  let className = 'session-list-item'
  if (isFocused) className += ' focused'
  if (isHighlighted) className += ' highlighted'
  if (isExited) className += ' exited'

  return (
    <div
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <span className={`status-dot ${isExited ? 'exited' : 'running'}`} />
      <div className="session-info">
        <span className="session-title">{session.title}</span>
        {session.type === 'terminal' && (
          <span className="session-cwd">{shortenCwd(session.cwd)}</span>
        )}
      </div>
    </div>
  )
}

export default memo(SessionListItem)
