import { useCallback, useMemo } from 'react'
import { useSessionList, useFocusedId, useHighlightedId } from '../stores/sessionStore'
import { createNewSession } from '../session/useSessionCreation'
import SessionListItem from './SessionListItem'
import { usePanToSession } from './useSidebarSync'
import LayoutPanel from '../layout/LayoutPanel'
import ConfigPanel from '../config/ConfigPanel'
import FileTree from './FileTree'
import '../styles/sidebar.css'

export default function Sidebar(): JSX.Element {
  const sessions = useSessionList()
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const panToSession = usePanToSession()

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => a.createdAt - b.createdAt),
    [sessions]
  )

  const handleNewSession = useCallback(() => {
    createNewSession()
  }, [])

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Sessions</span>
        <button className="sidebar-new-btn" onClick={handleNewSession}>
          + New
        </button>
      </div>
      <div className="session-list">
        {sortedSessions.map((session) => (
          <SessionListItem
            key={session.id}
            session={session}
            isFocused={focusedId === session.id}
            isHighlighted={highlightedId === session.id}
            onPanTo={panToSession}
          />
        ))}
      </div>
      <FileTree />
      <LayoutPanel />
      <ConfigPanel />
    </div>
  )
}
