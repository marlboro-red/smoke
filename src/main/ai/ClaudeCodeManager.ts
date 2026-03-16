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
import type {
  AiStreamEvent,
  AiStreamTextDelta,
  AiStreamToolUse,
  AiStreamToolResult,
  AiStreamMessageComplete,
  AiStreamError,
} from '../../preload/types'
import { McpBridge } from './McpBridge'
import { terminalOutputBuffer } from './TerminalOutputBuffer'
import { configStore, defaultPreferences } from '../config/ConfigStore'

interface ConversationState {
  id: string
  sessionId: string // Claude Code session-id
  process: ChildProcess | null
}

/** Maximum number of idle conversations to keep per agent. */
const MAX_CONVERSATIONS = 50

export class ClaudeCodeManager {
  private conversations = new Map<string, ConversationState>()
  private getMainWindow: () => BrowserWindow | null
  private mcpBridge: McpBridge
  private mcpConfigPath: string | null = null

  /** Unique identifier for this agent instance. */
  readonly agentId: string

  /** Human-readable name for this agent. */
  name: string

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

    if (!conv) {
      conv = {
        id: convId,
        sessionId: `smoke-${this.agentId}-${convId}`,
        process: null,
      }
      this.conversations.set(convId, conv)
      this.evictOldConversations()
    }

    // Kill any existing process for this conversation
    if (conv.process) {
      conv.process.kill('SIGTERM')
      conv.process = null
    }

    try {
      await this.runClaude(conv, message)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'aborted') {
        // User aborted — not an error
      } else {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
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
    if (conversationId) {
      const conv = this.conversations.get(conversationId)
      if (conv?.process) {
        conv.process.kill('SIGTERM')
        conv.process = null
      }
    } else {
      for (const conv of this.conversations.values()) {
        if (conv.process) {
          conv.process.kill('SIGTERM')
          conv.process = null
        }
      }
    }
  }

  /** Clear conversation history by removing the session. */
  clear(conversationId?: string): void {
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
    message: string
  ): Promise<void> {
    const mcpConfigPath = this.ensureMcpConfig()
    const claudeCmd = this.getClaudeCommand()
    const systemPrompt = this.buildSystemPrompt()

    const isFirstMessage = !this.conversations.has(conv.id) ||
      !conv.process // First time spawning for this conv

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--max-turns', '50',
      '--mcp-config', mcpConfigPath,
      '--allowedTools', 'mcp__smoke-tools__*',
    ]

    // Continue conversation if not the first message
    if (isFirstMessage) {
      args.push('--system-prompt', systemPrompt)
    } else {
      args.push('--resume', '--session-id', conv.sessionId)
    }

    // The message is the positional argument
    args.push(message)

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(claudeCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Ensure Claude Code can find its config
          HOME: os.homedir(),
        },
      })

      conv.process = proc

      let stdout = ''
      let currentToolUseId: string | null = null

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
        // Process complete lines
        const lines = stdout.split('\n')
        stdout = lines.pop() ?? '' // Keep incomplete last line

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            this.processStreamEvent(conv, event)
          } catch {
            // Non-JSON line — ignore
          }
        }
      })

      let stderr = ''
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        conv.process = null

        // Process any remaining stdout
        if (stdout.trim()) {
          try {
            const event = JSON.parse(stdout)
            this.processStreamEvent(conv, event)
          } catch {
            // ignore
          }
        }

        if (code === null || code === 0) {
          // Normal exit — emit message_complete
          this.emit({
            type: 'message_complete',
            conversationId: conv.id,
            stopReason: 'end_turn',
          })
          resolve()
        } else if (code === 143 || code === 137) {
          // SIGTERM or SIGKILL — user aborted
          reject(new Error('aborted'))
        } else {
          const errorMsg = stderr.trim() || `Claude Code exited with code ${code}`
          this.emit({
            type: 'error',
            conversationId: conv.id,
            error: errorMsg,
          })
          resolve() // Don't reject — error was already emitted
        }
      })

      proc.on('error', (err) => {
        conv.process = null
        this.emit({
          type: 'error',
          conversationId: conv.id,
          error: `Failed to spawn Claude Code: ${err.message}. Make sure 'claude' is installed and in PATH.`,
        })
        resolve()
      })
    })
  }

  /**
   * Parse a stream-json event from Claude Code and emit corresponding
   * AiStreamEvents to the renderer.
   *
   * Claude Code's stream-json format emits one JSON object per line.
   * Common event shapes:
   *   {"type":"assistant","message":{...}}       — full assistant message
   *   {"type":"content_block_start",...}          — start of content block
   *   {"type":"content_block_delta",...}          — text or input delta
   *   {"type":"result","result":"...","cost":...} — final result
   */
  private processStreamEvent(
    conv: ConversationState,
    event: Record<string, unknown>
  ): void {
    const type = event.type as string

    // Handle text content
    if (type === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined
      if (message) {
        const content = message.content as Array<Record<string, unknown>> | undefined
        if (content) {
          for (const block of content) {
            if (block.type === 'text') {
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
      // Handle subtype text (streaming text delta)
      if (event.subtype === 'text') {
        this.emit({
          type: 'text_delta',
          conversationId: conv.id,
          delta: event.text as string,
        })
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

    // Handle result event (final)
    if (type === 'result') {
      // The final result text — emit as a text delta if present
      const resultText = event.result as string | undefined
      if (resultText) {
        this.emit({
          type: 'text_delta',
          conversationId: conv.id,
          delta: resultText,
        })
      }
      // message_complete is emitted in the 'close' handler
    }
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
    }
  }
}
