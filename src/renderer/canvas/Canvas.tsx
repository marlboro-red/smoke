import { useRef, useCallback } from 'react'
import { useCanvasControls } from './useCanvasControls'
import { useSessionList } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import Grid from './Grid'
import TerminalWindow from '../terminal/TerminalWindow'
import '../styles/canvas.css'

export default function Canvas(): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const { rootRef, zoomRef } = useCanvasControls(viewportRef)
  const sessions = useSessionList()
  const storeZoom = useCanvasStore((s) => s.zoom)
  const gridSize = useGridStore((s) => s.gridSize)
  const showGrid = useGridStore((s) => s.showGrid)

  const getZoom = useCallback(() => zoomRef.current, [zoomRef])

  return (
    <div className="canvas-root" ref={rootRef}>
      <div className="canvas-viewport" ref={viewportRef}>
        {showGrid && <Grid zoom={storeZoom} gridSize={gridSize} />}
        {sessions.map((session) => (
          <TerminalWindow
            key={session.id}
            session={session}
            zoom={getZoom}
            gridSize={gridSize}
          />
        ))}
      </div>
    </div>
  )
}
