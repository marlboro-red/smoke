import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import {
  commandPaletteStore,
  useCommandPaletteOpen,
  useCommandPaletteQuery,
  useCommandPaletteSelectedIndex,
} from './commandPaletteStore'
import {
  getAllItems,
  filterItems,
  buildFileItems,
  getRecentWorkspaceItems,
  type PaletteItem,
} from './paletteCommands'
import { preferencesStore } from '../stores/preferencesStore'
import '../styles/command-palette.css'

export default function CommandPalette(): JSX.Element | null {
  const isOpen = useCommandPaletteOpen()
  const query = useCommandPaletteQuery()
  const selectedIndex = useCommandPaletteSelectedIndex()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [fileItems, setFileItems] = useState<PaletteItem[]>([])
  const [workspaceItems, setWorkspaceItems] = useState<PaletteItem[]>([])

  // Load project files and recent workspaces when palette opens
  useEffect(() => {
    if (!isOpen) {
      setFileItems([])
      setWorkspaceItems([])
      return
    }
    const cwd = preferencesStore.getState().launchCwd
    if (cwd && window.smokeAPI?.fs?.readdir) {
      window.smokeAPI.fs.readdir(cwd).then((entries) => {
        if (entries && Array.isArray(entries)) {
          setFileItems(buildFileItems(entries))
        }
      }).catch(() => {
        // Ignore errors loading files
      })
    }

    getRecentWorkspaceItems().then(setWorkspaceItems).catch(() => {})
  }, [isOpen])

  // Auto-focus input when opening
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Escape to close (capture phase, before other handlers)
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        commandPaletteStore.getState().close()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [isOpen])

  const allItems = useMemo(
    () => [...getAllItems(), ...workspaceItems, ...fileItems],
    [fileItems, workspaceItems, isOpen] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const filtered = useMemo(() => filterItems(allItems, query), [allItems, query])

  const executeItem = useCallback(
    (item: PaletteItem) => {
      commandPaletteStore.getState().close()
      item.action()
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { selectedIndex: idx } = commandPaletteStore.getState()
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          commandPaletteStore.getState().setSelectedIndex(
            Math.min(idx + 1, filtered.length - 1)
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          commandPaletteStore.getState().setSelectedIndex(Math.max(idx - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[idx]) {
            executeItem(filtered[idx])
          }
          break
      }
    },
    [filtered, executeItem]
  )

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('.palette-item--selected')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      commandPaletteStore.getState().close()
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="palette-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="palette-modal" onKeyDown={handleKeyDown}>
        <div className="palette-input-wrap">
          <span className="palette-input-icon">&gt;</span>
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => commandPaletteStore.getState().setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={`palette-item ${i === selectedIndex ? 'palette-item--selected' : ''}`}
              onClick={() => executeItem(item)}
              onMouseEnter={() => commandPaletteStore.getState().setSelectedIndex(i)}
            >
              <span className="palette-item-icon">{item.icon}</span>
              <span className="palette-item-title">{item.title}</span>
              <span className="palette-item-category">{item.category}</span>
            </button>
          ))}
        </div>

        <div className="palette-footer">
          <span className="palette-hint">
            <kbd className="palette-key">&#8593;&#8595;</kbd> navigate
            <kbd className="palette-key">&#9166;</kbd> select
            <kbd className="palette-key">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
