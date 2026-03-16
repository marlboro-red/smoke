import { useState, useEffect, useCallback } from 'react'
import { getCurrentPan, getCurrentZoom, setPanTo, setZoomTo, getCanvasRootElement } from '../canvas/useCanvasControls'
import type { Bookmark } from '../../preload/types'
import '../styles/bookmarks.css'

const ANIMATION_DURATION = 300

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

let _animFrame: number | null = null

function jumpToBookmark(bookmark: Bookmark): void {
  if (_animFrame !== null) {
    cancelAnimationFrame(_animFrame)
  }

  const rootEl = getCanvasRootElement()
  if (!rootEl) {
    setPanTo(bookmark.panX, bookmark.panY)
    setZoomTo(bookmark.zoom)
    return
  }

  const startPan = getCurrentPan()
  const startZoom = getCurrentZoom()
  const startX = startPan.x
  const startY = startPan.y
  const startTime = performance.now()

  function animate(now: number): void {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / ANIMATION_DURATION)
    const eased = easeOut(progress)

    const x = startX + (bookmark.panX - startX) * eased
    const y = startY + (bookmark.panY - startY) * eased
    const z = startZoom + (bookmark.zoom - startZoom) * eased

    setPanTo(x, y)
    setZoomTo(z)

    if (progress < 1) {
      _animFrame = requestAnimationFrame(animate)
    } else {
      _animFrame = null
    }
  }

  _animFrame = requestAnimationFrame(animate)
}

export { jumpToBookmark }

export default function BookmarkPanel(): JSX.Element {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState(false)

  const refreshList = useCallback(async () => {
    const list = await window.smokeAPI?.bookmark.list()
    if (list) setBookmarks(list)
  }, [])

  useEffect(() => {
    if (expanded) refreshList()
  }, [expanded, refreshList])

  const handleSave = useCallback(async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const pan = getCurrentPan()
    const zoom = getCurrentZoom()
    const bookmark: Bookmark = {
      name: trimmed,
      panX: pan.x,
      panY: pan.y,
      zoom,
    }
    await window.smokeAPI?.bookmark.save(trimmed, bookmark)
    setNewName('')
    refreshList()
  }, [newName, refreshList])

  const handleJump = useCallback((bookmark: Bookmark) => {
    jumpToBookmark(bookmark)
  }, [])

  const handleDelete = useCallback(async (name: string) => {
    await window.smokeAPI?.bookmark.delete(name)
    refreshList()
  }, [refreshList])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave()
    },
    [handleSave]
  )

  return (
    <div className="bookmark-panel">
      <button
        className="bookmark-toggle-btn"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`section-toggle-arrow${expanded ? ' expanded' : ''}`}>{'\u25B6'}</span>
        Bookmarks
      </button>
      {expanded && (
        <div className="bookmark-panel-content">
          <div className="bookmark-save-row">
            <input
              className="bookmark-name-input"
              type="text"
              placeholder="Bookmark name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="bookmark-save-btn" onClick={handleSave} title="Save current view as bookmark">
              Save
            </button>
          </div>
          {bookmarks.length > 0 && (
            <div className="bookmark-list">
              {bookmarks.map((bm) => (
                <div key={bm.name} className="bookmark-list-item">
                  <span
                    className="bookmark-name"
                    onClick={() => handleJump(bm)}
                    title={`Pan: (${Math.round(bm.panX)}, ${Math.round(bm.panY)}) Zoom: ${bm.zoom.toFixed(2)}`}
                  >
                    {bm.name}
                  </span>
                  <button
                    className="bookmark-delete-btn"
                    onClick={() => handleDelete(bm.name)}
                    title="Delete bookmark"
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
