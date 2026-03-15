import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { useSessionList, useFocusedId, useHighlightedId, useBroadcastGroupId, findFileSessionByPath, sessionStore } from '../stores/sessionStore'
import type { Session } from '../stores/sessionStore'
import { useGroupList } from '../stores/groupStore'
import { createNewSession } from '../session/useSessionCreation'
import { createFileViewerSession } from '../fileviewer/useFileViewerCreation'
import SessionListItem from './SessionListItem'
import ContextMenu from './ContextMenu'
import type { ContextMenuState } from './ContextMenu'
import GroupHeader from './GroupHeader'
import { closeSession } from '../session/useSessionClose'
import { usePanToSession, panToSession as panToSessionStandalone } from './useSidebarSync'
import LayoutPanel from '../layout/LayoutPanel'
import ReplayPanel from '../replay/ReplayPanel'
import { settingsModalStore } from '../config/settingsStore'
import { performAutoLayout } from '../layout/autoLayout'
import FileTree from './FileTree'
import { usePreference } from '../stores/preferencesStore'
import { preferencesStore } from '../stores/preferencesStore'
import { useSectionResize } from './useSectionResize'
import type { SidebarSectionSizes } from '../../preload/types'
import '../styles/sidebar.css'
import '../styles/settings-modal.css'

const DEFAULT_SECTION_SIZES: Required<SidebarSectionSizes> = {
  fileTree: 200,
  layouts: 120,
  recordings: 120,
}

export default function Sidebar(): JSX.Element {
  const sessions = useSessionList()
  const groups = useGroupList()
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const broadcastGroupId = useBroadcastGroupId()
  const panToSession = usePanToSession()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const storedSizes = usePreference('sidebarSectionSizes')

  const fileTreeRef = useRef<HTMLDivElement>(null)
  const layoutsRef = useRef<HTMLDivElement>(null)
  const recordingsRef = useRef<HTMLDivElement>(null)

  const sectionRefs = useMemo(() => ({
    fileTree: fileTreeRef,
    layouts: layoutsRef,
    recordings: recordingsRef,
  }), [])

  const handleSizesChange = useCallback(async (sizes: SidebarSectionSizes) => {
    preferencesStore.getState().updatePreference('sidebarSectionSizes', sizes)
    await window.smokeAPI?.config.set('sidebarSectionSizes', sizes)
  }, [])

  const { handleDividerMouseDown } = useSectionResize(sectionRefs, handleSizesChange)

  // Apply stored sizes on mount and when they change
  useEffect(() => {
    const sizes = storedSizes || {}
    for (const key of ['fileTree', 'layouts', 'recordings'] as const) {
      const el = sectionRefs[key]?.current
      if (el) {
        const height = sizes[key] ?? DEFAULT_SECTION_SIZES[key]
        el.style.height = `${height}px`
        el.style.flex = 'none'
      }
    }
  }, [storedSizes, sectionRefs])

  const handleContextMenu = useCallback((sessionId: string, x: number, y: number) => {
    setContextMenu({ sessionId, x, y })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleCloseSession = useCallback((sessionId: string) => {
    closeSession(sessionId)
  }, [])

  const handleStartRename = useCallback((sessionId: string) => {
    setRenamingId(sessionId)
  }, [])

  const handleFinishRename = useCallback(() => {
    setRenamingId(null)
  }, [])

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

  const handleAutoLayout = useCallback(() => {
    performAutoLayout()
  }, [])

  const handleOpenSettings = useCallback(() => {
    settingsModalStore.getState().open()
  }, [])

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Sessions</span>
        <button className="sidebar-settings-btn" onClick={handleOpenSettings} title="Settings (⌘,)">
          &#9881;
        </button>
      </div>
      <div className="sidebar-actions">
        <button className="sidebar-new-btn" onClick={handleNewSession}>
          + New
        </button>
        <button className="sidebar-new-btn" onClick={handleNewNote}>
          + Note
        </button>
        <button className="sidebar-new-btn" onClick={handleAutoLayout} title="Auto Layout (⌘⇧A)">
          Layout
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
                  isRenaming={renamingId === session.id}
                  onPanTo={panToSession}
                  onContextMenu={handleContextMenu}
                  onStartRename={handleStartRename}
                  onFinishRename={handleFinishRename}
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
            isRenaming={renamingId === session.id}
            onPanTo={panToSession}
            onContextMenu={handleContextMenu}
            onStartRename={handleStartRename}
            onFinishRename={handleFinishRename}
          />
        ))}
      </div>
      <div
        className="sidebar-section-divider"
        onMouseDown={(e) => handleDividerMouseDown(e, 'sessions', 'fileTree')}
      />
      <div ref={fileTreeRef} className="sidebar-section">
        <FileTree onFileOpen={handleFileOpen} />
      </div>
      <div
        className="sidebar-section-divider"
        onMouseDown={(e) => handleDividerMouseDown(e, 'fileTree', 'layouts')}
      />
      <div ref={layoutsRef} className="sidebar-section">
        <LayoutPanel />
      </div>
      <div
        className="sidebar-section-divider"
        onMouseDown={(e) => handleDividerMouseDown(e, 'layouts', 'recordings')}
      />
      <div ref={recordingsRef} className="sidebar-section">
        <ReplayPanel />
      </div>
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={handleCloseContextMenu}
          onCloseSession={handleCloseSession}
          onRenameSession={handleStartRename}
        />
      )}
    </div>
  )
}
