/**
 * PtyDataBatcher — batches PTY output data and applies backpressure.
 *
 * Instead of sending every node-pty data event as an individual IPC message
 * (which can flood the renderer during heavy output), this class:
 *
 * 1. **Batches**: accumulates data chunks per session over a short window
 *    (BATCH_MS) and flushes them as a single concatenated string.
 * 2. **Backpressure**: tracks unacknowledged batches per session. When the
 *    renderer falls behind (unacked > MAX_PENDING), the PTY is paused.
 *    When it catches up (unacked < RESUME_THRESHOLD), the PTY is resumed.
 */

export interface PtyDataBatcherCallbacks {
  /** Send a batched data message to the renderer. */
  send: (id: string, data: string) => void
  /** Pause a PTY's output (backpressure). */
  pause: (id: string) => void
  /** Resume a PTY's output. */
  resume: (id: string) => void
}

interface SessionState {
  buffer: string
  timer: ReturnType<typeof setTimeout> | null
  unacked: number
  paused: boolean
}

export class PtyDataBatcher {
  private sessions = new Map<string, SessionState>()

  /** Batch window in milliseconds. */
  static readonly BATCH_MS = 4

  /** Pause PTY when this many batches are unacknowledged. */
  static readonly MAX_PENDING = 8

  /** Resume PTY when unacked count drops to this. */
  static readonly RESUME_THRESHOLD = 3

  constructor(private readonly callbacks: PtyDataBatcherCallbacks) {}

  /** Push a data chunk from a PTY. It will be batched and flushed after BATCH_MS. */
  push(id: string, data: string): void {
    let state = this.sessions.get(id)
    if (!state) {
      state = { buffer: '', timer: null, unacked: 0, paused: false }
      this.sessions.set(id, state)
    }

    state.buffer += data

    if (state.timer === null) {
      state.timer = setTimeout(() => this.flush(id), PtyDataBatcher.BATCH_MS)
    }
  }

  /** Called by the renderer (via IPC) to acknowledge receipt of a batch. */
  ack(id: string): void {
    const state = this.sessions.get(id)
    if (!state) return

    if (state.unacked > 0) {
      state.unacked--
    }

    if (state.paused && state.unacked <= PtyDataBatcher.RESUME_THRESHOLD) {
      state.paused = false
      this.callbacks.resume(id)
    }
  }

  /** Clean up when a PTY exits. */
  remove(id: string): void {
    const state = this.sessions.get(id)
    if (!state) return

    if (state.timer !== null) {
      clearTimeout(state.timer)
    }
    this.sessions.delete(id)
  }

  /** Flush all pending buffers (e.g. before shutdown). */
  flushAll(): void {
    for (const id of this.sessions.keys()) {
      this.flush(id)
    }
  }

  private flush(id: string): void {
    const state = this.sessions.get(id)
    if (!state) return

    state.timer = null

    if (state.buffer.length === 0) return

    const data = state.buffer
    state.buffer = ''

    this.callbacks.send(id, data)
    state.unacked++

    if (!state.paused && state.unacked >= PtyDataBatcher.MAX_PENDING) {
      state.paused = true
      this.callbacks.pause(id)
    }
  }
}
