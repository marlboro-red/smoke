import React, { useEffect, useMemo } from 'react'
import { useSessionList, type Session } from '../stores/sessionStore'
import {
  type Group,
  groupStore,
  getGroupBgColor,
  getGroupBorderColor,
  getGroupLabelColor,
} from '../stores/groupStore'

const GROUP_PADDING = 24
const LABEL_HEIGHT = 28

interface GroupBounds {
  x: number
  y: number
  width: number
  height: number
}

function computeBounds(members: Session[]): GroupBounds | null {
  if (members.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const m of members) {
    minX = Math.min(minX, m.position.x)
    minY = Math.min(minY, m.position.y)
    maxX = Math.max(maxX, m.position.x + m.size.width)
    maxY = Math.max(maxY, m.position.y + m.size.height)
  }

  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - LABEL_HEIGHT,
    width: maxX - minX + GROUP_PADDING * 2,
    height: maxY - minY + GROUP_PADDING * 2 + LABEL_HEIGHT,
  }
}

export default React.memo(function GroupContainer({ group }: { group: Group }): JSX.Element | null {
  const sessions = useSessionList()

  const members = useMemo(() => {
    const memberSet = new Set(group.memberIds)
    return sessions.filter((s) => memberSet.has(s.id))
  }, [sessions, group.memberIds])

  // Keep the store's bounding box in sync when members move
  useEffect(() => {
    groupStore.getState().recomputeBoundingBox(group.id)
  }, [group.id, members])

  const bounds = useMemo(() => computeBounds(members), [members])

  if (!bounds || members.length === 0) return null

  const bgColor = getGroupBgColor(group)
  const borderColor = getGroupBorderColor(group)
  const labelColor = getGroupLabelColor(group)

  return (
    <div
      className="group-container"
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        background: bgColor,
        border: `1px dashed ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <div
        className="group-label"
        style={{
          position: 'absolute',
          top: 6,
          left: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 500,
            color: labelColor,
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.02em',
          }}
        >
          {group.name}
        </span>
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {members.length} {members.length === 1 ? 'item' : 'items'}
        </span>
      </div>
    </div>
  )
})
