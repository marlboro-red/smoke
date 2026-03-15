import { useRef, useCallback, useState, useEffect } from 'react'
import {
  type Region,
  regionStore,
  getRegionBgColor,
  getRegionBorderColor,
  getRegionLabelColor,
} from '../stores/regionStore'
import { snapPosition, snapSize } from '../window/useSnapping'
import '../styles/region.css'

const REGION_LABEL_HEIGHT = 28
const MIN_WIDTH = 200
const MIN_HEIGHT = 160

interface RegionShapeProps {
  region: Region
  zoom: () => number
  gridSize: number
}

type ResizeDir = 'e' | 's' | 'se'

export default function RegionShape({ region, zoom, gridSize }: RegionShapeProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(region.name)
  const [showMenu, setShowMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  // ── Drag logic ──
  const dragRef = useRef({
    active: false,
    startMouse: { x: 0, y: 0 },
    startPos: { x: 0, y: 0 },
  })
  const elRef = useRef<HTMLDivElement>(null)

  const onDragPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current.active) return
      const z = zoom()
      const dx = (e.clientX - dragRef.current.startMouse.x) / z
      const dy = (e.clientY - dragRef.current.startMouse.y) / z
      const el = elRef.current
      if (el) {
        el.style.left = `${dragRef.current.startPos.x + dx}px`
        el.style.top = `${dragRef.current.startPos.y + dy}px`
      }
    },
    [zoom]
  )

  const onDragPointerUp = useCallback(
    (e: PointerEvent) => {
      dragRef.current.active = false
      const el = elRef.current
      if (el) {
        el.releasePointerCapture(e.pointerId)
        el.classList.remove('region-dragging')
      }
      const z = zoom()
      const dx = (e.clientX - dragRef.current.startMouse.x) / z
      const dy = (e.clientY - dragRef.current.startMouse.y) / z
      const newPos = {
        x: dragRef.current.startPos.x + dx,
        y: dragRef.current.startPos.y + dy,
      }
      const snapped = snapPosition(newPos, gridSize)
      regionStore.getState().updateRegion(region.id, { position: snapped })
      document.removeEventListener('pointermove', onDragPointerMove)
      document.removeEventListener('pointerup', onDragPointerUp)
    },
    [region.id, zoom, gridSize, onDragPointerMove]
  )

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      dragRef.current = {
        active: true,
        startMouse: { x: e.clientX, y: e.clientY },
        startPos: { ...region.position },
      }
      const el = elRef.current
      if (el) {
        el.setPointerCapture(e.pointerId)
        el.classList.add('region-dragging')
      }
      document.addEventListener('pointermove', onDragPointerMove)
      document.addEventListener('pointerup', onDragPointerUp)
    },
    [region.position, onDragPointerMove, onDragPointerUp]
  )

  // ── Resize logic ──
  const resizeRef = useRef({
    active: false,
    dir: 'se' as ResizeDir,
    startMouse: { x: 0, y: 0 },
    startSize: { width: 0, height: 0 },
  })

  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!resizeRef.current.active) return
      const z = zoom()
      const dx = (e.clientX - resizeRef.current.startMouse.x) / z
      const dy = (e.clientY - resizeRef.current.startMouse.y) / z
      const dir = resizeRef.current.dir

      let newW = resizeRef.current.startSize.width
      let newH = resizeRef.current.startSize.height

      if (dir === 'e' || dir === 'se') newW += dx
      if (dir === 's' || dir === 'se') newH += dy

      newW = Math.max(MIN_WIDTH, newW)
      newH = Math.max(MIN_HEIGHT, newH)

      const el = elRef.current
      if (el) {
        el.style.width = `${newW}px`
        el.style.height = `${newH}px`
      }
    },
    [zoom]
  )

  const onResizePointerUp = useCallback(
    (e: PointerEvent) => {
      resizeRef.current.active = false
      const el = elRef.current
      if (el) {
        el.releasePointerCapture(e.pointerId)
      }
      const z = zoom()
      const dx = (e.clientX - resizeRef.current.startMouse.x) / z
      const dy = (e.clientY - resizeRef.current.startMouse.y) / z
      const dir = resizeRef.current.dir

      let newW = resizeRef.current.startSize.width
      let newH = resizeRef.current.startSize.height

      if (dir === 'e' || dir === 'se') newW += dx
      if (dir === 's' || dir === 'se') newH += dy

      newW = Math.max(MIN_WIDTH, newW)
      newH = Math.max(MIN_HEIGHT, newH)

      const snapped = snapSize({ width: newW, height: newH }, gridSize, 10, 8)
      regionStore.getState().updateRegion(region.id, { size: snapped })
      document.removeEventListener('pointermove', onResizePointerMove)
      document.removeEventListener('pointerup', onResizePointerUp)
    },
    [region.id, zoom, gridSize, onResizePointerMove]
  )

  const onResizeStart = useCallback(
    (e: React.PointerEvent, dir: ResizeDir) => {
      e.stopPropagation()
      resizeRef.current = {
        active: true,
        dir,
        startMouse: { x: e.clientX, y: e.clientY },
        startSize: { ...region.size },
      }
      const el = elRef.current
      if (el) {
        el.setPointerCapture(e.pointerId)
      }
      document.addEventListener('pointermove', onResizePointerMove)
      document.addEventListener('pointerup', onResizePointerUp)
    },
    [region.size, onResizePointerMove, onResizePointerUp]
  )

  // ── Inline rename ──
  const startRename = useCallback(() => {
    setEditName(region.name)
    setEditing(true)
    setShowMenu(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [region.name])

  const commitRename = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== region.name) {
      regionStore.getState().updateRegion(region.id, { name: trimmed })
    }
    setEditing(false)
  }, [editName, region.id, region.name])

  const onNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitRename()
      } else if (e.key === 'Escape') {
        setEditing(false)
      }
    },
    [commitRename]
  )

  // ── Color change ──
  const COLORS = ['#4A90D9', '#D94A4A', '#4AD97A', '#D9C74A', '#9B59B6', '#E67E22']

  const changeColor = useCallback(
    (color: string) => {
      regionStore.getState().updateRegion(region.id, { color })
      setShowMenu(false)
    },
    [region.id]
  )

  const deleteRegion = useCallback(() => {
    regionStore.getState().removeRegion(region.id)
  }, [region.id])

  const bgColor = getRegionBgColor(region)
  const borderColor = getRegionBorderColor(region)
  const labelColor = getRegionLabelColor(region)

  return (
    <div
      ref={elRef}
      className="region-shape"
      style={{
        position: 'absolute',
        left: region.position.x,
        top: region.position.y,
        width: region.size.width,
        height: region.size.height,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        zIndex: -1,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle (top label area) */}
      <div
        className="region-label-bar"
        onPointerDown={onDragStart}
        onDoubleClick={(e) => {
          e.stopPropagation()
          startRename()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowMenu(!showMenu)
        }}
        style={{ height: REGION_LABEL_HEIGHT }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="region-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={onNameKeyDown}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        ) : (
          <span className="region-name" style={{ color: labelColor }}>
            {region.name}
          </span>
        )}
      </div>

      {/* Context menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="region-context-menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button className="region-menu-item" onClick={startRename}>
            Rename
          </button>
          <div className="region-color-row">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`region-color-swatch ${c === region.color ? 'region-color-swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => changeColor(c)}
              />
            ))}
          </div>
          <button className="region-menu-item region-menu-item--destructive" onClick={deleteRegion}>
            Delete Region
          </button>
        </div>
      )}

      {/* Resize handles */}
      <div
        className="region-resize-handle region-resize-e"
        onPointerDown={(e) => onResizeStart(e, 'e')}
      />
      <div
        className="region-resize-handle region-resize-s"
        onPointerDown={(e) => onResizeStart(e, 's')}
      />
      <div
        className="region-resize-handle region-resize-se"
        onPointerDown={(e) => onResizeStart(e, 'se')}
      />
    </div>
  )
}
