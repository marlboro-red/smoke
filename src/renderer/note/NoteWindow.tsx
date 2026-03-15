import { useCallback, useRef, useEffect } from 'react'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  useSelectedIds,
  type NoteSession,
} from '../stores/sessionStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from '../fileviewer/useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import NoteColorPicker, { resolveNoteColors } from './NoteColorPicker'
import '../styles/note.css'

interface NoteWindowProps {
  session: NoteSession
  zoom: () => number
  gridSize: number
}

export default function NoteWindow({
  session,
  zoom,
  gridSize,
}: NoteWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const selectedIds = useSelectedIds()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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
    closeSession(session.id)
  }, [session.id])

  const handleToggleLock = useCallback(() => {
    sessionStore.getState().toggleLock(session.id)
  }, [session.id])

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      sessionStore.getState().updateSession(session.id, { content: e.target.value })
    },
    [session.id]
  )

  const handleColorChange = useCallback(
    (color: string) => {
      sessionStore.getState().updateSession(session.id, { color })
    },
    [session.id]
  )

  // Focus textarea when window is focused
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isFocused])

  const colors = resolveNoteColors(session.color)

  const classNames = [
    'terminal-window',
    'note-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
    isSelected && 'multi-selected',
    session.locked && 'locked',
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
        background: colors.bg,
        borderColor: isFocused ? undefined : colors.border,
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status="running"
        isLocked={session.locked}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
        onToggleLock={handleToggleLock}
      />
      <div className="note-chrome-extras">
        <NoteColorPicker color={session.color} onChange={handleColorChange} />
      </div>
      <div
        className="note-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <textarea
          ref={textareaRef}
          className="note-textarea"
          value={session.content}
          onChange={handleContentChange}
          placeholder="Type a note..."
          spellCheck={false}
        />
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
