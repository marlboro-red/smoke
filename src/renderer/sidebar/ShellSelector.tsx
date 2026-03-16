import { useState, useEffect, useRef, useCallback } from 'react'
import type { ShellInfo } from '../../preload/types'

interface ShellSelectorProps {
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onSelect: (shell?: string) => void
  onClose: () => void
}

export default function ShellSelector({ buttonRef, onSelect, onClose }: ShellSelectorProps): JSX.Element {
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [loading, setLoading] = useState(true)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.smokeAPI?.shell.list().then((list) => {
      setShells(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Position below the button
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 2, left: rect.left })
    }
  }, [buttonRef])

  // Close on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, buttonRef])

  const handleSelect = useCallback((shellPath?: string) => {
    onSelect(shellPath)
    onClose()
  }, [onSelect, onClose])

  return (
    <div
      ref={menuRef}
      className="shell-selector-menu"
      style={{ top: pos.top, left: pos.left }}
    >
      {loading ? (
        <div className="shell-selector-item disabled">Detecting shells...</div>
      ) : (
        <>
          <button
            className="shell-selector-item"
            onClick={() => handleSelect(undefined)}
          >
            Default Shell
          </button>
          {shells.map((shell) => (
            <button
              key={shell.path}
              className="shell-selector-item"
              onClick={() => handleSelect(shell.path)}
              title={shell.path}
            >
              {shell.name}
              <span className="shell-selector-path">{shell.path}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
