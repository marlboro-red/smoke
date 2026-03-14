import { useCallback, useRef, useEffect } from 'react'
import { sessionStore, useFocusedId, useHighlightedId, type Session } from '../stores/sessionStore'
import { snapshotStore } from '../stores/snapshotStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useWindowResize } from '../window/useWindowResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import TerminalWidget from './TerminalWidget'
import '../styles/window.css'

const SNAPSHOT_INTERVAL = 5000

interface TerminalWindowProps {
  session: Session
  zoom: () => number
  gridSize: number
}

export default function TerminalWindow({
  session,
  zoom,
  gridSize,
}: TerminalWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const charDimsRef = useRef({ width: 8, height: 16 })
  const getSnapshotRef = useRef<(() => string[]) | null>(null)

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id

  const getCharDims = useCallback(() => charDimsRef.current, [])

  const { onDragStart } = useWindowDrag({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const { onResizeStart } = useWindowResize({
    sessionId: session.id,
    zoom,
    gridSize,
    charDims: getCharDims,
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
    if (window.smokeAPI?.pty?.kill) {
      window.smokeAPI.pty.kill(session.id)
    }
    sessionStore.getState().removeSession(session.id)
    snapshotStore.getState().removeSnapshot(session.id)
  }, [session.id])

  const handleSnapshotReady = useCallback(
    (getSnapshot: () => string[]) => {
      getSnapshotRef.current = getSnapshot
    },
    []
  )

  // Periodically capture snapshots for thumbnail mode
  useEffect(() => {
    const interval = setInterval(() => {
      if (getSnapshotRef.current) {
        const lines = getSnapshotRef.current()
        if (lines.length > 0) {
          snapshotStore.getState().setSnapshot(session.id, lines)
        }
      }
    }, SNAPSHOT_INTERVAL)

    return () => clearInterval(interval)
  }, [session.id])

  // Capture snapshot on unmount (transitioning to thumbnail)
  useEffect(() => {
    return () => {
      if (getSnapshotRef.current) {
        const lines = getSnapshotRef.current()
        if (lines.length > 0) {
          snapshotStore.getState().setSnapshot(session.id, lines)
        }
      }
    }
  }, [session.id])

  const classNames = [
    'terminal-window',
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
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status={session.status}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
      />
      <div
        className="terminal-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <TerminalWidget
          sessionId={session.id}
          cols={session.size.cols}
          rows={session.size.rows}
          onCharDims={(dims) => {
            charDimsRef.current = dims
          }}
          onSnapshot={handleSnapshotReady}
        />
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
