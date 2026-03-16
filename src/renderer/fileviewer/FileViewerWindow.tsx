import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  useSelectedIds,
  type FileViewerSession,
} from '../stores/sessionStore'
import { useFocusModeActiveIds } from '../stores/focusModeStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from './useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import { addToast } from '../stores/toastStore'
import { buildDepGraph, expandDepGraph, buildDependentsGraph } from '../depgraph/buildDepGraph'
import { isInActiveGraph, isNodeExpanded } from '../depgraph/GraphCache'
import { createTerminalAtFileDir } from '../session/useSessionCreation'
import { goToLineStore, useGoToLineSessionId } from './goToLineStore'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import FileViewerWidget from './FileViewerWidget'
import FileEditorWidget from './FileEditorWidget'
import '../styles/fileviewer.css'

interface FileViewerWindowProps {
  session: FileViewerSession
  zoom: () => number
  gridSize: number
  hidden?: boolean
  className?: string
}

export default function FileViewerWindow({
  session,
  zoom,
  gridSize,
  hidden,
  className: extraClassName,
}: FileViewerWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const selectedIds = useSelectedIds()
  const editing = session.editing ?? false
  const goToLineSessionId = useGoToLineSessionId()
  const showGoToLine = goToLineSessionId === session.id

  const editorViewRef = useRef<EditorView | null>(null)
  const viewerBodyRef = useRef<HTMLDivElement>(null)
  const goToLineInputRef = useRef<HTMLInputElement>(null)

  const focusModeActiveIds = useFocusModeActiveIds()

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id
  const isSelected = selectedIds.has(session.id)
  const isDimmedByFocusMode = focusModeActiveIds !== null && !focusModeActiveIds.has(session.id)

  // Focus input when go-to-line activates
  useEffect(() => {
    if (showGoToLine) {
      // Delay to ensure the input is rendered
      requestAnimationFrame(() => goToLineInputRef.current?.focus())
    }
  }, [showGoToLine])

  const handleGoToLine = useCallback(
    (lineNumber: number) => {
      const totalLines = session.content.split('\n').length
      const targetLine = Math.max(1, Math.min(lineNumber, totalLines))

      if (editing && editorViewRef.current) {
        // CodeMirror edit mode: move cursor to line and scroll
        const view = editorViewRef.current
        const line = view.state.doc.line(Math.min(targetLine, view.state.doc.lines))
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
        })
        view.focus()
      } else if (viewerBodyRef.current) {
        // Read-only mode: find the line span and scroll to it
        const lineSpans = viewerBodyRef.current.querySelectorAll('.line')
        const targetSpan = lineSpans[targetLine - 1] as HTMLElement | undefined
        if (targetSpan) {
          targetSpan.scrollIntoView({ block: 'center', behavior: 'smooth' })
          // Briefly highlight the line
          targetSpan.classList.add('go-to-line-highlight')
          setTimeout(() => targetSpan.classList.remove('go-to-line-highlight'), 1500)
        }
      }

      goToLineStore.getState().close()
    },
    [editing, session.content]
  )

  const handleGoToLineSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const value = goToLineInputRef.current?.value.trim()
      if (value) {
        const num = parseInt(value, 10)
        if (!isNaN(num) && num > 0) {
          handleGoToLine(num)
        }
      }
    },
    [handleGoToLine]
  )

  const handleGoToLineKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        goToLineStore.getState().close()
      }
    },
    []
  )

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
    const isMod = e.metaKey || e.ctrlKey || e.shiftKey
    if (isMod) {
      e.stopPropagation()
      sessionStore.getState().toggleSelectSession(session.id)
      return
    }
    if (selectedIds.has(session.id) && selectedIds.size > 1) {
      sessionStore.getState().bringToFront(session.id)
      sessionStore.getState().focusSession(session.id)
      return
    }
    sessionStore.getState().clearSelection()
    sessionStore.getState().bringToFront(session.id)
    sessionStore.getState().focusSession(session.id)
  }, [session.id, selectedIds])

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

  const handleToggleLock = useCallback(() => {
    sessionStore.getState().toggleLock(session.id)
  }, [session.id])

  const handleTogglePin = useCallback(() => {
    if (!session.isPinned) {
      const pan = getCurrentPan()
      const z = getCurrentZoom()
      sessionStore.getState().togglePin(session.id, {
        x: session.position.x * z + pan.x,
        y: session.position.y * z + pan.y,
      })
    } else {
      sessionStore.getState().togglePin(session.id)
    }
  }, [session.id, session.isPinned, session.position.x, session.position.y])

  const handleToggleEdit = useCallback(() => {
    sessionStore.getState().updateSession(session.id, { editing: !editing })
  }, [session.id, editing])

  const [importsLoading, setImportsLoading] = useState(false)
  const importsExpanded = isNodeExpanded(session.filePath)

  const handleShowImports = useCallback(async () => {
    setImportsLoading(true)
    try {
      if (isInActiveGraph(session.filePath)) {
        await expandDepGraph(session.filePath)
      } else {
        await buildDepGraph(session)
      }
    } catch (err) {
      addToast(
        `Failed to load imports: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    } finally {
      setImportsLoading(false)
    }
  }, [session])

  const handleShowDependents = useCallback(async () => {
    try {
      await buildDependentsGraph(session)
    } catch (err) {
      addToast(
        `Failed to load dependents: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    }
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
    isDimmedByFocusMode && 'focus-mode-dimmed',
    session.locked && 'locked',
    session.isPinned && 'pinned',
    extraClassName,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classNames}
      data-session-id={session.id}
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height,
        zIndex: session.zIndex,
        visibility: hidden ? 'hidden' : undefined,
        pointerEvents: hidden ? 'none' : undefined,
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status="running"
        isDirty={session.isDirty}
        isLocked={session.locked}
        isPinned={session.isPinned}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
        onToggleLock={handleToggleLock}
        onTogglePin={handleTogglePin}
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
          className={`file-viewer-imports-btn${importsExpanded ? ' expanded' : ''}${importsLoading ? ' loading' : ''}`}
          onClick={handleShowImports}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={importsLoading}
          title={importsExpanded ? 'Imports already shown — click to expand deeper' : 'Show imports on canvas'}
        >
          {importsLoading ? 'Loading…' : 'Imports'}
        </button>
        <button
          className="file-viewer-edit-toggle"
          onClick={handleShowDependents}
          onPointerDown={(e) => e.stopPropagation()}
          title="Show files that import this file"
        >
          Rdeps
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
        ref={viewerBodyRef}
        className="file-viewer-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        {showGoToLine && (
          <form className="go-to-line-bar" onSubmit={handleGoToLineSubmit}>
            <label className="go-to-line-label">Go to Line:</label>
            <input
              ref={goToLineInputRef}
              className="go-to-line-input"
              type="number"
              min={1}
              placeholder={`1–${session.content.split('\n').length}`}
              onKeyDown={handleGoToLineKeyDown}
              onBlur={() => goToLineStore.getState().close()}
            />
          </form>
        )}
        {editing ? (
          <FileEditorWidget
            content={session.content}
            language={session.language}
            onSave={handleSave}
            onChange={handleEditorChange}
            editorViewRef={editorViewRef}
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
