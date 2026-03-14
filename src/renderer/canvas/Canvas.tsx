import { useRef } from 'react'
import { useCanvasControls } from './useCanvasControls'
import { useSessionList, type Session } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import Grid from './Grid'
import '../styles/canvas.css'

function SessionPlaceholder({ session }: { session: Session }): JSX.Element {
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
        color: '#e0e0e0',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: 8,
        boxSizing: 'border-box',
      }}
    >
      {session.title}
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
          <SessionPlaceholder key={session.id} session={session} />
        ))}
      </div>
    </div>
  )
}
