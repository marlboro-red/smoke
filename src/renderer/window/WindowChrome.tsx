import { useState, useCallback, useRef, useEffect } from 'react'
import { CHROME_HEIGHT } from './useSnapping'

interface WindowChromeProps {
  title: string
  status: 'running' | 'exited'
  isBroadcasting?: boolean
  isDirty?: boolean
  agentColor?: string | null
  agentRole?: string | null
  onTitleChange: (title: string) => void
  onClose: () => void
  onDragStart: (e: React.PointerEvent) => void
  children?: React.ReactNode
}

export default function WindowChrome({
  title,
  status,
  isBroadcasting,
  isDirty,
  agentColor,
  agentRole,
  onTitleChange,
  onClose,
  onDragStart,
  children,
}: WindowChromeProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(title)
    setEditing(true)
  }, [title])

  const commitEdit = useCallback(() => {
    setEditing(false)
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== title) {
      onTitleChange(trimmed)
    }
  }, [editValue, title, onTitleChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitEdit()
      } else if (e.key === 'Escape') {
        setEditing(false)
      }
    },
    [commitEdit]
  )

  const handleCloseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onClose()
    },
    [onClose]
  )

  return (
    <div
      className="window-chrome"
      style={{ height: CHROME_HEIGHT }}
      onPointerDown={onDragStart}
    >
      <span
        className={`window-chrome-status ${status === 'running' ? 'running' : 'exited'}`}
      />
      {editing ? (
        <input
          ref={inputRef}
          className="window-chrome-title-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span
          className="window-chrome-title"
          onDoubleClick={handleDoubleClick}
        >
          {isDirty ? `${title} \u2022 Modified` : title}
        </span>
      )}
      {agentColor && (
        <span
          className="window-chrome-agent-badge"
          style={{ background: agentColor }}
          title={agentRole ? `Agent: ${agentRole}` : 'Agent assigned'}
        >
          {agentRole ? agentRole.slice(0, 3).toUpperCase() : 'AI'}
        </span>
      )}
      {isBroadcasting && (
        <span className="window-chrome-broadcast" title="Broadcasting">
          BC
        </span>
      )}
      {children}
      <button
        className="window-chrome-close"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleCloseClick}
      >
        &times;
      </button>
    </div>
  )
}
