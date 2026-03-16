import React, { useMemo } from 'react'
import { useConnectorList } from '../stores/connectorStore'
import type { Connector } from '../stores/connectorStore'
import { useSessionList } from '../stores/sessionStore'
import type { Session } from '../stores/sessionStore'
import { useFocusModeActiveIds } from '../stores/focusModeStore'

interface Point {
  x: number
  y: number
}

function getEdgePoint(session: Session, other: Point): Point {
  const cx = session.position.x + session.size.width / 2
  const cy = session.position.y + session.size.height / 2
  const dx = other.x - cx
  const dy = other.y - cy

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const hw = session.size.width / 2
  const hh = session.size.height / 2

  // Find intersection with the rectangle edge
  const scaleX = hw / Math.abs(dx || 1)
  const scaleY = hh / Math.abs(dy || 1)
  const scale = Math.min(scaleX, scaleY)

  return { x: cx + dx * scale, y: cy + dy * scale }
}

function buildCurvePath(start: Point, end: Point): string {
  const dx = end.x - start.x
  const offset = Math.min(Math.abs(dx) * 0.4, 120)
  const c1x = start.x + offset
  const c2x = end.x - offset
  return `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`
}

const ARROW_ID = 'connector-arrowhead'
const SVG_SIZE = 20000

interface ConnectorPathProps {
  connector: Connector
  source: Session
  target: Session
  dimmed?: boolean
}

const ConnectorPath: React.FC<ConnectorPathProps> = React.memo(({ connector, source, target, dimmed }) => {

  const sourceCx = source.position.x + source.size.width / 2
  const sourceCy = source.position.y + source.size.height / 2
  const targetCx = target.position.x + target.size.width / 2
  const targetCy = target.position.y + target.size.height / 2

  const start = getEdgePoint(source, { x: targetCx, y: targetCy })
  const end = getEdgePoint(target, { x: sourceCx, y: sourceCy })
  const path = buildCurvePath(start, end)

  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  return (
    <g opacity={dimmed ? 0.15 : 1}>
      <path
        d={path}
        fill="none"
        stroke={connector.color}
        strokeWidth={2}
        markerEnd={`url(#${ARROW_ID})`}
      />
      {connector.label && (
        <text
          x={midX}
          y={midY - 8}
          textAnchor="middle"
          fill={connector.color}
          fontSize={12}
          fontFamily="var(--font-sans, system-ui)"
        >
          {connector.label}
        </text>
      )}
    </g>
  )
})

ConnectorPath.displayName = 'ConnectorPath'

const ConnectorLayer: React.FC = React.memo(() => {
  const connectors = useConnectorList()
  const sessions = useSessionList()
  const focusModeActiveIds = useFocusModeActiveIds()

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>()
    for (const s of sessions) map.set(s.id, s)
    return map
  }, [sessions])

  if (connectors.length === 0) return null

  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      style={{
        position: 'absolute',
        top: -SVG_SIZE / 2,
        left: -SVG_SIZE / 2,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker
          id={ARROW_ID}
          markerWidth={10}
          markerHeight={7}
          refX={9}
          refY={3.5}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
        </marker>
      </defs>
      {connectors.map((c) => {
        const source = sessionMap.get(c.sourceId)
        const target = sessionMap.get(c.targetId)
        if (!source || !target) return null
        return (
          <ConnectorPath
            key={c.id}
            connector={c}
            source={source}
            target={target}
            dimmed={focusModeActiveIds !== null && (!focusModeActiveIds.has(c.sourceId) || !focusModeActiveIds.has(c.targetId))}
          />
        )
      })}
    </svg>
  )
})

ConnectorLayer.displayName = 'ConnectorLayer'

export default ConnectorLayer
