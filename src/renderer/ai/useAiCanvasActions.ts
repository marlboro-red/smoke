import { useEffect } from 'react'
import type { AiStreamCanvasAction } from '../../preload/types'
import type { FileViewerSession, NoteSession, TerminalSession } from '../stores/sessionStore'
import { findFileSessionByPath, sessionStore } from '../stores/sessionStore'
import { connectorStore } from '../stores/connectorStore'
import { groupStore } from '../stores/groupStore'
import { setPanTo } from '../canvas/useCanvasControls'
import { closeSession } from '../session/useSessionClose'
import { broadcastToGroup } from '../terminal/usePty'

interface SessionCreatedPayload {
  sessionId: string
  cwd: string
  position: { x: number; y: number }
  size?: { cols: number; rows: number; width: number; height: number }
  agentId?: string
  groupId?: string
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

interface NoteCreatedPayload {
  noteId: string
  text: string
  position: { x: number; y: number }
  color: string
}

interface FileEditedPayload {
  filePath: string
  content: string
  language: string
  position: { x: number; y: number }
}

interface ConnectorCreatedPayload {
  connectorId: string
  sourceId: string
  targetId: string
  label?: string
  color?: string
}

interface GroupCreatedPayload {
  groupId: string
  name: string
  color?: string
}

interface GroupMemberAddedPayload {
  groupId: string
  elementId: string
}

interface GroupBroadcastPayload {
  groupId: string
  command: string
}

export function handleCanvasAction(event: AiStreamCanvasAction): void {
  switch (event.action) {
    case 'session_created': {
      const { sessionId, cwd, position, size, groupId } = event.payload as unknown as SessionCreatedPayload
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
        groupId: groupId ?? undefined,
      }
      sessionStore.setState((state) => {
        const sessions = new Map(state.sessions)
        sessions.set(sessionId, session)
        return { sessions }
      })
      sessionStore.getState().focusSession(sessionId)
      sessionStore.getState().bringToFront(sessionId)

      // Auto-add to the agent's assigned group
      if (groupId) {
        const group = groupStore.getState().groups.get(groupId)
        if (group) {
          groupStore.getState().addMember(groupId, sessionId)
        }
      }
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

    case 'note_created': {
      const { noteId, text, position, color } = event.payload as unknown as NoteCreatedPayload
      const note: NoteSession = {
        id: noteId,
        type: 'note',
        title: 'Note',
        content: text,
        color,
        position,
        size: { cols: 0, rows: 0, width: 240, height: 200 },
        zIndex: 0,
        createdAt: Date.now(),
      }
      sessionStore.setState((state) => {
        const sessions = new Map(state.sessions)
        sessions.set(noteId, note)
        return { sessions }
      })
      sessionStore.getState().bringToFront(noteId)
      break
    }

    case 'connector_created': {
      const { connectorId, sourceId, targetId, label, color } =
        event.payload as unknown as ConnectorCreatedPayload
      const connector = {
        id: connectorId,
        sourceId,
        targetId,
        label,
        color: color ?? 'var(--accent-strong, #7aa2f7)',
      }
      connectorStore.setState((state) => {
        const connectors = new Map(state.connectors)
        connectors.set(connectorId, connector)
        return { connectors }
      })
      break
    }

    case 'group_created': {
      const { groupId, name, color } = event.payload as unknown as GroupCreatedPayload
      // Use the store's createGroup, then update the ID to match the one from main
      const group = groupStore.getState().createGroup(name, color)
      // Replace the auto-generated ID with the one from the AI tool
      if (group.id !== groupId) {
        groupStore.setState((state) => {
          const groups = new Map(state.groups)
          const created = groups.get(group.id)
          if (created) {
            groups.delete(group.id)
            groups.set(groupId, { ...created, id: groupId })
          }
          return { groups }
        })
      }
      break
    }

    case 'group_member_added': {
      const { groupId, elementId } = event.payload as unknown as GroupMemberAddedPayload
      groupStore.getState().addMember(groupId, elementId)
      break
    }

    case 'group_broadcast': {
      const { groupId, command } = event.payload as unknown as GroupBroadcastPayload
      broadcastToGroup(groupId, command)
      break
    }

    case 'file_edited': {
      const { filePath, content, language, position } =
        event.payload as unknown as FileEditedPayload

      // Check if a file viewer for this path is already open
      const existing = findFileSessionByPath(filePath)
      if (existing) {
        // Update content in the existing viewer
        sessionStore.getState().updateSession(existing.id, { content })
        sessionStore.getState().focusSession(existing.id)
        sessionStore.getState().bringToFront(existing.id)
      } else {
        // Create a new file viewer session
        const session = sessionStore.getState().createFileSession(
          filePath,
          content,
          language,
          position
        )
        sessionStore.getState().focusSession(session.id)
        sessionStore.getState().bringToFront(session.id)
      }
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
