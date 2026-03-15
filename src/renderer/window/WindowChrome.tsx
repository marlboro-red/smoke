import { useState, useCallback, useRef, useEffect } from 'react'
import { CHROME_HEIGHT } from './useSnapping'

interface WindowChromeProps {
  title: string
  status: 'running' | 'exited'
  isBroadcasting?: boolean
  isDirty?: boolean
  isLocked?: boolean
  isPinned?: boolean
  agentColor?: string | null
  agentRole?: string | null
  onTitleChange: (title: string) => void
  onClose: () => void
  onDragStart: (e: React.PointerEvent) => void
  onToggleLock?: () => void
  onTogglePin?: () => void
  children?: React.ReactNode
}

export default function WindowChrome({
  title,
  status,
  isBroadcasting,
  isDirty,
  isLocked,
  isPinned,
  agentColor,
  agentRole,
  onTitleChange,
  onClose,
  onDragStart,
  onToggleLock,
  onTogglePin,
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

  const handleLockClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleLock?.()
    },
    [onToggleLock]
  )

  return (
    <div
      className={`window-chrome${isLocked ? ' locked' : ''}`}
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
      {onToggleLock && (
        <button
          className={`window-chrome-lock${isLocked ? ' active' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleLockClick}
          title={isLocked ? 'Unlock position' : 'Lock position'}
        >
          {isLocked ? '\u{1F512}' : '\u{1F513}'}
        </button>
      )}
      {onTogglePin && (
        <button
          className={`window-chrome-pin${isPinned ? ' pinned' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
          title={isPinned ? 'Unpin from viewport' : 'Pin to viewport'}
        >
          {isPinned ? '\u25C9' : '\u25CB'}
        </button>
      )}
      <button
        className="window-chrome-close"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleCloseClick}
        title="Close window"
      >
        &times;
      </button>
    </div>
  )
}
