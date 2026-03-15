import { useEffect, useRef } from 'react'
import type { AiStreamEvent } from '../../preload/types'
import { aiStore } from '../stores/aiStore'

/**
 * Connects window.smokeAPI.ai.onStream to aiStore, dispatching
 * text_delta, tool_use, tool_result, and message_complete events.
 *
 * Tracks the current assistant message ID so streaming deltas
 * are appended to the correct message.
 */
export function useAiStream(): void {
  const currentMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    const handleStreamEvent = (event: AiStreamEvent): void => {
      const store = aiStore.getState()

      switch (event.type) {
        case 'text_delta': {
          // Create assistant message on first delta if needed
          if (!currentMessageIdRef.current) {
            const msg = store.addAssistantMessage()
            currentMessageIdRef.current = msg.id
          }
          store.appendText(currentMessageIdRef.current, event.delta)
          break
        }

        case 'tool_use': {
          if (!currentMessageIdRef.current) {
            const msg = store.addAssistantMessage()
            currentMessageIdRef.current = msg.id
          }
          store.addToolUse(currentMessageIdRef.current, {
            id: event.toolUseId,
            name: event.toolName,
            input: event.input,
          })
          break
        }

        case 'tool_result': {
          if (!currentMessageIdRef.current) break
          store.addToolResult(currentMessageIdRef.current, {
            tool_use_id: event.toolUseId,
            content: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
            is_error: event.isError,
          })
          break
        }

        case 'message_complete': {
          store.completeGeneration()
          currentMessageIdRef.current = null
          break
        }

        case 'error': {
          store.setError(event.error)
          currentMessageIdRef.current = null
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
