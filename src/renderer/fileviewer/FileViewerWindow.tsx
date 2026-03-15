import { useCallback } from 'react'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  type FileViewerSession,
} from '../stores/sessionStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from './useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import FileViewerWidget from './FileViewerWidget'
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

  const classNames = [
    'terminal-window',
    'file-viewer-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
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
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
      />
      <div
        className="file-viewer-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <FileViewerWidget
          content={session.content}
          language={session.language}
        />
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
