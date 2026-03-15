import { useState, useEffect, useCallback } from 'react'
import { serializeCurrentLayout, useLayoutRestore } from './useLayoutPersistence'
import '../styles/layout.css'

export default function LayoutPanel(): JSX.Element {
  const [layouts, setLayouts] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState(false)
  const { loadLayout, resetLayout } = useLayoutRestore()

  const refreshList = useCallback(async () => {
    const names = await window.smokeAPI?.layout.list()
    if (names) setLayouts(names)
  }, [])

  useEffect(() => {
    if (expanded) refreshList()
  }, [expanded, refreshList])

  const handleSave = useCallback(async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const layout = serializeCurrentLayout(trimmed)
    await window.smokeAPI?.layout.save(trimmed, layout)
    setNewName('')
    refreshList()
  }, [newName, refreshList])

  const handleLoad = useCallback(async (name: string) => {
    await loadLayout(name)
  }, [loadLayout])

  const handleDelete = useCallback(async (name: string) => {
    await window.smokeAPI?.layout.delete(name)
    refreshList()
  }, [refreshList])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave()
    },
    [handleSave]
  )

  return (
    <div className="layout-panel">
      <button
        className="layout-toggle-btn"
        onClick={() => setExpanded(!expanded)}
      >
        Layouts {expanded ? '\u25B4' : '\u25BE'}
      </button>
      {expanded && (
        <div className="layout-panel-content">
          <div className="layout-save-row">
            <input
              className="layout-name-input"
              type="text"
              placeholder="Layout name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="layout-save-btn" onClick={handleSave} title="Save current layout">
              Save
            </button>
          </div>
          <button className="layout-reset-btn" onClick={resetLayout} title="Reset to default layout">
            Reset Layout
          </button>
          {layouts.length > 0 && (
            <div className="layout-list">
              {layouts.map((name) => (
                <div key={name} className="layout-list-item">
                  <span
                    className="layout-name"
                    onClick={() => handleLoad(name)}
                  >
                    {name}
                  </span>
                  <button
                    className="layout-delete-btn"
                    onClick={() => handleDelete(name)}
                    title="Delete layout"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
