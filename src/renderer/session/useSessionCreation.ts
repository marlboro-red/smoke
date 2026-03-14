import { useCallback } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { preferencesStore } from '../stores/preferencesStore'
import { gridStore } from '../stores/gridStore'
import { getCurrentPan, getCurrentZoom, getCanvasRootElement } from '../canvas/useCanvasControls'

function getViewportCenter(): { x: number; y: number } {
  const rootEl = getCanvasRootElement()
  if (!rootEl) return { x: 100, y: 100 }

  const rect = rootEl.getBoundingClientRect()
  const pan = getCurrentPan()
  const zoom = getCurrentZoom()

  // Convert viewport center to canvas coordinates
  const canvasX = (rect.width / 2 - pan.x) / zoom
  const canvasY = (rect.height / 2 - pan.y) / zoom

  return { x: canvasX, y: canvasY }
}

function getDefaultCwd(): string {
  const prefs = preferencesStore.getState().preferences
  if (prefs.defaultCwd) return prefs.defaultCwd
  return process.env.HOME || '/tmp'
}

export function createNewSession(position?: { x: number; y: number }): void {
  const cwd = getDefaultCwd()
  const { snapToGrid } = gridStore.getState()

  // Use provided position or viewport center, then snap to grid
  const rawPos = position ?? getViewportCenter()
  const snappedPos = {
    x: snapToGrid(rawPos.x),
    y: snapToGrid(rawPos.y),
  }

  const session = sessionStore.getState().createSession(cwd, snappedPos)
  window.smokeAPI?.pty.spawn({ id: session.id, cwd })

  // Focus and bring to front
  sessionStore.getState().focusSession(session.id)
  sessionStore.getState().bringToFront(session.id)
}

export function useCreateSession(): (position?: { x: number; y: number }) => void {
  return useCallback((position?: { x: number; y: number }) => {
    createNewSession(position)
  }, [])
}
