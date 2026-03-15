import { useEffect } from 'react'
import type { AiStreamCanvasAction } from '../../preload/types'
import type { TerminalSession } from '../stores/sessionStore'
import { sessionStore } from '../stores/sessionStore'
import { setPanTo } from '../canvas/useCanvasControls'
import { closeSession } from '../session/useSessionClose'

interface SessionCreatedPayload {
  sessionId: string
  cwd: string
  position: { x: number; y: number }
  size?: { cols: number; rows: number; width: number; height: number }
}

interface SessionMovedPayload {
  sessionId: string
  position: { x: number; y: number }
}

interface SessionResizedPayload {
  sessionId: string
  size: { cols: number; rows: number; width: number; height: number }
}

interface SessionClosedPayload {
  sessionId: string
}

interface ViewportPannedPayload {
  panX: number
  panY: number
}

export function handleCanvasAction(event: AiStreamCanvasAction): void {
  switch (event.action) {
    case 'session_created': {
      const { sessionId, cwd, position, size } = event.payload as unknown as SessionCreatedPayload
      // The main process has already spawned the PTY — we just register it in the store
      const session: TerminalSession = {
        id: sessionId,
        type: 'terminal',
        title: cwd.split('/').pop() || cwd,
        cwd,
        position,
        size: size ?? { cols: 80, rows: 24, width: 640, height: 480 },
        zIndex: 0, // bringToFront will set the correct value
        status: 'running',
        createdAt: Date.now(),
      }
      sessionStore.setState((state) => {
        const sessions = new Map(state.sessions)
        sessions.set(sessionId, session)
        return { sessions }
      })
      sessionStore.getState().focusSession(sessionId)
      sessionStore.getState().bringToFront(sessionId)
      break
    }

    case 'session_moved': {
      const { sessionId, position } = event.payload as unknown as SessionMovedPayload
      sessionStore.getState().updateSession(sessionId, { position })
      break
    }

    case 'session_resized': {
      const { sessionId, size } = event.payload as unknown as SessionResizedPayload
      sessionStore.getState().updateSession(sessionId, { size })
      break
    }

    case 'session_closed': {
      const { sessionId } = event.payload as unknown as SessionClosedPayload
      closeSession(sessionId)
      break
    }

    case 'viewport_panned': {
      const { panX, panY } = event.payload as unknown as ViewportPannedPayload
      // setPanTo updates the ref + CSS transform + syncs to store
      setPanTo(panX, panY)
      break
    }
  }
}

export function useAiCanvasActions(): void {
  useEffect(() => {
    const unsubscribe = window.smokeAPI?.ai.onCanvasAction(handleCanvasAction)
    return () => {
      unsubscribe?.()
    }
  }, [])
}
