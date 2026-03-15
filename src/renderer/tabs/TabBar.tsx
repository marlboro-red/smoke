import { useState, useRef, useCallback } from 'react'
import { useTabList, useActiveTabId, tabStore } from '../stores/tabStore'
import '../styles/tabs.css'

export default function TabBar(): JSX.Element {
  const tabs = useTabList()
  const activeTabId = useActiveTabId()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSwitchTab = useCallback((id: string) => {
    if (id !== activeTabId) {
      tabStore.getState().switchTab(id)
    }
  }, [activeTabId])

  const handleNewTab = useCallback(() => {
    tabStore.getState().createTab()
  }, [])

  const handleCloseTab = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    tabStore.getState().closeTab(id)
  }, [])

  const handleStartRename = useCallback((e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation()
    setRenamingId(id)
    setRenameValue(currentName)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [])

  const handleFinishRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      tabStore.getState().renameTab(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }, [renamingId, renameValue])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename()
    } else if (e.key === 'Escape') {
      setRenamingId(null)
    }
  }, [handleFinishRename])

  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item${tab.id === activeTabId ? ' active' : ''}`}
            onClick={() => handleSwitchTab(tab.id)}
            onDoubleClick={(e) => handleStartRename(e, tab.id, tab.name)}
          >
            {renamingId === tab.id ? (
              <input
                ref={inputRef}
                className="tab-item-name-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={handleRenameKeyDown}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab-item-name">{tab.name}</span>
            )}
            {tabs.length > 1 && (
              <span
                className="tab-item-close"
                onClick={(e) => handleCloseTab(e, tab.id)}
              >
                ×
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="tab-bar-new" onClick={handleNewTab} title="New tab">
        +
      </div>
    </div>
  )
}
