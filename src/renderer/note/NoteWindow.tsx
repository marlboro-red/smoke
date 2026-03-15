import { useCallback, useRef, useEffect } from 'react'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  type NoteSession,
} from '../stores/sessionStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from '../fileviewer/useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import '../styles/note.css'

const NOTE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  yellow: { bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.25)', dot: '#fbbf24' },
  pink: { bg: 'rgba(244, 114, 182, 0.08)', border: 'rgba(244, 114, 182, 0.25)', dot: '#f472b6' },
  blue: { bg: 'rgba(96, 165, 250, 0.08)', border: 'rgba(96, 165, 250, 0.25)', dot: '#60a5fa' },
  green: { bg: 'rgba(74, 222, 128, 0.08)', border: 'rgba(74, 222, 128, 0.25)', dot: '#4ade80' },
  purple: { bg: 'rgba(167, 139, 250, 0.08)', border: 'rgba(167, 139, 250, 0.25)', dot: '#a78bfa' },
}

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id

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

  const handlePointerDown = useCallback(() => {
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

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      sessionStore.getState().updateSession(session.id, { content: e.target.value })
    },
    [session.id]
  )

  const handleColorCycle = useCallback(() => {
    const colorKeys = Object.keys(NOTE_COLORS)
    const currentIndex = colorKeys.indexOf(session.color)
    const nextColor = colorKeys[(currentIndex + 1) % colorKeys.length]
    sessionStore.getState().updateSession(session.id, { color: nextColor })
  }, [session.id, session.color])

  // Focus textarea when window is focused
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isFocused])

  const colors = NOTE_COLORS[session.color] ?? NOTE_COLORS.yellow

  const classNames = [
    'terminal-window',
    'note-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
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
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
      />
      <div className="note-chrome-extras">
        <button
          className="note-color-btn"
          style={{ background: colors.dot }}
          onClick={handleColorCycle}
          title="Change color"
        />
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
