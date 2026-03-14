import { useRef, useCallback } from 'react'
import { useCanvasControls } from './useCanvasControls'
import { useViewportCulling } from './useViewportCulling'
import { useSessionList, type Session } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import { useSnapshot } from '../stores/snapshotStore'
import Grid from './Grid'
import TerminalWindow from '../terminal/TerminalWindow'
import TerminalThumbnail from '../terminal/TerminalThumbnail'
import '../styles/canvas.css'

function ThumbnailRenderer({ session }: { session: Session }): JSX.Element {
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

  return (
    <div className="canvas-root" ref={rootRef}>
      <div className="canvas-viewport" ref={viewportRef}>
        {showGrid && <Grid zoom={storeZoom} gridSize={gridSize} />}
        {sessions.map((session) => {
          if (!visibleIds.has(session.id)) return null
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
        })}
      </div>
    </div>
  )
}
