import { useRef, useCallback, useMemo } from 'react'
import { useCanvasControls } from './useCanvasControls'
import { useViewportCulling } from './useViewportCulling'
import { useSessionList, sessionStore } from '../stores/sessionStore'
import type { Session, TerminalSession, FileViewerSession, NoteSession } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import { useSnapshot } from '../stores/snapshotStore'
import { useGroupList } from '../stores/groupStore'
import { createNewSession } from '../session/useSessionCreation'
import Grid from './Grid'
import ConnectorLayer from './ConnectorLayer'
import GroupContainer from './GroupContainer'
import TerminalWindow from '../terminal/TerminalWindow'
import TerminalThumbnail from '../terminal/TerminalThumbnail'
import FileViewerWindow from '../fileviewer/FileViewerWindow'
import FileViewerThumbnail from '../fileviewer/FileViewerThumbnail'
import NoteWindow from '../note/NoteWindow'
import NoteThumbnail from '../note/NoteThumbnail'
import GroupCollapsedCard from './GroupCollapsedCard'
import '../styles/canvas.css'

function ThumbnailRenderer({ session }: { session: TerminalSession }): JSX.Element {
  const textSnapshot = useSnapshot(session.id)
  return <TerminalThumbnail session={session} textSnapshot={textSnapshot} />
}

export default function Canvas({ readOnly = false }: { readOnly?: boolean }): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const { rootRef, panRef, zoomRef } = useCanvasControls(viewportRef)
  const sessions = useSessionList()
  const groups = useGroupList()
  const storeZoom = useCanvasStore((s) => s.zoom)
  const gridSize = useGridStore((s) => s.gridSize)
  const showGrid = useGridStore((s) => s.showGrid)

  const { visibleIds, isThumbnailMode } = useViewportCulling(
    panRef,
    zoomRef,
    rootRef
  )

  // Build set of session IDs hidden by collapsed groups
  const collapsedMemberIds = useMemo(() => {
    const hidden = new Set<string>()
    for (const group of groups) {
      if (group.collapsed) {
        for (const memberId of group.memberIds) {
          hidden.add(memberId)
        }
      }
    }
    return hidden
  }, [groups])

  const collapsedGroups = useMemo(
    () => groups.filter((g) => g.collapsed && g.memberIds.length > 0),
    [groups]
  )

  const getZoom = useCallback(() => zoomRef.current, [zoomRef])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      // Only on empty canvas, not on terminal windows
      if ((e.target as HTMLElement).closest('.terminal-window')) return

      const root = rootRef.current
      if (!root) return

      // Convert screen -> canvas coordinates
      const rect = root.getBoundingClientRect()
      const canvasX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
      const canvasY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current

      createNewSession({ x: canvasX, y: canvasY })
    },
    [rootRef, panRef, zoomRef, readOnly]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      // Only unfocus when clicking empty canvas, not terminal windows
      if ((e.target as HTMLElement).closest('.terminal-window')) return
      sessionStore.getState().focusSession(null)
    },
    [readOnly]
  )

  return (
    <div
      className="canvas-root"
      ref={rootRef}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
    >
      <div className="canvas-viewport" ref={viewportRef}>
        {showGrid && <Grid zoom={storeZoom} gridSize={gridSize} />}
        <ConnectorLayer />
        {groups.map((group) => (
          <GroupContainer key={group.id} group={group} />
        ))}
        {sessions.map((session) => {
          if (!visibleIds.has(session.id)) return null
          if (collapsedMemberIds.has(session.id)) return null
          switch (session.type) {
            case 'terminal':
              if (isThumbnailMode) {
                return <ThumbnailRenderer key={session.id} session={session} />
              }
              return (
                <TerminalWindow
                  key={session.id}
                  session={session}
                  zoom={getZoom}
                  gridSize={gridSize}
                />
              )
            case 'file':
              if (isThumbnailMode) {
                return <FileViewerThumbnail key={session.id} session={session} />
              }
              return (
                <FileViewerWindow
                  key={session.id}
                  session={session}
                  zoom={getZoom}
                  gridSize={gridSize}
                />
              )
            case 'note':
              if (isThumbnailMode) {
                return <NoteThumbnail key={session.id} session={session} />
              }
              return (
                <NoteWindow
                  key={session.id}
                  session={session}
                  zoom={getZoom}
                  gridSize={gridSize}
                />
              )
            default:
              return null
          }
        })}
        {collapsedGroups.map((group) => (
          <GroupCollapsedCard key={group.id} group={group} />
        ))}
      </div>
    </div>
  )
}
