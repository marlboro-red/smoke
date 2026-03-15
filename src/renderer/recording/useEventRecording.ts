import { useEffect } from 'react'
import { sessionStore, type Session } from '../stores/sessionStore'
import { canvasStore } from '../stores/canvasStore'
import { aiStore, type ChatMessage } from '../stores/aiStore'
import { snapshotStore } from '../stores/snapshotStore'
import { eventRecorder } from './EventRecorder'

function extractText(msg: ChatMessage): string {
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
}

/**
 * Hook that subscribes to store changes and records canvas events.
 * Mount once in App.tsx.
 */
export function useEventRecording(): void {
  useEffect(() => {
    // Track previous state for diff detection
    let prevSessions = new Map<string, Session>(sessionStore.getState().sessions)
    let prevViewport = {
      panX: canvasStore.getState().panX,
      panY: canvasStore.getState().panY,
      zoom: canvasStore.getState().zoom,
    }
    let prevMessageCount = aiStore.getState().messages.length
    let prevSnapshots = new Map<string, string[]>(snapshotStore.getState().snapshots)

    const unsubSession = sessionStore.subscribe((state) => {
      const current = state.sessions

      // Detect new sessions
      for (const [id, session] of current) {
        if (!prevSessions.has(id)) {
          eventRecorder.record('session_created', {
            sessionId: id,
            type: session.type,
            title: session.title,
            cwd: session.type === 'terminal' ? session.cwd : undefined,
            filePath: session.type === 'file' ? session.filePath : undefined,
            url: session.type === 'webview' ? session.url : undefined,
            position: { ...session.position },
            size: { ...session.size },
          })
        }
      }

      // Detect removed sessions
      for (const [id, prev] of prevSessions) {
        if (!current.has(id)) {
          eventRecorder.record('session_closed', {
            sessionId: id,
            exitCode: prev.type === 'terminal' ? prev.exitCode : undefined,
          })
        }
      }

      // Detect moved and resized sessions
      for (const [id, session] of current) {
        const prev = prevSessions.get(id)
        if (!prev) continue

        if (prev.position.x !== session.position.x || prev.position.y !== session.position.y) {
          eventRecorder.record('session_moved', {
            sessionId: id,
            from: { ...prev.position },
            to: { ...session.position },
          })
        }

        if (
          prev.size.width !== session.size.width ||
          prev.size.height !== session.size.height ||
          prev.size.cols !== session.size.cols ||
          prev.size.rows !== session.size.rows
        ) {
          eventRecorder.record('session_resized', {
            sessionId: id,
            from: { ...prev.size },
            to: { ...session.size },
          })
        }
      }

      prevSessions = new Map(current)
    })

    const unsubCanvas = canvasStore.subscribe((state) => {
      const { panX, panY, zoom } = state
      if (panX !== prevViewport.panX || panY !== prevViewport.panY || zoom !== prevViewport.zoom) {
        eventRecorder.record('viewport_changed', { panX, panY, zoom })
        prevViewport = { panX, panY, zoom }
      }
    })

    const unsubAi = aiStore.subscribe((state) => {
      const { messages } = state
      if (messages.length > prevMessageCount) {
        // Record any newly added messages
        for (let i = prevMessageCount; i < messages.length; i++) {
          const msg = messages[i]
          const text = extractText(msg)
          if (text) {
            eventRecorder.record('ai_message', {
              conversationId: msg.id,
              role: msg.role,
              text,
            })
          }
        }
      }
      prevMessageCount = messages.length
    })

    const unsubSnapshot = snapshotStore.subscribe((state) => {
      const { snapshots } = state
      for (const [sessionId, lines] of snapshots) {
        const prev = prevSnapshots.get(sessionId)
        // Only record if lines actually changed (reference comparison is fine — store creates new arrays)
        if (prev !== lines) {
          eventRecorder.record('terminal_snapshot', { sessionId, lines: [...lines] })
        }
      }
      prevSnapshots = new Map(snapshots)
    })

    return () => {
      unsubSession()
      unsubCanvas()
      unsubAi()
      unsubSnapshot()
    }
  }, [])
}
