import { useRef, useCallback } from 'react'
import { useCanvasControls } from './useCanvasControls'
import { useSessionList, useHighlightedId, sessionStore, type Session } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import Grid from './Grid'
import TerminalWidget from '../terminal/TerminalWidget'
import '../styles/canvas.css'

function SessionWindow({ session, isHighlighted }: { session: Session; isHighlighted: boolean }): JSX.Element {
  const handleMouseDown = useCallback(() => {
    sessionStore.getState().focusSession(session.id)
    sessionStore.getState().bringToFront(session.id)
  }, [session.id])

  const handleMouseEnter = useCallback(() => {
    sessionStore.getState().highlightSession(session.id)
  }, [session.id])

  const handleMouseLeave = useCallback(() => {
    sessionStore.getState().highlightSession(null)
  }, [])

  let className = 'session-window'
  if (isHighlighted) className += ' highlighted'

  return (
    <div
      className={className}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
  const highlightedId = useHighlightedId()
  const storeZoom = useCanvasStore((s) => s.zoom)
  const gridSize = useGridStore((s) => s.gridSize)
  const showGrid = useGridStore((s) => s.showGrid)

  return (
    <div className="canvas-root" ref={rootRef}>
      <div className="canvas-viewport" ref={viewportRef}>
        {showGrid && <Grid zoom={storeZoom} gridSize={gridSize} />}
        {sessions.map((session) => (
          <SessionWindow
            key={session.id}
            session={session}
            isHighlighted={highlightedId === session.id}
          />
        ))}
      </div>
    </div>
  )
}
