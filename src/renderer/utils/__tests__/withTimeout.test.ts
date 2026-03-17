import { describe, it, expect, vi } from 'vitest'
import { withTimeout } from '../withTimeout'

describe('withTimeout', () => {
  it('resolves when the promise resolves before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000)
    expect(result).toBe('ok')
  })

  it('rejects when the promise rejects before the timeout', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('fail')), 1000)
    ).rejects.toThrow('fail')
  })

  it('rejects with a timeout error when the promise does not settle in time', async () => {
    vi.useFakeTimers()
    const neverResolves = new Promise(() => {})
    const wrapped = withTimeout(neverResolves, 5000)

    vi.advanceTimersByTime(5000)

    await expect(wrapped).rejects.toThrow('timed out')
    vi.useRealTimers()
  })

  it('clears the timer when the promise resolves before timeout', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const p = withTimeout(Promise.resolve('fast'), 10_000)
    await vi.runAllTimersAsync()
    await p

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
    vi.useRealTimers()
  })
})
