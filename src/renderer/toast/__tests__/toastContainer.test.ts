import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { toastStore, addToast, dismissToast } from '../../stores/toastStore'

describe('toast queue behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Clear all toasts
    const state = toastStore.getState()
    for (const toast of state.toasts) {
      state.dismissToast(toast.id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('toasts are queued in insertion order', () => {
    const id1 = addToast('First')
    const id2 = addToast('Second')
    const id3 = addToast('Third')

    const toasts = toastStore.getState().toasts
    expect(toasts.map((t) => t.id)).toEqual([id1, id2, id3])
  })

  it('each toast gets a unique id', () => {
    const id1 = addToast('A')
    const id2 = addToast('B')
    const id3 = addToast('C')

    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })

  it('dismissed toast is removed from queue', () => {
    const id1 = addToast('Stay')
    const id2 = addToast('Go')
    const id3 = addToast('Stay Too')

    dismissToast(id2)

    const toasts = toastStore.getState().toasts
    expect(toasts).toHaveLength(2)
    expect(toasts.map((t) => t.id)).toEqual([id1, id3])
  })

  it('dismissing non-existent id is a no-op', () => {
    addToast('Only')
    dismissToast('nonexistent-id')
    expect(toastStore.getState().toasts).toHaveLength(1)
  })
})

describe('toast severity and duration defaults', () => {
  beforeEach(() => {
    const state = toastStore.getState()
    for (const toast of state.toasts) {
      state.dismissToast(toast.id)
    }
  })

  it('info defaults to 4000ms', () => {
    const id = addToast('msg', 'info')
    expect(toastStore.getState().toasts.find((t) => t.id === id)!.duration).toBe(4000)
  })

  it('success defaults to 3000ms', () => {
    const id = addToast('msg', 'success')
    expect(toastStore.getState().toasts.find((t) => t.id === id)!.duration).toBe(3000)
  })

  it('warning defaults to 5000ms', () => {
    const id = addToast('msg', 'warning')
    expect(toastStore.getState().toasts.find((t) => t.id === id)!.duration).toBe(5000)
  })

  it('error defaults to 6000ms', () => {
    const id = addToast('msg', 'error')
    expect(toastStore.getState().toasts.find((t) => t.id === id)!.duration).toBe(6000)
  })

  it('custom duration overrides default', () => {
    const id = addToast('msg', 'info', 10000)
    expect(toastStore.getState().toasts.find((t) => t.id === id)!.duration).toBe(10000)
  })

  it('toast has createdAt timestamp', () => {
    const before = Date.now()
    const id = addToast('msg')
    const after = Date.now()
    const toast = toastStore.getState().toasts.find((t) => t.id === id)!
    expect(toast.createdAt).toBeGreaterThanOrEqual(before)
    expect(toast.createdAt).toBeLessThanOrEqual(after)
  })
})
