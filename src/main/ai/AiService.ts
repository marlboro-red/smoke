/**
 * Core AI service for the main process.
 *
 * Holds the Anthropic client, per-conversation history, and abort controllers.
 * Implements the streaming message loop:
 *   send messages with tools → receive response →
 *   if tool_use, execute tools and continue → if end_turn, complete.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { AI_STREAM } from '../ipc/channels'
import type {
  AiStreamEvent,
  AiStreamTextDelta,
  AiStreamToolUse,
  AiStreamMessageComplete,
  AiStreamError,
} from '../../preload/types'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import { terminalOutputBuffer } from './TerminalOutputBuffer'

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type ToolExecutor = (
  input: Record<string, unknown>
) => Promise<string>

interface ConversationState {
  id: string
  history: Anthropic.MessageParam[]
  abortController: AbortController | null
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 4096

export class AiService {
  private client: Anthropic | null = null
  private conversations = new Map<string, ConversationState>()
  private getMainWindow: () => BrowserWindow | null
  private tools: Anthropic.Tool[] = []
  private toolExecutors = new Map<string, ToolExecutor>()

  /** Unique identifier for this agent instance. */
  readonly agentId: string

  /** Human-readable name for this agent. */
  name: string

  constructor(
    getMainWindow: () => BrowserWindow | null,
    agentId?: string,
    name?: string
  ) {
    this.getMainWindow = getMainWindow
    this.agentId = agentId ?? uuid()
    this.name = name ?? 'Agent'
  }

  /** Register a tool the AI can call. */
  registerTool(definition: ToolDefinition, executor: ToolExecutor): void {
    this.tools.push({
      name: definition.name,
      description: definition.description,
      input_schema: definition.input_schema as Anthropic.Tool['input_schema'],
    })
    this.toolExecutors.set(definition.name, executor)
  }

  /** Send a user message and run the agentic loop. Returns the conversation ID. */
  async sendMessage(
    message: string,
    conversationId?: string
  ): Promise<string> {
    const convId = conversationId ?? uuid()
    const conv = this.getOrCreateConversation(convId)

    conv.history.push({ role: 'user', content: message })

    // Create a new abort controller for this generation
    conv.abortController = new AbortController()

    try {
      await this.runAgentLoop(conv)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User aborted — not an error
      } else {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        this.emit({
          type: 'error',
          conversationId: convId,
          error: errorMessage,
          code: (err as { status?: number })?.status?.toString(),
        })
      }
    } finally {
      conv.abortController = null
    }

    return convId
  }

  /** Abort an in-progress generation. */
  abort(conversationId?: string): void {
    if (conversationId) {
      const conv = this.conversations.get(conversationId)
      conv?.abortController?.abort()
    } else {
      // Abort all active conversations
      for (const conv of this.conversations.values()) {
        conv.abortController?.abort()
      }
    }
  }

  /** Clear conversation history. */
  clear(conversationId?: string): void {
    if (conversationId) {
      this.conversations.delete(conversationId)
    } else {
      // Abort everything first
      this.abort()
      this.conversations.clear()
    }
  }

  /** Get the current AI config from preferences. */
  getConfig(): { model: string; apiKey: string; maxTokens: number } {
    const prefs = configStore.get('preferences', defaultPreferences) as Record<
      string,
      unknown
    >
    return {
      model: (prefs.aiModel as string) ?? DEFAULT_MODEL,
      apiKey: (prefs.aiApiKey as string) ?? '',
      maxTokens: (prefs.aiMaxTokens as number) ?? DEFAULT_MAX_TOKENS,
    }
  }

  /** Update a single AI config value in preferences. */
  setConfig(key: string, value: unknown): void {
    const validKeys = ['aiModel', 'aiApiKey', 'aiMaxTokens']
    if (!validKeys.includes(key)) return
    configStore.set(`preferences.${key}` as never, value as never)
    // Invalidate client so it picks up new API key
    if (key === 'aiApiKey') {
      this.client = null
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  private getOrCreateConversation(id: string): ConversationState {
    let conv = this.conversations.get(id)
    if (!conv) {
      conv = { id, history: [], abortController: null }
      this.conversations.set(id, conv)
    }
    return conv
  }

  private ensureClient(): Anthropic {
    if (this.client) return this.client
    const { apiKey } = this.getConfig()
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not configured. Set it in Settings → AI.'
      )
    }
    this.client = new Anthropic({ apiKey })
    return this.client
  }

  private buildSystemPrompt(): string {
    // Build a canvas state snapshot so the AI knows what's on screen
    const sessions = terminalOutputBuffer.sessions()
    const parts: string[] = [
      `You are "${this.name}", an AI agent (ID: ${this.agentId}) embedded in the Smoke terminal manager.`,
      'You can manage terminal sessions on an infinite canvas.',
      '',
      `Active terminal sessions: ${sessions.length}`,
    ]

    for (const sessionId of sessions) {
      const bufferSize = terminalOutputBuffer.size(sessionId)
      parts.push(`  - Session ${sessionId} (${bufferSize} bytes buffered)`)
    }

    return parts.join('\n')
  }

  /** Core agentic loop: stream response, handle tool use, repeat. */
  private async runAgentLoop(conv: ConversationState): Promise<void> {
    const client = this.ensureClient()
    const config = this.getConfig()

    while (true) {
      // Check for abort before each API call
      if (conv.abortController?.signal.aborted) return

      const stream = await client.messages.stream(
        {
          model: config.model,
          max_tokens: config.maxTokens,
          system: this.buildSystemPrompt(),
          messages: conv.history,
          tools: this.tools.length > 0 ? this.tools : undefined,
        },
        { signal: conv.abortController?.signal }
      )

      const contentBlocks: Anthropic.ContentBlock[] = []
      let stopReason: string | null = null

      // Process the stream
      for await (const event of stream) {
        if (conv.abortController?.signal.aborted) return

        if (event.type === 'content_block_delta') {
          const delta = event.delta
          if (delta.type === 'text_delta') {
            this.emit({
              type: 'text_delta',
              conversationId: conv.id,
              delta: delta.text,
            })
          } else if (delta.type === 'input_json_delta') {
            // JSON input is being built incrementally — we emit when complete
          }
        } else if (event.type === 'content_block_stop') {
          // Collect the finalized content block from the accumulated message
        } else if (event.type === 'message_stop') {
          // Final message — get full content blocks from the accumulated response
        }
      }

      // Get the final message
      const finalMessage = await stream.finalMessage()
      stopReason = finalMessage.stop_reason

      // Collect content blocks from the final message
      for (const block of finalMessage.content) {
        contentBlocks.push(block)
      }

      // Add assistant response to history
      conv.history.push({
        role: 'assistant',
        content: contentBlocks,
      })

      // Emit tool_use events for any tool calls
      const toolUseBlocks = contentBlocks.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )
      for (const toolUse of toolUseBlocks) {
        this.emit({
          type: 'tool_use',
          conversationId: conv.id,
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
        })
      }

      // If stop reason is end_turn or max_tokens, we're done
      if (stopReason !== 'tool_use') {
        this.emit({
          type: 'message_complete',
          conversationId: conv.id,
          stopReason: (stopReason as AiStreamMessageComplete['stopReason']) ?? 'end_turn',
        })
        return
      }

      // Execute tools and build tool results
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUseBlocks) {
        const executor = this.toolExecutors.get(toolUse.name)
        let result: string
        let isError = false

        if (!executor) {
          result = `Unknown tool: ${toolUse.name}`
          isError = true
        } else {
          try {
            result = await executor(
              toolUse.input as Record<string, unknown>
            )
          } catch (err: unknown) {
            result =
              err instanceof Error ? err.message : 'Tool execution failed'
            isError = true
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError,
        })

        // Emit tool result event to renderer
        this.emit({
          type: 'tool_result',
          conversationId: conv.id,
          toolUseId: toolUse.id,
          result,
          isError,
        })
      }

      // Add tool results to history and loop
      conv.history.push({ role: 'user', content: toolResults })
    }
  }

  /** Send a stream event to the renderer, tagged with this agent's ID. */
  private emit(event: AiStreamEvent): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      const taggedEvent = { ...event, agentId: this.agentId }
      win.webContents.send(AI_STREAM, taggedEvent)
    }
  }
}
