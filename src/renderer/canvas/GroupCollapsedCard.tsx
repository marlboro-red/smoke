import { useCallback } from 'react'
import type { Group } from '../stores/groupStore'
import { groupStore } from '../stores/groupStore'
import '../styles/group.css'

interface GroupCollapsedCardProps {
  group: Group
}

export default function GroupCollapsedCard({ group }: GroupCollapsedCardProps): JSX.Element {
  const handleClick = useCallback(() => {
    groupStore.getState().toggleCollapsed(group.id)
  }, [group.id])

  return (
    <div
      className="group-collapsed-card"
      style={{
        position: 'absolute',
        left: group.boundingBox.x - 12,
        top: group.boundingBox.y - 32,
        zIndex: 999999,
      }}
      onClick={handleClick}
    >
      <div
        className="group-collapsed-color"
        style={{ background: group.color }}
      />
      <span className="group-collapsed-name">{group.name}</span>
      <span className="group-collapsed-count">
        {group.memberIds.length} {group.memberIds.length === 1 ? 'item' : 'items'}
      </span>
      <span className="group-collapsed-expand" title="Expand group">&#9654;</span>
    </div>
  )
}
