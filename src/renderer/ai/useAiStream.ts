import { useEffect, useRef } from 'react'
import type { AiStreamEvent } from '../../preload/types'
import { agentStore } from '../stores/agentStore'
import { addToast } from '../stores/toastStore'

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
  const eventCountRef = useRef(0)

  useEffect(() => {
    const handleStreamEvent = (event: AiStreamEvent): void => {
      const agentId = (event as { agentId?: string }).agentId
      eventCountRef.current++

      if (!agentId) {
        console.warn(
          `[useAiStream] Dropped event #${eventCountRef.current} — missing agentId`,
          { type: event.type, conversationId: event.conversationId }
        )
        return
      }

      console.debug(
        `[useAiStream] Event #${eventCountRef.current}: ${event.type}`,
        { agentId: agentId.slice(0, 8), conversationId: event.conversationId?.slice(0, 8) }
      )

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
            console.debug(`[useAiStream] Tool use: ${event.toolName}`, {
              agentId: agentId.slice(0, 8),
              toolUseId: event.toolUseId,
            })
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
          if (!msgId) {
            console.warn(`[useAiStream] Dropped tool_result — no current message for agent`, {
              agentId: agentId.slice(0, 8),
              toolUseId: event.toolUseId,
            })
            break
          }
          store.addToolResult(agentId, msgId, {
            tool_use_id: event.toolUseId,
            content: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
            is_error: event.isError,
          })
          break
        }

        case 'message_complete': {
          console.debug(`[useAiStream] Generation complete`, {
            agentId: agentId.slice(0, 8),
            stopReason: event.stopReason,
          })
          store.completeGeneration(agentId)
          currentMessageIds.current.delete(agentId)
          addToast('AI task completed', 'success')
          break
        }

        case 'error': {
          console.error(`[useAiStream] Error from agent`, {
            agentId: agentId.slice(0, 8),
            error: event.error,
          })
          store.setError(agentId, event.error)
          currentMessageIds.current.delete(agentId)
          addToast(`AI error: ${event.error}`, 'error')
          break
        }

        default: {
          // Unknown event type — log for diagnostics
          console.warn(`[useAiStream] Unknown event type: ${(event as { type: string }).type}`, {
            agentId: agentId.slice(0, 8),
          })
        }
      }
    }

    const unsubscribe = window.smokeAPI?.ai.onStream(handleStreamEvent)
    return () => {
      unsubscribe?.()
    }
  }, [])
}
