import { useCallback, useMemo, useRef, useState } from 'react'
import { useSessionList, useFocusedId, useHighlightedId, useBroadcastGroupId, findFileSessionByPath, sessionStore } from '../stores/sessionStore'
import type { Session } from '../stores/sessionStore'
import { useGroupList } from '../stores/groupStore'
import { createNewSession } from '../session/useSessionCreation'
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
import { performAutoLayout } from '../layout/autoLayout'
import FileTree from './FileTree'
import { taskInputStore } from '../assembly/taskInputStore'
import ShellSelector from './ShellSelector'
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
  const [shellSelectorOpen, setShellSelectorOpen] = useState(false)
  const newBtnRef = useRef<HTMLButtonElement>(null)

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

  const handleNewSession = useCallback(() => {
    createNewSession()
  }, [])

  const handleNewNote = useCallback(() => {
    const session = sessionStore.getState().createNoteSession()
    sessionStore.getState().focusSession(session.id)
  }, [])

  const handleNewWebview = useCallback(() => {
    const session = sessionStore.getState().createWebviewSession()
    sessionStore.getState().focusSession(session.id)
  }, [])

  const handleNewSnippet = useCallback(() => {
    const session = sessionStore.getState().createSnippetSession()
    sessionStore.getState().focusSession(session.id)
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

  const handleAutoLayout = useCallback(() => {
    performAutoLayout()
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
          <button className="sidebar-settings-btn" onClick={handleOpenShortcuts} title="Keyboard Shortcuts (⌘/)">
            ?
          </button>
          <button className="sidebar-settings-btn" onClick={handleOpenSettings} title="Settings (⌘,)">
            &#9881;
          </button>
        </div>
      </div>
      <div className="sidebar-actions">
        <span className="sidebar-new-btn-group">
          <button className="sidebar-new-btn" onClick={handleNewSession} title="New terminal session">
            + New
          </button>
          <button
            ref={newBtnRef}
            className="sidebar-new-btn sidebar-shell-dropdown-btn"
            onClick={() => setShellSelectorOpen((v) => !v)}
            title="Choose shell for new terminal"
          >
            &#9662;
          </button>
        </span>
        {shellSelectorOpen && (
          <ShellSelector
            buttonRef={newBtnRef}
            onSelect={(shell) => createNewSession(undefined, shell)}
            onClose={() => setShellSelectorOpen(false)}
          />
        )}
        <button className="sidebar-new-btn" onClick={handleNewNote} title="New note">
          + Note
        </button>
        <button className="sidebar-new-btn" onClick={handleNewWebview} title="New web browser">
          + Web
        </button>
        <button className="sidebar-new-btn" onClick={handleNewSnippet} title="New code snippet">
          + Snippet
        </button>
        <button className="sidebar-new-btn" onClick={handleAutoLayout} title="Auto Layout">
          Layout
        </button>
        <button className="sidebar-new-btn sidebar-assemble-btn" onClick={() => taskInputStore.getState().open()} title="Assemble Workspace (⌘⇧A)">
          Assemble
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
