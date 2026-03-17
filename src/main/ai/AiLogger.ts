/**
 * AiLogger — centralized structured logging for the AI Agent chat pipeline.
 *
 * Maintains a capped ring buffer of log entries accessible via IPC so
 * the renderer (dev tools or a future diagnostics panel) can inspect
 * what happened across IPC calls, subprocess lifecycle, stream events,
 * and MCP tool calls.
 *
 * All entries are also written to the main process console for immediate
 * visibility in Electron's stdout / DevTools "main" console.
 */

export type AiLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type AiLogCategory =
  | 'ipc'           // IPC send/receive events
  | 'subprocess'    // Claude Code subprocess spawn/exit/error
  | 'stream'        // Stream event processing
  | 'tool'          // MCP tool call execution
  | 'agent'         // Agent lifecycle (create/remove/scope)
  | 'mcp'           // MCP server protocol messages

export interface AiLogEntry {
  timestamp: number
  level: AiLogLevel
  category: AiLogCategory
  agentId?: string
  conversationId?: string
  message: string
  /** Arbitrary structured data — tool name, event type, duration, etc. */
  meta?: Record<string, unknown>
}

/** Maximum number of entries kept in the ring buffer. */
const MAX_ENTRIES = 1000

class AiLoggerImpl {
  private entries: AiLogEntry[] = []

  /** Append a log entry to the buffer and write to console. */
  log(
    level: AiLogLevel,
    category: AiLogCategory,
    message: string,
    opts?: {
      agentId?: string
      conversationId?: string
      meta?: Record<string, unknown>
    }
  ): void {
    const entry: AiLogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      ...opts,
    }

    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES)
    }

    // Mirror to console for dev-tools visibility
    const prefix = `[AI:${category}]`
    const ctx = entry.agentId
      ? ` agent=${entry.agentId.slice(0, 8)}`
      : ''
    const conv = entry.conversationId
      ? ` conv=${entry.conversationId.slice(0, 8)}`
      : ''
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
    const line = `${prefix}${ctx}${conv} ${message}${metaStr}`

    switch (level) {
      case 'debug':
        console.debug(line)
        break
      case 'info':
        console.log(line)
        break
      case 'warn':
        console.warn(line)
        break
      case 'error':
        console.error(line)
        break
    }
  }

  /** Convenience: log at info level. */
  info(category: AiLogCategory, message: string, opts?: Parameters<AiLoggerImpl['log']>[3]): void {
    this.log('info', category, message, opts)
  }

  /** Convenience: log at warn level. */
  warn(category: AiLogCategory, message: string, opts?: Parameters<AiLoggerImpl['log']>[3]): void {
    this.log('warn', category, message, opts)
  }

  /** Convenience: log at error level. */
  error(category: AiLogCategory, message: string, opts?: Parameters<AiLoggerImpl['log']>[3]): void {
    this.log('error', category, message, opts)
  }

  /** Convenience: log at debug level. */
  debug(category: AiLogCategory, message: string, opts?: Parameters<AiLoggerImpl['log']>[3]): void {
    this.log('debug', category, message, opts)
  }

  /**
   * Return recent log entries, optionally filtered.
   * Used by the IPC handler so the renderer can fetch logs.
   */
  getEntries(filter?: {
    category?: AiLogCategory
    agentId?: string
    level?: AiLogLevel
    since?: number
    limit?: number
  }): AiLogEntry[] {
    let result = this.entries

    if (filter?.category) {
      result = result.filter((e) => e.category === filter.category)
    }
    if (filter?.agentId) {
      result = result.filter((e) => e.agentId === filter.agentId)
    }
    if (filter?.level) {
      result = result.filter((e) => e.level === filter.level)
    }
    if (filter?.since) {
      result = result.filter((e) => e.timestamp >= filter.since!)
    }

    const limit = filter?.limit ?? 200
    if (result.length > limit) {
      result = result.slice(result.length - limit)
    }

    return result
  }

  /** Clear all buffered entries. */
  clear(): void {
    this.entries = []
  }

  /** Current buffer size (for diagnostics). */
  get size(): number {
    return this.entries.length
  }
}

/** Singleton logger instance used across the AI pipeline. */
export const aiLogger = new AiLoggerImpl()
