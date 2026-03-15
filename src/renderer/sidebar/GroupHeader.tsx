import { useState, useCallback, useRef, useEffect } from 'react'
import { sessionStore, useBroadcastGroupId } from '../stores/sessionStore'
import { broadcastToGroup } from '../terminal/usePty'

interface GroupHeaderProps {
  groupId: string
  groupName: string
  sessionCount: number
}

export default function GroupHeader({ groupId, groupName, sessionCount }: GroupHeaderProps): JSX.Element {
  const broadcastGroupId = useBroadcastGroupId()
  const isBroadcasting = broadcastGroupId === groupId
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleToggleBroadcast = useCallback(() => {
    sessionStore.getState().toggleBroadcast(groupId)
  }, [groupId])

  const handleSubmit = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        broadcastToGroup(groupId, inputValue + '\n')
        setInputValue('')
      }
    },
    [groupId, inputValue]
  )

  // Auto-focus the input when broadcast mode turns on
  useEffect(() => {
    if (isBroadcasting && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isBroadcasting])

  return (
    <div className={`group-header ${isBroadcasting ? 'broadcasting' : ''}`}>
      <div className="group-header-row">
        <span className="group-label">{groupName} ({sessionCount})</span>
        <button
          className={`broadcast-toggle ${isBroadcasting ? 'active' : ''}`}
          onClick={handleToggleBroadcast}
          title="Toggle broadcast mode (Cmd+Shift+B)"
        >
          Broadcast
        </button>
      </div>
      {isBroadcasting && (
        <div className="broadcast-input-row">
          <input
            ref={inputRef}
            className="broadcast-input"
            type="text"
            placeholder="Type command to broadcast..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleSubmit}
          />
        </div>
      )}
    </div>
  )
}
