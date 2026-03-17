/**
 * ClaudeCodeManager — spawns Claude Code CLI subprocesses and translates
 * their streaming output into AiStreamEvents for the renderer.
 *
 * Replaces the old AiService that called the Anthropic API directly.
 * Benefits:
 *   - No API key needed (uses Claude Code's own OAuth login)
 *   - Claude Code handles retries, context management, conversation history
 *   - Tools are provided via an MCP server
 *
 * Each agent gets its own session-id so conversations persist across messages.
 * Streaming JSON output from `claude -p --output-format stream-json` is
 * parsed line-by-line and emitted as AiStreamEvents.
 */

import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { AI_STREAM } from '../ipc/channels'
import type { AiStreamEvent } from '../../preload/types'
import { McpBridge } from './McpBridge'
import { terminalOutputBuffer } from './TerminalOutputBuffer'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import { aiLogger } from './AiLogger'

interface ConversationState {
  id: string
  sessionId: string // Claude Code session-id
  process: ChildProcess | null
  messageCount: number // Number of messages sent in this conversation
  aborted: boolean // Set when abort() is called so the close handler knows
}

/** Maximum number of idle conversations to keep per agent. */
const MAX_CONVERSATIONS = 50

/** Kill the subprocess if no stdout/stderr data arrives for this long. */
const SUBPROCESS_INACTIVITY_TIMEOUT_MS = 90_000

export class ClaudeCodeManager {
  private conversations = new Map<string, ConversationState>()
  private getMainWindow: () => BrowserWindow | null
  private mcpBridge: McpBridge
  private mcpConfigPath: string | null = null

  /** Unique identifier for this agent instance. */
  readonly agentId: string

  /** Human-readable name for this agent. */
  name: string

  /** Model override for this agent (null = use Claude Code default). */
  model: string | null = null

  constructor(
    getMainWindow: () => BrowserWindow | null,
    mcpBridge: McpBridge,
    agentId?: string,
    name?: string
  ) {
    this.getMainWindow = getMainWindow
    this.mcpBridge = mcpBridge
    this.agentId = agentId ?? uuid()
    this.name = name ?? 'Agent'
  }

  /** Send a user message and start the Claude Code subprocess. Returns the conversation ID. */
  async sendMessage(
    message: string,
    conversationId?: string
  ): Promise<string> {
    const convId = conversationId ?? uuid()
    let conv = this.conversations.get(convId)

    const isNew = !conv
    if (!conv) {
      conv = {
        id: convId,
        sessionId: uuid(),
        process: null,
        messageCount: 0,
        aborted: false,
      }
      this.conversations.set(convId, conv)
      this.evictOldConversations()
    }

    aiLogger.info('subprocess', `sendMessage (${isNew ? 'new' : 'existing'} conversation)`, {
      agentId: this.agentId,
      conversationId: convId,
      meta: { messageLength: message.length, messageCount: conv.messageCount },
    })

    // Kill any existing process for this conversation
    if (conv.process) {
      aiLogger.warn('subprocess', 'Killing existing subprocess before new send', {
        agentId: this.agentId,
        conversationId: convId,
      })
      conv.process.kill('SIGTERM')
      conv.process = null
    }

    const isFirstMessage = conv.messageCount === 0
    conv.messageCount++
    const startTime = Date.now()

    try {
      await this.runClaude(conv, message, isFirstMessage)
      aiLogger.info('subprocess', `sendMessage completed`, {
        agentId: this.agentId,
        conversationId: convId,
        meta: { durationMs: Date.now() - startTime },
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'aborted') {
        aiLogger.info('subprocess', 'sendMessage aborted by user', {
          agentId: this.agentId,
          conversationId: convId,
          meta: { durationMs: Date.now() - startTime },
        })
      } else {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        aiLogger.error('subprocess', `sendMessage failed: ${errorMessage}`, {
          agentId: this.agentId,
          conversationId: convId,
          meta: { durationMs: Date.now() - startTime },
        })
        this.emit({
          type: 'error',
          conversationId: convId,
          error: errorMessage,
        })
      }
    }

    return convId
  }

  /** Abort an in-progress generation. */
  abort(conversationId?: string): void {
    aiLogger.info('subprocess', `abort (${conversationId ? 'single' : 'all'})`, {
      agentId: this.agentId,
      conversationId: conversationId ?? undefined,
    })
    if (conversationId) {
      const conv = this.conversations.get(conversationId)
      if (conv?.process) {
        conv.aborted = true
        conv.process.kill('SIGTERM')
        conv.process = null
      }
    } else {
      for (const conv of this.conversations.values()) {
        if (conv.process) {
          conv.aborted = true
          conv.process.kill('SIGTERM')
          conv.process = null
        }
      }
    }
  }

  /** Clear conversation history by removing the session. */
  clear(conversationId?: string): void {
    aiLogger.info('subprocess', `clear (${conversationId ? 'single' : 'all'})`, {
      agentId: this.agentId,
      conversationId: conversationId ?? undefined,
    })
    if (conversationId) {
      this.abort(conversationId)
      this.conversations.delete(conversationId)
    } else {
      this.abort()
      this.conversations.clear()
    }
  }

  /** Evict oldest idle conversations when the map exceeds MAX_CONVERSATIONS. */
  private evictOldConversations(): void {
    if (this.conversations.size <= MAX_CONVERSATIONS) return
    for (const [id, conv] of this.conversations) {
      if (this.conversations.size <= MAX_CONVERSATIONS) break
      // Skip conversations with an active subprocess
      if (conv.process) continue
      this.conversations.delete(id)
    }
  }

  /**
   * Dispose this manager: abort all conversations and remove the temp MCP
   * config file from disk. Call this when the agent is being removed.
   */
  dispose(): void {
    this.clear()
    if (this.mcpConfigPath) {
      try {
        fs.unlinkSync(this.mcpConfigPath)
      } catch {
        // File may already be gone — ignore
      }
      this.mcpConfigPath = null
    }
  }

  /** Ensure the MCP config file exists. Returns its path. */
  private ensureMcpConfig(): string {
    if (this.mcpConfigPath && fs.existsSync(this.mcpConfigPath)) {
      return this.mcpConfigPath
    }

    const mcpServerPath = this.getMcpServerPath()
    const config = {
      mcpServers: {
        'smoke-tools': {
          command: 'node',
          args: [mcpServerPath],
          env: {
            SMOKE_BRIDGE_PORT: String(this.mcpBridge.port),
            SMOKE_AGENT_ID: this.agentId,
          },
        },
      },
    }

    const tmpDir = os.tmpdir()
    const configPath = path.join(tmpDir, `smoke-mcp-${this.agentId}.json`)
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    this.mcpConfigPath = configPath
    return configPath
  }

  /** Resolve the path to the compiled mcp-server.js. */
  private getMcpServerPath(): string {
    if (app.isPackaged) {
      return path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'out',
        'main',
        'mcp-server.js'
      )
    }
    // Dev mode — compiled output sits next to the main bundle
    return path.join(__dirname, 'mcp-server.js')
  }

  /** Build a system prompt with canvas context. */
  private buildSystemPrompt(): string {
    const sessions = terminalOutputBuffer.sessions()
    const parts: string[] = [
      `You are "${this.name}", an AI agent embedded in the Smoke terminal manager.`,
      'You can manage terminal sessions on an infinite canvas using the smoke-tools MCP server.',
      '',
      `Active terminal sessions: ${sessions.length}`,
    ]

    for (const sessionId of sessions) {
      const bufferSize = terminalOutputBuffer.size(sessionId)
      parts.push(`  - Session ${sessionId} (${bufferSize} bytes buffered)`)
    }

    return parts.join('\n')
  }

  /** Get the claude command from preferences. */
  private getClaudeCommand(): string {
    const prefs = configStore.get('preferences', defaultPreferences) as Record<
      string,
      unknown
    >
    return (prefs.claudeCommand as string) || 'claude'
  }

  /** Spawn Claude Code and process its stream-json output. */
  private async runClaude(
    conv: ConversationState,
    message: string,
    isFirstMessage: boolean
  ): Promise<void> {
    const mcpConfigPath = this.ensureMcpConfig()
    const claudeCmd = this.getClaudeCommand()
    const systemPrompt = this.buildSystemPrompt()

    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--max-turns', '50',
      '--mcp-config', mcpConfigPath,
      '--allowedTools', 'mcp__smoke-tools__*',
    ]

    // Use agent-specific model if set
    if (this.model) {
      args.push('--model', this.model)
    }

    // Always pass session-id so Claude Code reuses the same session
    args.push('--session-id', conv.sessionId)

    // Continue conversation if not the first message
    if (isFirstMessage) {
      args.push('--system-prompt', systemPrompt)
    } else {
      // --fork-session is required when combining --session-id with --resume
      args.push('--resume', '--fork-session')
    }

    // The message is the positional argument
    args.push(message)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (action: 'resolve' | 'reject', value?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(inactivityTimer)
        if (action === 'resolve') resolve()
        else reject(value)
      }

      aiLogger.info('subprocess', `Spawning: ${claudeCmd} ${args.join(' ')}`, {
        agentId: this.agentId,
        conversationId: conv.id,
        meta: { isFirstMessage, model: this.model },
      })
      const spawnTime = Date.now()

      const proc = spawn(claudeCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Ensure Claude Code can find its config
          HOME: os.homedir(),
        },
      })

      conv.process = proc

      // Close stdin immediately — the message is passed as a positional
      // argument, so stdin is not needed.  Without this, the CLI may detect
      // that stdin is a pipe (not a TTY) and block waiting for input, which
      // prevents it from ever reaching the API call.  Sending EOF unblocks it.
      proc.stdin?.end()

      aiLogger.debug('subprocess', `Subprocess spawned with PID ${proc.pid}`, {
        agentId: this.agentId,
        conversationId: conv.id,
        meta: { pid: proc.pid },
      })

      // Inactivity timeout — kill the process if it produces no output
      // for an extended period (likely hung).
      let inactivityTimer: ReturnType<typeof setTimeout> = setTimeout(
        () => onInactivityTimeout(),
        SUBPROCESS_INACTIVITY_TIMEOUT_MS
      )

      const resetInactivityTimer = (): void => {
        clearTimeout(inactivityTimer)
        inactivityTimer = setTimeout(
          () => onInactivityTimeout(),
          SUBPROCESS_INACTIVITY_TIMEOUT_MS
        )
      }

      const onInactivityTimeout = (): void => {
        if (conv.process) {
          killedByInactivityTimeout = true
          aiLogger.warn('subprocess', `Inactivity timeout (${SUBPROCESS_INACTIVITY_TIMEOUT_MS}ms) — killing`, {
            agentId: this.agentId,
            conversationId: conv.id,
            meta: { pid: conv.process.pid, uptimeMs: Date.now() - spawnTime },
          })
          conv.process.kill('SIGTERM')
          // If SIGTERM doesn't work, force-kill after 5s
          setTimeout(() => {
            if (conv.process) {
              aiLogger.warn('subprocess', 'SIGTERM ineffective — sending SIGKILL', {
                agentId: this.agentId,
                conversationId: conv.id,
              })
              conv.process.kill('SIGKILL')
            }
          }, 5000)
        }
      }

      let stdout = ''
      // Track whether we received streaming text to avoid duplicating
      // the full text from assistant.message and result events.
      let hasStreamedText = false
      let streamEventCount = 0
      // Set when the inactivity timer kills the process so the close
      // handler can emit a more helpful error message.
      let killedByInactivityTimeout = false

      const processLine = (line: string): void => {
        if (!line.trim()) return
        try {
          const event = JSON.parse(line)
          streamEventCount++
          const eventType = (event as Record<string, unknown>).type as string
          const eventSubtype = (event as Record<string, unknown>).subtype as string | undefined
          aiLogger.debug('stream', `Event #${streamEventCount}: ${eventType}${eventSubtype ? '/' + eventSubtype : ''}`, {
            agentId: this.agentId,
            conversationId: conv.id,
            meta: { eventType, eventSubtype },
          })
          this.processStreamEvent(conv, event, hasStreamedText)
          if (
            (event as Record<string, unknown>).type === 'assistant' &&
            (event as Record<string, unknown>).subtype === 'text'
          ) {
            hasStreamedText = true
          }
        } catch {
          // Non-JSON line — log as dropped
          aiLogger.warn('stream', `Dropped non-JSON line: ${line.slice(0, 200)}`, {
            agentId: this.agentId,
            conversationId: conv.id,
          })
        }
      }

      proc.stdout?.on('data', (chunk: Buffer) => {
        resetInactivityTimer()
        stdout += chunk.toString()
        // Process complete lines
        const lines = stdout.split('\n')
        stdout = lines.pop() ?? '' // Keep incomplete last line

        for (const line of lines) {
          processLine(line)
        }
      })

      let stderr = ''
      proc.stderr?.on('data', (chunk: Buffer) => {
        resetInactivityTimer()
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        conv.process = null
        const durationMs = Date.now() - spawnTime

        // Process any remaining stdout (may contain multiple lines)
        if (stdout.trim()) {
          const remaining = stdout.split('\n')
          for (const line of remaining) {
            processLine(line)
          }
        }

        if (conv.aborted) {
          aiLogger.info('subprocess', `Subprocess exited (aborted by user)`, {
            agentId: this.agentId,
            conversationId: conv.id,
            meta: { code, durationMs, streamEvents: streamEventCount },
          })
          // Emit message_complete so the renderer cleans up its
          // per-agent message tracking (currentMessageIds). Without this,
          // the next message's text would be appended to the old
          // (aborted) assistant message instead of creating a new one.
          this.emit({
            type: 'message_complete',
            conversationId: conv.id,
            stopReason: 'abort',
          })
          // User-initiated abort — not an error
          conv.aborted = false
          settle('reject', new Error('aborted'))
        } else if (code === 0) {
          aiLogger.info('subprocess', `Subprocess exited normally`, {
            agentId: this.agentId,
            conversationId: conv.id,
            meta: { code, durationMs, streamEvents: streamEventCount },
          })
          // Normal exit — emit message_complete
          this.emit({
            type: 'message_complete',
            conversationId: conv.id,
            stopReason: 'end_turn',
          })
          settle('resolve')
        } else {
          // Non-zero exit or signal kill (code === null) — emit error
          // and message_complete so the renderer always leaves generating state.
          const defaultMsg = killedByInactivityTimeout
            ? `Claude Code subprocess timed out — no output for ${SUBPROCESS_INACTIVITY_TIMEOUT_MS / 1000}s`
            : code === null
              ? 'Claude Code process was killed unexpectedly'
              : `Claude Code exited with code ${code}`
          const errorMsg = stderr.trim() || defaultMsg
          aiLogger.error('subprocess', `Subprocess exited with error: ${errorMsg}`, {
            agentId: this.agentId,
            conversationId: conv.id,
            meta: { code, durationMs, streamEvents: streamEventCount, stderr: stderr.slice(0, 500), killedByInactivityTimeout },
          })
          this.emit({
            type: 'error',
            conversationId: conv.id,
            error: errorMsg,
          })
          // Also emit message_complete so the renderer always cleans up
          // its per-agent message tracking (currentMessageIds), even if
          // the error event handler doesn't clear it for some reason.
          this.emit({
            type: 'message_complete',
            conversationId: conv.id,
            stopReason: 'error',
          })
          settle('resolve') // Don't reject — error was already emitted
        }
      })

      proc.on('error', (err) => {
        conv.process = null
        aiLogger.error('subprocess', `Failed to spawn: ${err.message}`, {
          agentId: this.agentId,
          conversationId: conv.id,
          meta: { error: err.message },
        })
        this.emit({
          type: 'error',
          conversationId: conv.id,
          error: `Failed to spawn Claude Code: ${err.message}. Make sure 'claude' is installed and in PATH.`,
        })
        settle('resolve')
      })
    })
  }

  /**
   * Parse a stream-json event from Claude Code and emit corresponding
   * AiStreamEvents to the renderer.
   *
   * Claude Code's stream-json format emits one JSON object per line.
   * Common event shapes:
   *   {"type":"assistant","subtype":"text","text":"..."}  — streaming text chunk
   *   {"type":"assistant","message":{...}}                — full assistant message
   *   {"type":"content_block_delta",...}                   — text or input delta
   *   {"type":"result","result":"...","cost":...}         — final result
   *
   * Text appears in three places: streaming subtype=text events, the full
   * assistant message content, and the result event. We only emit text from
   * one source to avoid triplication. When streaming text has been received,
   * we skip the duplicate text from message.content and result.
   */
  private processStreamEvent(
    conv: ConversationState,
    event: Record<string, unknown>,
    hasStreamedText: boolean
  ): void {
    const type = event.type as string

    // Handle assistant events (streaming text + full message)
    if (type === 'assistant') {
      // Handle subtype text (streaming text delta) — primary text source
      if (event.subtype === 'text') {
        this.emit({
          type: 'text_delta',
          conversationId: conv.id,
          delta: event.text as string,
        })
      }

      // Handle full message — extract tool_use blocks always, but only
      // emit text blocks if no streaming text was received (fallback).
      const message = event.message as Record<string, unknown> | undefined
      if (message) {
        const content = message.content as Array<Record<string, unknown>> | undefined
        if (content) {
          for (const block of content) {
            if (block.type === 'text' && !hasStreamedText) {
              this.emit({
                type: 'text_delta',
                conversationId: conv.id,
                delta: block.text as string,
              })
            } else if (block.type === 'tool_use') {
              this.emit({
                type: 'tool_use',
                conversationId: conv.id,
                toolUseId: block.id as string,
                toolName: this.cleanToolName(block.name as string),
                input: block.input as Record<string, unknown>,
              })
            }
          }
        }
      }
    }

    // Handle content_block_delta (streaming deltas)
    if (type === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta') {
        this.emit({
          type: 'text_delta',
          conversationId: conv.id,
          delta: delta.text as string,
        })
      }
    }

    // Handle tool_use events
    if (type === 'tool_use') {
      this.emit({
        type: 'tool_use',
        conversationId: conv.id,
        toolUseId: (event.id as string) ?? uuid(),
        toolName: this.cleanToolName(event.name as string),
        input: (event.input as Record<string, unknown>) ?? {},
      })
    }

    // Handle tool_result events
    if (type === 'tool_result') {
      this.emit({
        type: 'tool_result',
        conversationId: conv.id,
        toolUseId: event.tool_use_id as string,
        result: event.content as string,
        isError: (event.is_error as boolean) ?? false,
      })
    }

    // Handle result event (final) — text is always a duplicate of either
    // streaming text or message.content, so we never re-emit it here.
    // message_complete is emitted in the 'close' handler.
  }

  /**
   * Strip the MCP server prefix from tool names.
   * Claude Code prefixes MCP tool names: `mcp__smoke-tools__spawn_terminal`
   * We want just `spawn_terminal` for display.
   */
  private cleanToolName(name: string): string {
    const match = name.match(/^mcp__[^_]+__(.+)$/)
    return match ? match[1] : name
  }

  /** Send a stream event to the renderer, tagged with this agent's ID. */
  private emit(event: AiStreamEvent): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      const taggedEvent = { ...event, agentId: this.agentId }
      win.webContents.send(AI_STREAM, taggedEvent)
    } else {
      aiLogger.warn('stream', `Dropped event (no window): ${event.type}`, {
        agentId: this.agentId,
        conversationId: (event as { conversationId?: string }).conversationId,
        meta: { eventType: event.type },
      })
    }
  }
}
