/**
 * Ring buffer that captures PTY output per session, strips ANSI escape codes,
 * and retains the last ~50KB per terminal. Designed to let the AI orchestrator
 * read terminal output without going through the renderer.
 */

const DEFAULT_MAX_BYTES = 50 * 1024 // 50KB

// Matches all common ANSI escape sequences:
// - CSI sequences: ESC [ ... <final byte>
// - OSC sequences: ESC ] ... (ST | BEL)
// - Simple two-byte escapes: ESC <char>
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#][0-9A-Za-z]|\x1b[A-Za-z]|\x0d/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

export class TerminalOutputBuffer {
  private buffers = new Map<string, string>()
  private maxBytes: number

  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes
  }

  /** Append raw PTY output for a session. ANSI codes are stripped before storage. */
  append(sessionId: string, rawData: string): void {
    const clean = stripAnsi(rawData)
    if (clean.length === 0) return

    const existing = this.buffers.get(sessionId) ?? ''
    let combined = existing + clean

    // Trim from the front if over capacity
    if (combined.length > this.maxBytes) {
      combined = combined.slice(combined.length - this.maxBytes)
    }

    this.buffers.set(sessionId, combined)
  }

  /** Read the buffered output for a session. Returns empty string if none. */
  read(sessionId: string): string {
    return this.buffers.get(sessionId) ?? ''
  }

  /** Read the last N lines of output for a session. */
  readLines(sessionId: string, lineCount: number): string {
    const content = this.read(sessionId)
    if (!content) return ''
    const lines = content.split('\n')
    return lines.slice(-lineCount).join('\n')
  }

  /** Remove the buffer for a session (called on PTY exit). */
  delete(sessionId: string): void {
    this.buffers.delete(sessionId)
  }

  /** Clear all buffers. */
  clear(): void {
    this.buffers.clear()
  }

  /** List all session IDs with active buffers. */
  sessions(): string[] {
    return Array.from(this.buffers.keys())
  }

  /** Get the byte size of a session's buffer. */
  size(sessionId: string): number {
    return this.buffers.get(sessionId)?.length ?? 0
  }
}

/** Singleton instance shared across the main process. */
export const terminalOutputBuffer = new TerminalOutputBuffer()
