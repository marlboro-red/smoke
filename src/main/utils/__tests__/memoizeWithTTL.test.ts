import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memoizeWithTTL, memoizeAsyncWithTTL } from '../memoizeWithTTL'

describe('memoizeWithTTL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns cached value within TTL', () => {
    let callCount = 0
    const memo = memoizeWithTTL(() => {
      callCount++
      return 'result'
    }, { ttlMs: 1000 })

    expect(memo.get()).toBe('result')
    expect(memo.get()).toBe('result')
    expect(callCount).toBe(1)
  })

  it('re-executes after TTL expires', () => {
    let callCount = 0
    const memo = memoizeWithTTL(() => {
      callCount++
      return `result-${callCount}`
    }, { ttlMs: 1000 })

    expect(memo.get()).toBe('result-1')
    vi.advanceTimersByTime(1001)
    expect(memo.get()).toBe('result-2')
    expect(callCount).toBe(2)
  })

  it('invalidate forces re-execution on next get', () => {
    let callCount = 0
    const memo = memoizeWithTTL(() => {
      callCount++
      return `result-${callCount}`
    }, { ttlMs: 10_000 })

    expect(memo.get()).toBe('result-1')
    memo.invalidate()
    expect(memo.get()).toBe('result-2')
    expect(callCount).toBe(2)
  })

  it('caches null and falsy values', () => {
    let callCount = 0
    const memo = memoizeWithTTL(() => {
      callCount++
      return null
    }, { ttlMs: 1000 })

    expect(memo.get()).toBeNull()
    expect(memo.get()).toBeNull()
    expect(callCount).toBe(1)
  })
})

describe('memoizeAsyncWithTTL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns cached value within TTL', async () => {
    let callCount = 0
    const memo = memoizeAsyncWithTTL(async () => {
      callCount++
      return 'result'
    }, { ttlMs: 1000 })

    expect(await memo.get()).toBe('result')
    expect(await memo.get()).toBe('result')
    expect(callCount).toBe(1)
  })

  it('re-executes after TTL expires', async () => {
    let callCount = 0
    const memo = memoizeAsyncWithTTL(async () => {
      callCount++
      return `result-${callCount}`
    }, { ttlMs: 1000 })

    expect(await memo.get()).toBe('result-1')
    vi.advanceTimersByTime(1001)
    expect(await memo.get()).toBe('result-2')
    expect(callCount).toBe(2)
  })

  it('deduplicates concurrent calls', async () => {
    let callCount = 0
    const memo = memoizeAsyncWithTTL(async () => {
      callCount++
      return 'result'
    }, { ttlMs: 1000 })

    const [a, b, c] = await Promise.all([memo.get(), memo.get(), memo.get()])
    expect(a).toBe('result')
    expect(b).toBe('result')
    expect(c).toBe('result')
    expect(callCount).toBe(1)
  })

  it('invalidate forces re-execution', async () => {
    let callCount = 0
    const memo = memoizeAsyncWithTTL(async () => {
      callCount++
      return `result-${callCount}`
    }, { ttlMs: 10_000 })

    expect(await memo.get()).toBe('result-1')
    memo.invalidate()
    expect(await memo.get()).toBe('result-2')
    expect(callCount).toBe(2)
  })

  it('handles errors without caching them', async () => {
    let callCount = 0
    const memo = memoizeAsyncWithTTL(async () => {
      callCount++
      if (callCount === 1) throw new Error('fail')
      return 'ok'
    }, { ttlMs: 1000 })

    await expect(memo.get()).rejects.toThrow('fail')
    expect(await memo.get()).toBe('ok')
    expect(callCount).toBe(2)
  })

  it('stale-while-revalidate returns stale value and refreshes in background', async () => {
    let callCount = 0
    const memo = memoizeAsyncWithTTL(async () => {
      callCount++
      return `result-${callCount}`
    }, { ttlMs: 1000, staleWhileRevalidate: true })

    // First call — must await since no cached value
    expect(await memo.get()).toBe('result-1')

    // Expire the TTL
    vi.advanceTimersByTime(1001)

    // Should return stale value immediately (result-1) and trigger background refresh
    const staleResult = await memo.get()
    expect(staleResult).toBe('result-1')

    // Background refresh should have completed
    await vi.advanceTimersByTimeAsync(0) // flush microtasks
    expect(callCount).toBe(2)

    // Next call within TTL should return refreshed value
    expect(await memo.get()).toBe('result-2')
  })
})
