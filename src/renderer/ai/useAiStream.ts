import { useEffect, useRef } from 'react'
import type { AiStreamEvent } from '../../preload/types'
import { agentStore } from '../stores/agentStore'

/**
 * Connects window.smokeAPI.ai.onStream to agentStore, dispatching
 * text_delta, tool_use, tool_result, and message_complete events
 * to the correct agent based on agentId.
 *
 * Tracks per-agent current assistant message IDs so streaming deltas
 * are appended to the correct message.
 */
export function useAiStream(): void {
  const currentMessageIds = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const handleStreamEvent = (event: AiStreamEvent): void => {
      const agentId = (event as { agentId?: string }).agentId
      if (!agentId) return

      const store = agentStore.getState()

      switch (event.type) {
        case 'text_delta': {
          if (!currentMessageIds.current.has(agentId)) {
            const msg = store.addAssistantMessage(agentId)
            if (msg) currentMessageIds.current.set(agentId, msg.id)
          }
          const msgId = currentMessageIds.current.get(agentId)
          if (msgId) store.appendText(agentId, msgId, event.delta)
          break
        }

        case 'tool_use': {
          if (!currentMessageIds.current.has(agentId)) {
            const msg = store.addAssistantMessage(agentId)
            if (msg) currentMessageIds.current.set(agentId, msg.id)
          }
          const msgId = currentMessageIds.current.get(agentId)
          if (msgId) {
            store.addToolUse(agentId, msgId, {
              id: event.toolUseId,
              name: event.toolName,
              input: event.input,
            })
          }
          break
        }

        case 'tool_result': {
          const msgId = currentMessageIds.current.get(agentId)
          if (!msgId) break
          store.addToolResult(agentId, msgId, {
            tool_use_id: event.toolUseId,
            content: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
            is_error: event.isError,
          })
          break
        }

        case 'message_complete': {
          store.completeGeneration(agentId)
          currentMessageIds.current.delete(agentId)
          break
        }

        case 'error': {
          store.setError(agentId, event.error)
          currentMessageIds.current.delete(agentId)
          break
        }

        // canvas_action events are handled by useAiCanvasActions
      }
    }

    const unsubscribe = window.smokeAPI?.ai.onStream(handleStreamEvent)
    return () => {
      unsubscribe?.()
    }
  }, [])
}
