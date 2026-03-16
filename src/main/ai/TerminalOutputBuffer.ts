/**
 * Chunked ring buffer that captures PTY output per session, strips ANSI escape
 * codes, and retains the last ~50KB (measured in actual UTF-8 bytes) per terminal.
 * Designed to let the AI orchestrator read terminal output without going through
 * the renderer.
 *
 * Uses an array-of-chunks design to avoid full-string copies on every append.
 * Size is tracked via Buffer.byteLength for byte-accurate enforcement.
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

/**
 * Fast UTF-8 byte length: for ASCII-only strings (the common case for
 * terminal output), string.length === byte length — skip the Buffer allocation.
 */
export function fastByteLength(str: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      return Buffer.byteLength(str, 'utf8')
    }
  }
  return str.length
}

interface ChunkedBuffer {
  chunks: string[]
  totalBytes: number
}

export class TerminalOutputBuffer {
  private buffers = new Map<string, ChunkedBuffer>()
  private maxBytes: number

  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes
  }

  /** Append raw PTY output for a session. ANSI codes are stripped before storage. */
  append(sessionId: string, rawData: string): void {
    const clean = stripAnsi(rawData)
    if (clean.length === 0) return

    const cleanBytes = fastByteLength(clean)

    let buf = this.buffers.get(sessionId)
    if (!buf) {
      buf = { chunks: [], totalBytes: 0 }
      this.buffers.set(sessionId, buf)
    }

    // If a single chunk exceeds maxBytes, keep only the tail
    if (cleanBytes >= this.maxBytes) {
      const encoded = Buffer.from(clean, 'utf8')
      const trimmed = encoded.subarray(encoded.length - this.maxBytes)
      buf.chunks = [trimmed.toString('utf8')]
      buf.totalBytes = this.maxBytes
      return
    }

    buf.chunks.push(clean)
    buf.totalBytes += cleanBytes

    // Evict oldest chunks until we're within capacity
    while (buf.totalBytes > this.maxBytes) {
      const oldest = buf.chunks[0]
      const oldestBytes = fastByteLength(oldest)

      if (buf.totalBytes - oldestBytes <= this.maxBytes) {
        // Partial trim of the first chunk
        const excess = buf.totalBytes - this.maxBytes
        const encoded = Buffer.from(oldest, 'utf8')
        const trimmed = encoded.subarray(excess)
        buf.chunks[0] = trimmed.toString('utf8')
        buf.totalBytes = this.maxBytes
      } else {
        // Drop entire first chunk
        buf.chunks.shift()
        buf.totalBytes -= oldestBytes
      }
    }
  }

  /** Read the buffered output for a session. Returns empty string if none. */
  read(sessionId: string): string {
    const buf = this.buffers.get(sessionId)
    if (!buf || buf.chunks.length === 0) return ''
    return buf.chunks.join('')
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

  /** Get the byte size (UTF-8) of a session's buffer. */
  size(sessionId: string): number {
    return this.buffers.get(sessionId)?.totalBytes ?? 0
  }
}

/** Singleton instance shared across the main process. */
export const terminalOutputBuffer = new TerminalOutputBuffer()
