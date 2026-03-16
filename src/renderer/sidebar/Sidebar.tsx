import { useCallback, useMemo, useRef, useState } from 'react'
import { useSessionList, useFocusedId, useHighlightedId, useBroadcastGroupId, findFileSessionByPath } from '../stores/sessionStore'
import type { Session } from '../stores/sessionStore'
import { useGroupList } from '../stores/groupStore'
import { createFileViewerSession } from '../fileviewer/useFileViewerCreation'
import { isImageFile, openImageOrPanToExisting } from '../image/useImageCreation'
import SessionListItem from './SessionListItem'
import ContextMenu from './ContextMenu'
import type { ContextMenuState } from './ContextMenu'
import GroupHeader from './GroupHeader'
import { closeSession } from '../session/useSessionClose'
import { usePanToSession, panToSession as panToSessionStandalone } from './useSidebarSync'
import LayoutPanel from '../layout/LayoutPanel'
import BookmarkPanel from '../bookmarks/BookmarkPanel'
import ReplayPanel from '../replay/ReplayPanel'
import { settingsModalStore } from '../config/settingsStore'
import { shortcutsOverlayStore } from '../shortcuts/shortcutsOverlayStore'
import FileTree from './FileTree'
import CreateMenu from './CreateMenu'
import { useSectionResize } from './useSectionResize'
import '../styles/sidebar.css'
import '../styles/settings-modal.css'

export default function Sidebar(): JSX.Element {
  const sessions = useSessionList()
  const groups = useGroupList()
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const broadcastGroupId = useBroadcastGroupId()
  const panToSession = usePanToSession()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createBtnRef = useRef<HTMLButtonElement>(null)

  const fileTreeRef = useRef<HTMLDivElement>(null)
  const layoutsRef = useRef<HTMLDivElement>(null)
  const bookmarksRef = useRef<HTMLDivElement>(null)
  const recordingsRef = useRef<HTMLDivElement>(null)

  const sectionRefs = useMemo(() => ({
    fileTree: fileTreeRef,
    layouts: layoutsRef,
    bookmarks: bookmarksRef,
    recordings: recordingsRef,
  }), [])

  const handleSizesChange = useCallback((sizes: Record<string, number | undefined>) => {
    window.smokeAPI?.config.set('sidebarSectionSizes', sizes)
  }, [])

  const { handleDividerMouseDown } = useSectionResize(sectionRefs, handleSizesChange)

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

  const handleToggleCreateMenu = useCallback(() => {
    setCreateMenuOpen((v) => !v)
  }, [])

  const handleCloseCreateMenu = useCallback(() => {
    setCreateMenuOpen(false)
  }, [])

  const handleFileOpen = useCallback((filePath: string) => {
    if (isImageFile(filePath)) {
      openImageOrPanToExisting(filePath)
    } else {
      const existing = findFileSessionByPath(filePath)
      if (existing) {
        panToSessionStandalone(existing.id)
      } else {
        createFileViewerSession(filePath)
      }
    }
  }, [])

  const handleOpenSettings = useCallback(() => {
    settingsModalStore.getState().open()
  }, [])

  const handleOpenShortcuts = useCallback(() => {
    shortcutsOverlayStore.getState().open()
  }, [])

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Sessions</span>
        <div className="sidebar-header-actions">
          <button
            ref={createBtnRef}
            className={`sidebar-icon-btn sidebar-create-btn${createMenuOpen ? ' active' : ''}`}
            onClick={handleToggleCreateMenu}
            title="Create new item"
          >
            +
          </button>
          <button className="sidebar-icon-btn" onClick={handleOpenShortcuts} title="Keyboard Shortcuts (⌘/)">
            ?
          </button>
          <button className="sidebar-icon-btn" onClick={handleOpenSettings} title="Settings (⌘,)">
            &#9881;
          </button>
        </div>
      </div>
      {createMenuOpen && (
        <CreateMenu anchorRef={createBtnRef} onClose={handleCloseCreateMenu} />
      )}
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
      <div className="sidebar-section" ref={fileTreeRef}>
        <FileTree onFileOpen={handleFileOpen} />
      </div>
      <div
        className="sidebar-section-divider"
        onMouseDown={(e) => handleDividerMouseDown(e, 'fileTree', 'layouts')}
      />
      <div className="sidebar-section" ref={layoutsRef}>
        <LayoutPanel />
      </div>
      <div
        className="sidebar-section-divider"
        onMouseDown={(e) => handleDividerMouseDown(e, 'layouts', 'bookmarks')}
      />
      <div className="sidebar-section" ref={bookmarksRef}>
        <BookmarkPanel />
      </div>
      <div
        className="sidebar-section-divider"
        onMouseDown={(e) => handleDividerMouseDown(e, 'bookmarks', 'recordings')}
      />
      <div className="sidebar-section" ref={recordingsRef}>
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
