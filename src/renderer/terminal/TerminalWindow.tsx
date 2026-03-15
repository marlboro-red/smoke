import { useCallback, useRef, useEffect, useMemo } from 'react'
import { sessionStore, useFocusedId, useHighlightedId, useSelectedIds, useBroadcastGroupId, type TerminalSession } from '../stores/sessionStore'
import { snapshotStore } from '../stores/snapshotStore'
import { findAgentBySessionGroupId } from '../stores/agentStore'
import { splitPaneStore, useSplitPaneStore } from '../stores/splitPaneStore'
import { getTerminal } from './terminalRegistry'
import { useWindowDrag } from '../window/useWindowDrag'
import { useWindowResize } from '../window/useWindowResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import TerminalWidget from './TerminalWidget'
import TerminalSearchBar from './TerminalSearchBar'
import SplitPaneContainer from './SplitPaneContainer'
import '../styles/window.css'

const SNAPSHOT_INTERVAL = 5000

interface TerminalWindowProps {
  session: TerminalSession
  zoom: () => number
  gridSize: number
  hidden?: boolean
}

export default function TerminalWindow({
  session,
  zoom,
  gridSize,
  hidden,
}: TerminalWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const selectedIds = useSelectedIds()
  const broadcastGroupId = useBroadcastGroupId()
  const charDimsRef = useRef({ width: 8, height: 16 })
  const getSnapshotRef = useRef<(() => string[]) | null>(null)

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id
  const isSelected = selectedIds.has(session.id)
  const isBroadcasting = !!(session.groupId && broadcastGroupId === session.groupId)

  // Split pane state
  const splitTree = useSplitPaneStore((s) => s.getTree(session.id))
  const focusedPaneId = useSplitPaneStore((s) => s.getFocusedPane(session.id))

  // Find the agent assigned to this session's group
  const assignedAgent = useMemo(
    () => findAgentBySessionGroupId(session.groupId),
    [session.groupId]
  )

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

  // Refresh terminal rendering when transitioning from hidden to visible.
  // While hidden via CSS, the WebGL/canvas renderer may skip painting;
  // a full refresh ensures the buffer content is drawn immediately.
  const prevHiddenRef = useRef(hidden)
  useEffect(() => {
    if (prevHiddenRef.current && !hidden) {
      const entry = getTerminal(session.id)
      if (entry) {
        entry.terminal.refresh(0, entry.terminal.rows - 1)
      }
    }
    prevHiddenRef.current = hidden
  }, [hidden, session.id])

  const classNames = [
    'terminal-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
    isSelected && 'multi-selected',
    isBroadcasting && 'broadcasting',
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
        visibility: hidden ? 'hidden' : undefined,
        pointerEvents: hidden ? 'none' : undefined,
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status={session.status}
        isBroadcasting={isBroadcasting}
        isLocked={session.locked}
        agentColor={assignedAgent?.color}
        agentRole={assignedAgent?.role}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
        onToggleLock={handleToggleLock}
      />
      <div
        className="terminal-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)`, position: 'relative' }}
      >
        <TerminalSearchBar sessionId={session.id} />
        {splitTree ? (
          <SplitPaneContainer
            sessionId={session.id}
            node={splitTree}
            focusedPaneId={focusedPaneId}
            windowIsFocused={isFocused}
            onCharDims={(dims) => {
              charDimsRef.current = dims
            }}
            onSnapshot={handleSnapshotReady}
          />
        ) : (
          <TerminalWidget
            sessionId={session.id}
            cols={session.size.cols}
            rows={session.size.rows}
            onCharDims={(dims) => {
              charDimsRef.current = dims
            }}
            onSnapshot={handleSnapshotReady}
          />
        )}
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
