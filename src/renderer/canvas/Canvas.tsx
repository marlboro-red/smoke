import { useRef, useCallback } from 'react'
import { useCanvasControls } from './useCanvasControls'
import { useViewportCulling } from './useViewportCulling'
import { useSessionList, sessionStore } from '../stores/sessionStore'
import type { Session, TerminalSession, FileViewerSession } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import { useSnapshot } from '../stores/snapshotStore'
import { createNewSession } from '../session/useSessionCreation'
import Grid from './Grid'
import TerminalWindow from '../terminal/TerminalWindow'
import TerminalThumbnail from '../terminal/TerminalThumbnail'
import FileViewerWindow from '../fileviewer/FileViewerWindow'
import FileViewerThumbnail from '../fileviewer/FileViewerThumbnail'
import '../styles/canvas.css'

function ThumbnailRenderer({ session }: { session: TerminalSession }): JSX.Element {
  const textSnapshot = useSnapshot(session.id)
  return <TerminalThumbnail session={session} textSnapshot={textSnapshot} />
}

export default function Canvas(): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const { rootRef, panRef, zoomRef } = useCanvasControls(viewportRef)
  const sessions = useSessionList()
  const storeZoom = useCanvasStore((s) => s.zoom)
  const gridSize = useGridStore((s) => s.gridSize)
  const showGrid = useGridStore((s) => s.showGrid)

  const { visibleIds, isThumbnailMode } = useViewportCulling(
    panRef,
    zoomRef,
    rootRef
  )

  const getZoom = useCallback(() => zoomRef.current, [zoomRef])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
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
    [rootRef, panRef, zoomRef]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only unfocus when clicking empty canvas, not terminal windows
      if ((e.target as HTMLElement).closest('.terminal-window')) return
      sessionStore.getState().focusSession(null)
    },
    []
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
        {sessions.map((session) => {
          if (!visibleIds.has(session.id)) return null
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
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
