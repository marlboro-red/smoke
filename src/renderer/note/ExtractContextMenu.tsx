import { useEffect, useRef } from 'react'
import { extractSelectionToNote } from './extractToNote'

interface ExtractContextMenuProps {
  x: number
  y: number
  onClose: () => void
}

export default function ExtractContextMenu({ x, y, onClose }: ExtractContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [onClose])

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`
    }
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`
    }
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="extract-context-menu"
      style={{ top: y, left: x }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          extractSelectionToNote()
          onClose()
        }}
      >
        Extract to Note
      </button>
    </div>
  )
}
