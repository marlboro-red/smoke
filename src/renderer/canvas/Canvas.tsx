import { useRef } from 'react'
import { useCanvasControls } from './useCanvasControls'
import { useSessionList, type Session } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import Grid from './Grid'
import TerminalWidget from '../terminal/TerminalWidget'
import '../styles/canvas.css'

function SessionWindow({ session }: { session: Session }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height,
        zIndex: session.zIndex,
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        background: 'rgba(26, 26, 46, 0.8)',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <TerminalWidget
        sessionId={session.id}
        cols={session.size.cols}
        rows={session.size.rows}
      />
    </div>
  )
}

export default function Canvas(): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const { rootRef } = useCanvasControls(viewportRef)
  const sessions = useSessionList()
  const storeZoom = useCanvasStore((s) => s.zoom)
  const gridSize = useGridStore((s) => s.gridSize)
  const showGrid = useGridStore((s) => s.showGrid)

  return (
    <div className="canvas-root" ref={rootRef}>
      <div className="canvas-viewport" ref={viewportRef}>
        {showGrid && <Grid zoom={storeZoom} gridSize={gridSize} />}
        {sessions.map((session) => (
          <SessionWindow key={session.id} session={session} />
        ))}
      </div>
    </div>
  )
}
