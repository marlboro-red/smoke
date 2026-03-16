import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PtyDataBatcher, PtyDataBatcherCallbacks } from '../PtyDataBatcher'

describe('PtyDataBatcher', () => {
  let batcher: PtyDataBatcher
  let callbacks: PtyDataBatcherCallbacks

  beforeEach(() => {
    vi.useFakeTimers()
    callbacks = {
      send: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    }
    batcher = new PtyDataBatcher(callbacks)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('batching', () => {
    it('batches multiple data pushes into a single send', () => {
      batcher.push('s1', 'hello ')
      batcher.push('s1', 'world')

      expect(callbacks.send).not.toHaveBeenCalled()

      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)

      expect(callbacks.send).toHaveBeenCalledTimes(1)
      expect(callbacks.send).toHaveBeenCalledWith('s1', 'hello world')
    })

    it('sends immediately after the batch window expires', () => {
      batcher.push('s1', 'data')

      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)

      expect(callbacks.send).toHaveBeenCalledTimes(1)
      expect(callbacks.send).toHaveBeenCalledWith('s1', 'data')
    })

    it('keeps separate buffers per session', () => {
      batcher.push('s1', 'aaa')
      batcher.push('s2', 'bbb')

      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)

      expect(callbacks.send).toHaveBeenCalledTimes(2)
      expect(callbacks.send).toHaveBeenCalledWith('s1', 'aaa')
      expect(callbacks.send).toHaveBeenCalledWith('s2', 'bbb')
    })

    it('does not send empty buffer on flush', () => {
      batcher.push('s1', 'data')
      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      vi.mocked(callbacks.send).mockClear()

      // No new data pushed — next timer should not produce a send
      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS * 5)
      expect(callbacks.send).not.toHaveBeenCalled()
    })

    it('starts a new batch window after the previous flush', () => {
      batcher.push('s1', 'first')
      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      expect(callbacks.send).toHaveBeenCalledWith('s1', 'first')

      batcher.push('s1', 'second')
      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      expect(callbacks.send).toHaveBeenCalledWith('s1', 'second')
      expect(callbacks.send).toHaveBeenCalledTimes(2)
    })
  })

  describe('backpressure', () => {
    it('pauses PTY when unacked count reaches MAX_PENDING', () => {
      // Push and flush MAX_PENDING times without acking
      for (let i = 0; i < PtyDataBatcher.MAX_PENDING; i++) {
        batcher.push('s1', `chunk-${i}`)
        vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      }

      expect(callbacks.pause).toHaveBeenCalledTimes(1)
      expect(callbacks.pause).toHaveBeenCalledWith('s1')
    })

    it('does not pause PTY when acks arrive in time', () => {
      for (let i = 0; i < PtyDataBatcher.MAX_PENDING; i++) {
        batcher.push('s1', `chunk-${i}`)
        vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
        batcher.ack('s1')
      }

      expect(callbacks.pause).not.toHaveBeenCalled()
    })

    it('resumes PTY when unacked count drops to RESUME_THRESHOLD', () => {
      // Trigger pause
      for (let i = 0; i < PtyDataBatcher.MAX_PENDING; i++) {
        batcher.push('s1', `chunk-${i}`)
        vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      }
      expect(callbacks.pause).toHaveBeenCalledTimes(1)

      // Ack until we hit resume threshold
      const acksNeeded = PtyDataBatcher.MAX_PENDING - PtyDataBatcher.RESUME_THRESHOLD
      for (let i = 0; i < acksNeeded; i++) {
        batcher.ack('s1')
      }

      expect(callbacks.resume).toHaveBeenCalledTimes(1)
      expect(callbacks.resume).toHaveBeenCalledWith('s1')
    })

    it('does not resume before reaching RESUME_THRESHOLD', () => {
      // Trigger pause
      for (let i = 0; i < PtyDataBatcher.MAX_PENDING; i++) {
        batcher.push('s1', `chunk-${i}`)
        vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      }

      // Ack one fewer than needed
      const acksNeeded = PtyDataBatcher.MAX_PENDING - PtyDataBatcher.RESUME_THRESHOLD
      for (let i = 0; i < acksNeeded - 1; i++) {
        batcher.ack('s1')
      }

      expect(callbacks.resume).not.toHaveBeenCalled()
    })

    it('does not affect other sessions', () => {
      // Overload s1
      for (let i = 0; i < PtyDataBatcher.MAX_PENDING; i++) {
        batcher.push('s1', `chunk-${i}`)
        vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      }

      // s2 should not be paused
      batcher.push('s2', 'data')
      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)

      expect(callbacks.pause).toHaveBeenCalledTimes(1)
      expect(callbacks.pause).toHaveBeenCalledWith('s1')
    })
  })

  describe('remove', () => {
    it('cancels pending timer and cleans up state', () => {
      batcher.push('s1', 'data')
      batcher.remove('s1')

      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)

      expect(callbacks.send).not.toHaveBeenCalled()
    })

    it('is safe to call on unknown session', () => {
      expect(() => batcher.remove('nonexistent')).not.toThrow()
    })
  })

  describe('flushAll', () => {
    it('immediately flushes all pending buffers', () => {
      batcher.push('s1', 'aaa')
      batcher.push('s2', 'bbb')

      batcher.flushAll()

      expect(callbacks.send).toHaveBeenCalledTimes(2)
      expect(callbacks.send).toHaveBeenCalledWith('s1', 'aaa')
      expect(callbacks.send).toHaveBeenCalledWith('s2', 'bbb')
    })
  })

  describe('ack edge cases', () => {
    it('does not decrement below zero', () => {
      batcher.push('s1', 'data')
      vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)

      // Ack twice (only 1 batch was sent)
      batcher.ack('s1')
      batcher.ack('s1')

      // Should not throw or go negative — push more data and verify no spurious pause
      for (let i = 0; i < PtyDataBatcher.MAX_PENDING; i++) {
        batcher.push('s1', `chunk-${i}`)
        vi.advanceTimersByTime(PtyDataBatcher.BATCH_MS)
      }

      // Should still eventually pause
      expect(callbacks.pause).toHaveBeenCalled()
    })

    it('ignores ack for unknown session', () => {
      expect(() => batcher.ack('nonexistent')).not.toThrow()
    })
  })
})
