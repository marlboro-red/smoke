import { useCallback } from 'react'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  useSelectedIds,
  type FileViewerSession,
} from '../stores/sessionStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from './useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import { addToast } from '../stores/toastStore'
import { buildDepGraph } from '../depgraph/buildDepGraph'
import { createTerminalAtFileDir } from '../session/useSessionCreation'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import FileViewerWidget from './FileViewerWidget'
import FileEditorWidget from './FileEditorWidget'
import '../styles/fileviewer.css'

interface FileViewerWindowProps {
  session: FileViewerSession
  zoom: () => number
  gridSize: number
  className?: string
}

export default function FileViewerWindow({
  session,
  zoom,
  gridSize,
  className: extraClassName,
}: FileViewerWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const selectedIds = useSelectedIds()
  const editing = session.editing ?? false

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id
  const isSelected = selectedIds.has(session.id)

  const { onDragStart } = useWindowDrag({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const { onResizeStart } = useFileViewerResize({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const isMod = e.metaKey || e.ctrlKey
    if (isMod) {
      e.stopPropagation()
      sessionStore.getState().toggleSelectSession(session.id)
      return
    }
    sessionStore.getState().clearSelection()
    sessionStore.getState().bringToFront(session.id)
    sessionStore.getState().focusSession(session.id)
  }, [session.id])

  const handleTitleChange = useCallback(
    (title: string) => {
      sessionStore.getState().updateSession(session.id, { title })
    },
    [session.id]
  )

  const handleClose = useCallback(() => {
    if (session.isDirty) {
      const action = window.confirm(
        'This file has unsaved changes. Close without saving?'
      )
      if (!action) return
    }
    closeSession(session.id)
  }, [session.id, session.isDirty])

  const handleToggleEdit = useCallback(() => {
    sessionStore.getState().updateSession(session.id, { editing: !editing })
  }, [session.id, editing])

  const handleShowDepGraph = useCallback(() => {
    buildDepGraph(session)
  }, [session])

  const handleOpenTerminal = useCallback(() => {
    createTerminalAtFileDir(session)
  }, [session])

  const handleSave = useCallback(
    async (content: string) => {
      try {
        await window.smokeAPI.fs.writefile(session.filePath, content)
        sessionStore.getState().updateSession(session.id, { content, isDirty: false })
        const fileName = session.filePath.split('/').pop() || session.filePath
        addToast(`Saved "${fileName}"`, 'success')
      } catch (err) {
        addToast(`Failed to save: ${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    },
    [session.id, session.filePath]
  )

  const handleEditorChange = useCallback(
    (content: string) => {
      const isDirty = content !== session.content
      const current = sessionStore.getState().sessions.get(session.id) as FileViewerSession | undefined
      if (current && current.isDirty !== isDirty) {
        sessionStore.getState().updateSession(session.id, { isDirty })
      }
    },
    [session.id, session.content]
  )

  const classNames = [
    'terminal-window',
    'file-viewer-window',
    editing && 'file-viewer-editing',
    session.isDirty && 'file-viewer-dirty',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
    isSelected && 'multi-selected',
    extraClassName,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classNames}
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height,
        zIndex: session.zIndex,
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status="running"
        isDirty={session.isDirty}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
      >
        <button
          className="file-viewer-terminal-btn"
          onClick={handleOpenTerminal}
          onPointerDown={(e) => e.stopPropagation()}
          title="Open terminal in file's directory"
        >
          &gt;_
        </button>
        <button
          className="file-viewer-edit-toggle"
          onClick={handleShowDepGraph}
          onPointerDown={(e) => e.stopPropagation()}
          title="Show import dependency graph"
        >
          Deps
        </button>
        <button
          className={`file-viewer-edit-toggle ${editing ? 'active' : ''}`}
          onClick={handleToggleEdit}
          onPointerDown={(e) => e.stopPropagation()}
          title={editing ? 'Switch to view mode' : 'Switch to edit mode'}
        >
          {editing ? 'View' : 'Edit'}
        </button>
      </WindowChrome>
      <div
        className="file-viewer-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        {editing ? (
          <FileEditorWidget
            content={session.content}
            language={session.language}
            onSave={handleSave}
            onChange={handleEditorChange}
          />
        ) : (
          <FileViewerWidget
            content={session.content}
            language={session.language}
          />
        )}
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
