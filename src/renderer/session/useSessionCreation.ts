import { useCallback } from 'react'
import { sessionStore, type Session, type FileViewerSession, type TerminalSession, type NoteSession, type ImageSession, type SnippetSession, type WebviewSession } from '../stores/sessionStore'
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
  const { preferences, launchCwd } = preferencesStore.getState()
  // Prefer configured defaultCwd, then the directory smoke was launched from.
  // PtyProcess falls back to os.homedir() when cwd is empty or invalid.
  return preferences.defaultCwd || launchCwd || ''
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

export function createTerminalAtFileDir(fileSession: FileViewerSession): void {
  const { snapToGrid } = gridStore.getState()

  // Extract directory from the file path
  const lastSlash = fileSession.filePath.lastIndexOf('/')
  const cwd = lastSlash > 0 ? fileSession.filePath.slice(0, lastSlash) : fileSession.filePath

  // Position adjacent to the right of the file viewer
  const adjacentX = fileSession.position.x + fileSession.size.width + 20
  const adjacentY = fileSession.position.y

  const snappedPos = {
    x: snapToGrid(adjacentX),
    y: snapToGrid(adjacentY),
  }

  const session = sessionStore.getState().createSession(cwd, snappedPos)
  window.smokeAPI?.pty.spawn({ id: session.id, cwd })

  sessionStore.getState().focusSession(session.id)
  sessionStore.getState().bringToFront(session.id)
}

const DUPLICATE_OFFSET = 30

export function duplicateSession(sourceId: string): void {
  const state = sessionStore.getState()
  const source = state.sessions.get(sourceId)
  if (!source) return

  const { snapToGrid } = gridStore.getState()
  const pos = {
    x: snapToGrid(source.position.x + DUPLICATE_OFFSET),
    y: snapToGrid(source.position.y + DUPLICATE_OFFSET),
  }

  let newSession: Session | undefined

  switch (source.type) {
    case 'terminal': {
      const src = source as TerminalSession
      newSession = state.createSession(src.cwd, pos)
      window.smokeAPI?.pty.spawn({ id: newSession.id, cwd: src.cwd })
      break
    }
    case 'file': {
      const src = source as FileViewerSession
      newSession = state.createFileSession(src.filePath, src.content, src.language, pos)
      break
    }
    case 'note': {
      const src = source as NoteSession
      newSession = state.createNoteSession(pos, src.color)
      if (src.content) {
        state.updateSession(newSession.id, { content: src.content })
      }
      break
    }
    case 'image': {
      const src = source as ImageSession
      newSession = state.createImageSession(src.filePath, src.dataUrl, src.naturalWidth, src.naturalHeight, pos)
      break
    }
    case 'snippet': {
      const src = source as SnippetSession
      newSession = state.createSnippetSession(src.language, src.content, pos)
      break
    }
    case 'webview': {
      const src = source as WebviewSession
      newSession = state.createWebviewSession(src.url, pos)
      break
    }
  }

  if (newSession) {
    state.focusSession(newSession.id)
    state.bringToFront(newSession.id)
  }
}

export function useCreateSession(): (position?: { x: number; y: number }) => void {
  return useCallback((position?: { x: number; y: number }) => {
    createNewSession(position)
  }, [])
}
