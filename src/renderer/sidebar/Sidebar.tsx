import { useCallback, useMemo } from 'react'
import { useSessionList, useFocusedId, useHighlightedId, useBroadcastGroupId, findFileSessionByPath, sessionStore } from '../stores/sessionStore'
import type { Session } from '../stores/sessionStore'
import { useGroupList } from '../stores/groupStore'
import { createNewSession } from '../session/useSessionCreation'
import { createFileViewerSession } from '../fileviewer/useFileViewerCreation'
import SessionListItem from './SessionListItem'
import GroupHeader from './GroupHeader'
import { usePanToSession, panToSession as panToSessionStandalone } from './useSidebarSync'
import LayoutPanel from '../layout/LayoutPanel'
import ConfigPanel from '../config/ConfigPanel'
import ReplayPanel from '../replay/ReplayPanel'
import FileTree from './FileTree'
import '../styles/sidebar.css'

export default function Sidebar(): JSX.Element {
  const sessions = useSessionList()
  const groups = useGroupList()
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const broadcastGroupId = useBroadcastGroupId()
  const panToSession = usePanToSession()

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => a.createdAt - b.createdAt),
    [sessions]
  )

  // Build a set of all grouped session IDs and map groupId -> sessions
  const { groupedSessions, ungrouped } = useMemo(() => {
    const memberSet = new Set<string>()
    const groupSessionMap = new Map<string, Session[]>()

    for (const group of groups) {
      const members: Session[] = []
      for (const memberId of group.memberIds) {
        const session = sortedSessions.find((s) => s.id === memberId)
        if (session) {
          members.push(session)
          memberSet.add(memberId)
        }
      }
      if (members.length > 0) {
        groupSessionMap.set(group.id, members)
      }
    }

    const ungroupedList = sortedSessions.filter((s) => !memberSet.has(s.id))
    return { groupedSessions: groupSessionMap, ungrouped: ungroupedList }
  }, [sortedSessions, groups])

  const handleNewSession = useCallback(() => {
    createNewSession()
  }, [])

  const handleNewNote = useCallback(() => {
    const session = sessionStore.getState().createNoteSession()
    sessionStore.getState().focusSession(session.id)
  }, [])

  const handleFileOpen = useCallback((filePath: string) => {
    const existing = findFileSessionByPath(filePath)
    if (existing) {
      panToSessionStandalone(existing.id)
    } else {
      createFileViewerSession(filePath)
    }
  }, [])

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Sessions</span>
        <button className="sidebar-new-btn" onClick={handleNewNote}>
          + Note
        </button>
        <button className="sidebar-new-btn" onClick={handleNewSession}>
          + New
        </button>
      </div>
      <div className="session-list">
        {groups.map((group) => {
          const groupSessions = groupedSessions.get(group.id)
          if (!groupSessions || groupSessions.length === 0) return null
          return (
            <div key={group.id} className="session-group">
              <GroupHeader groupId={group.id} groupName={group.name} sessionCount={groupSessions.length} />
              {groupSessions.map((session) => (
                <SessionListItem
                  key={session.id}
                  session={session}
                  isFocused={focusedId === session.id}
                  isHighlighted={highlightedId === session.id}
                  isInBroadcastGroup={broadcastGroupId === group.id}
                  onPanTo={panToSession}
                />
              ))}
            </div>
          )
        })}
        {ungrouped.map((session) => (
          <SessionListItem
            key={session.id}
            session={session}
            isFocused={focusedId === session.id}
            isHighlighted={highlightedId === session.id}
            isInBroadcastGroup={false}
            onPanTo={panToSession}
          />
        ))}
      </div>
      <FileTree onFileOpen={handleFileOpen} />
      <LayoutPanel />
      <ReplayPanel />
      <ConfigPanel />
    </div>
  )
}
