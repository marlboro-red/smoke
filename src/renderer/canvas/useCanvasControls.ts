import { useRef, useEffect, useCallback } from 'react'
import { canvasStore } from '../stores/canvasStore'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3.0
const ZOOM_SENSITIVITY = 0.002

// Module-level controls exposed for cross-component use (e.g., sidebar pan-to)
let _panRef: React.MutableRefObject<{ x: number; y: number }> | null = null
let _zoomRef: React.MutableRefObject<number> | null = null
let _applyTransform: (() => void) | null = null
let _syncToStore: (() => void) | null = null
let _rootRef: React.MutableRefObject<HTMLDivElement | null> | null = null

export function setPanTo(x: number, y: number): void {
  if (!_panRef) return
  _panRef.current = { x, y }
  _applyTransform?.()
  _syncToStore?.()
}

export function getCurrentPan(): { x: number; y: number } {
  return _panRef?.current ?? { x: 0, y: 0 }
}

export function getCurrentZoom(): number {
  return _zoomRef?.current ?? 1
}

export function getCanvasRootElement(): HTMLDivElement | null {
  return _rootRef?.current ?? null
}

const ZOOM_STEP = 1.2
const MIN_ZOOM_CONST = 0.1
const MAX_ZOOM_CONST = 3.0

export function setZoomTo(zoom: number): void {
  if (!_zoomRef) return
  _zoomRef.current = Math.max(MIN_ZOOM_CONST, Math.min(MAX_ZOOM_CONST, zoom))
  _applyTransform?.()
  _syncToStore?.()
}

export function zoomIn(): void {
  if (!_zoomRef) return
  setZoomTo(_zoomRef.current * ZOOM_STEP)
}

export function zoomOut(): void {
  if (!_zoomRef) return
  setZoomTo(_zoomRef.current / ZOOM_STEP)
}

interface CanvasControls {
  panRef: React.MutableRefObject<{ x: number; y: number }>
  zoomRef: React.MutableRefObject<number>
  rootRef: React.MutableRefObject<HTMLDivElement | null>
}

export function useCanvasControls(
  viewportRef: React.RefObject<HTMLDivElement | null>
): CanvasControls {
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const isPanningRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const spaceKeyDownRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyTransform = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const { x, y } = panRef.current
    const z = zoomRef.current
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`
  }, [viewportRef])

  const syncToStore = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    syncTimeoutRef.current = setTimeout(() => {
      const { x, y } = panRef.current
      canvasStore.getState().setPan(x, y)
      canvasStore.getState().setZoom(zoomRef.current)
    }, 100)
  }, [])

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      isPanningRef.current = true
      lastPointerRef.current = { x: clientX, y: clientY }
      rootRef.current?.classList.add('panning')
    },
    []
  )

  const movePan = useCallback(
    (clientX: number, clientY: number) => {
      if (!isPanningRef.current) return
      const dx = clientX - lastPointerRef.current.x
      const dy = clientY - lastPointerRef.current.y
      lastPointerRef.current = { x: clientX, y: clientY }
      panRef.current.x += dx
      panRef.current.y += dy
      applyTransform()
    },
    [applyTransform]
  )

  const endPan = useCallback(() => {
    if (!isPanningRef.current) return
    isPanningRef.current = false
    rootRef.current?.classList.remove('panning')
    syncToStore()
  }, [syncToStore])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const onWheel = (e: WheelEvent): void => {
      // Let terminal containers handle their own scroll (xterm.js scrollback).
      // Only intercept Ctrl/Meta+wheel for canvas zoom.
      const target = e.target as HTMLElement
      if (target.closest('.terminal-container') && !e.ctrlKey && !e.metaKey) {
        return
      }

      // Let scrollable child elements (file viewer, note, editor) handle
      // wheel events when they can still scroll in the wheel direction.
      const scrollable = (
        target.closest('.file-viewer-highlighted, .file-viewer-markdown, .file-viewer-plaintext, .cm-scroller') ??
        target.closest('.note-textarea')
      ) as HTMLElement | null
      if (scrollable && !e.ctrlKey && !e.metaKey) {
        const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = scrollable
        const canScrollY = scrollHeight > clientHeight
        const canScrollX = scrollWidth > clientWidth
        const atTop = scrollTop <= 0
        const atBottom = scrollTop + clientHeight >= scrollHeight
        const atLeft = scrollLeft <= 0
        const atRight = scrollLeft + clientWidth >= scrollWidth

        const scrollingVertically = Math.abs(e.deltaY) > Math.abs(e.deltaX)
        if (scrollingVertically && canScrollY) {
          if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
            return // let the element scroll naturally
          }
        } else if (!scrollingVertically && canScrollX) {
          if ((e.deltaX < 0 && !atLeft) || (e.deltaX > 0 && !atRight)) {
            return // let the element scroll naturally
          }
        }
      }

      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        // Zoom toward cursor
        const rect = root.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top

        const oldZoom = zoomRef.current
        const delta = -e.deltaY * ZOOM_SENSITIVITY
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * (1 + delta)))

        const ratio = newZoom / oldZoom
        panRef.current.x = cursorX - (cursorX - panRef.current.x) * ratio
        panRef.current.y = cursorY - (cursorY - panRef.current.y) * ratio
        zoomRef.current = newZoom

        applyTransform()
        syncToStore()
      } else {
        // Scroll to pan
        panRef.current.x -= e.deltaX
        panRef.current.y -= e.deltaY
        applyTransform()
        syncToStore()
      }
    }

    const onPointerDown = (e: PointerEvent): void => {
      // Middle mouse button
      if (e.button === 1) {
        e.preventDefault()
        root.setPointerCapture(e.pointerId)
        startPan(e.clientX, e.clientY)
        return
      }

      // Left click + space key held
      if (e.button === 0 && spaceKeyDownRef.current) {
        e.preventDefault()
        root.setPointerCapture(e.pointerId)
        startPan(e.clientX, e.clientY)
        return
      }
    }

    const onPointerMove = (e: PointerEvent): void => {
      movePan(e.clientX, e.clientY)
    }

    const onPointerUp = (e: PointerEvent): void => {
      if (isPanningRef.current) {
        root.releasePointerCapture(e.pointerId)
        endPan()
      }
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.repeat) {
        // Don't intercept space when a text-editable element is focused
        const active = document.activeElement
        if (active && active.closest('.terminal-container')) return
        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return
        if (active && active.closest('.cm-editor')) return
        e.preventDefault()
        spaceKeyDownRef.current = true
        root.classList.add('panning')
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        spaceKeyDownRef.current = false
        if (!isPanningRef.current) {
          root.classList.remove('panning')
        }
      }
    }

    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('pointerdown', onPointerDown)
    root.addEventListener('pointermove', onPointerMove)
    root.addEventListener('pointerup', onPointerUp)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    return () => {
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [applyTransform, syncToStore, startPan, movePan, endPan])

  // Initialize from store and expose module-level refs
  useEffect(() => {
    const state = canvasStore.getState()
    panRef.current = { x: state.panX, y: state.panY }
    zoomRef.current = state.zoom
    applyTransform()

    _panRef = panRef
    _zoomRef = zoomRef
    _applyTransform = applyTransform
    _syncToStore = syncToStore
    _rootRef = rootRef

    return () => {
      _panRef = null
      _zoomRef = null
      _applyTransform = null
      _syncToStore = null
      _rootRef = null
    }
  }, [applyTransform, syncToStore])

  return { panRef, zoomRef, rootRef }
}
