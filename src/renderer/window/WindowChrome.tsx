import { useState, useCallback, useRef, useEffect } from 'react'
import { CHROME_HEIGHT } from './useSnapping'

interface WindowChromeProps {
  title: string
  status: 'running' | 'exited'
  onTitleChange: (title: string) => void
  onClose: () => void
  onDragStart: (e: React.PointerEvent) => void
}

export default function WindowChrome({
  title,
  status,
  onTitleChange,
  onClose,
  onDragStart,
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
          {title}
        </span>
      )}
      <button
        className="window-chrome-close"
        onClick={handleCloseClick}
      >
        &times;
      </button>
    </div>
  )
}
