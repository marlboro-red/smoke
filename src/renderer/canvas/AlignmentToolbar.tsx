import React, { useCallback } from 'react'
import { useSelectedIds } from '../stores/sessionStore'
import { useGridStore } from '../stores/gridStore'
import { executeAlignment, type AlignmentAction } from './alignmentUtils'
import '../styles/alignment-toolbar.css'

function AlignIcon({ action }: { action: AlignmentAction }): JSX.Element {
  const s = 14
  const props = { width: s, height: s, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const }

  switch (action) {
    case 'align-left':
      return <svg {...props}><line x1="2" y1="1" x2="2" y2="13"/><rect x="4" y="3" width="8" height="3" rx="0.5" fill="currentColor" stroke="none"/><rect x="4" y="8" width="5" height="3" rx="0.5" fill="currentColor" stroke="none"/></svg>
    case 'align-center-h':
      return <svg {...props}><line x1="7" y1="1" x2="7" y2="13"/><rect x="3" y="3" width="8" height="3" rx="0.5" fill="currentColor" stroke="none"/><rect x="4" y="8" width="6" height="3" rx="0.5" fill="currentColor" stroke="none"/></svg>
    case 'align-right':
      return <svg {...props}><line x1="12" y1="1" x2="12" y2="13"/><rect x="2" y="3" width="8" height="3" rx="0.5" fill="currentColor" stroke="none"/><rect x="5" y="8" width="5" height="3" rx="0.5" fill="currentColor" stroke="none"/></svg>
    case 'align-top':
      return <svg {...props}><line x1="1" y1="2" x2="13" y2="2"/><rect x="3" y="4" width="3" height="8" rx="0.5" fill="currentColor" stroke="none"/><rect x="8" y="4" width="3" height="5" rx="0.5" fill="currentColor" stroke="none"/></svg>
    case 'align-center-v':
      return <svg {...props}><line x1="1" y1="7" x2="13" y2="7"/><rect x="3" y="2" width="3" height="10" rx="0.5" fill="currentColor" stroke="none"/><rect x="8" y="3.5" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/></svg>
    case 'align-bottom':
      return <svg {...props}><line x1="1" y1="12" x2="13" y2="12"/><rect x="3" y="2" width="3" height="8" rx="0.5" fill="currentColor" stroke="none"/><rect x="8" y="5" width="3" height="5" rx="0.5" fill="currentColor" stroke="none"/></svg>
    case 'distribute-h':
      return <svg {...props}><line x1="1" y1="1" x2="1" y2="13"/><line x1="13" y1="1" x2="13" y2="13"/><rect x="4" y="4" width="2.5" height="6" rx="0.5" fill="currentColor" stroke="none"/><rect x="7.5" y="4" width="2.5" height="6" rx="0.5" fill="currentColor" stroke="none"/></svg>
    case 'distribute-v':
      return <svg {...props}><line x1="1" y1="1" x2="13" y2="1"/><line x1="1" y1="13" x2="13" y2="13"/><rect x="4" y="4" width="6" height="2.5" rx="0.5" fill="currentColor" stroke="none"/><rect x="4" y="7.5" width="6" height="2.5" rx="0.5" fill="currentColor" stroke="none"/></svg>
  }
}

const ACTIONS: { action: AlignmentAction; title: string }[] = [
  { action: 'align-left', title: 'Align left' },
  { action: 'align-center-h', title: 'Align center horizontally' },
  { action: 'align-right', title: 'Align right' },
  { action: 'align-top', title: 'Align top' },
  { action: 'align-center-v', title: 'Align center vertically' },
  { action: 'align-bottom', title: 'Align bottom' },
  { action: 'distribute-h', title: 'Distribute horizontally' },
  { action: 'distribute-v', title: 'Distribute vertically' },
]

export default function AlignmentToolbar(): JSX.Element | null {
  const selectedIds = useSelectedIds()
  const gridSize = useGridStore((s) => s.gridSize)

  const handleAction = useCallback(
    (action: AlignmentAction) => {
      executeAlignment(action, gridSize)
    },
    [gridSize]
  )

  if (selectedIds.size < 2) return null

  return (
    <div className="alignment-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <span className="alignment-toolbar-label">{selectedIds.size} selected</span>
      <div className="alignment-toolbar-divider" />
      <div className="alignment-toolbar-group">
        {ACTIONS.slice(0, 3).map((btn) => (
          <button
            key={btn.action}
            className="alignment-toolbar-btn"
            title={btn.title}
            onClick={() => handleAction(btn.action)}
          >
            <AlignIcon action={btn.action} />
          </button>
        ))}
      </div>
      <div className="alignment-toolbar-divider" />
      <div className="alignment-toolbar-group">
        {ACTIONS.slice(3, 6).map((btn) => (
          <button
            key={btn.action}
            className="alignment-toolbar-btn"
            title={btn.title}
            onClick={() => handleAction(btn.action)}
          >
            <AlignIcon action={btn.action} />
          </button>
        ))}
      </div>
      <div className="alignment-toolbar-divider" />
      <div className="alignment-toolbar-group">
        {ACTIONS.slice(6).map((btn) => (
          <button
            key={btn.action}
            className="alignment-toolbar-btn"
            title={btn.title}
            onClick={() => handleAction(btn.action)}
          >
            <AlignIcon action={btn.action} />
          </button>
        ))}
      </div>
    </div>
  )
}
