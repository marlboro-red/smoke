import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { toastStore, addToast, dismissToast } from '../toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    // Clear all toasts
    const state = toastStore.getState()
    for (const toast of state.toasts) {
      state.dismissToast(toast.id)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds a toast with default info severity', () => {
    const id = addToast('Hello')
    const toast = toastStore.getState().toasts.find((t) => t.id === id)
    expect(toast).toBeDefined()
    expect(toast!.message).toBe('Hello')
    expect(toast!.severity).toBe('info')
    expect(toast!.duration).toBe(4000)
  })

  it('adds a toast with specified severity', () => {
    const id = addToast('Error occurred', 'error')
    const toast = toastStore.getState().toasts.find((t) => t.id === id)
    expect(toast!.severity).toBe('error')
    expect(toast!.duration).toBe(6000)
  })

  it('adds a toast with custom duration', () => {
    const id = addToast('Custom', 'warning', 10000)
    const toast = toastStore.getState().toasts.find((t) => t.id === id)
    expect(toast!.duration).toBe(10000)
  })

  it('dismisses a toast by id', () => {
    const id = addToast('Dismissable')
    expect(toastStore.getState().toasts.length).toBe(1)
    dismissToast(id)
    expect(toastStore.getState().toasts.length).toBe(0)
  })

  it('maintains order when adding multiple toasts', () => {
    const id1 = addToast('First', 'info')
    const id2 = addToast('Second', 'success')
    const id3 = addToast('Third', 'error')
    const toasts = toastStore.getState().toasts
    expect(toasts.map((t) => t.id)).toEqual([id1, id2, id3])
  })

  it('only removes the specified toast when dismissing', () => {
    const id1 = addToast('Keep')
    const id2 = addToast('Remove')
    dismissToast(id2)
    const toasts = toastStore.getState().toasts
    expect(toasts.length).toBe(1)
    expect(toasts[0].id).toBe(id1)
  })

  it('uses correct default durations for each severity', () => {
    const info = addToast('info', 'info')
    const success = addToast('success', 'success')
    const warning = addToast('warning', 'warning')
    const error = addToast('error', 'error')

    const toasts = toastStore.getState().toasts
    expect(toasts.find((t) => t.id === info)!.duration).toBe(4000)
    expect(toasts.find((t) => t.id === success)!.duration).toBe(3000)
    expect(toasts.find((t) => t.id === warning)!.duration).toBe(5000)
    expect(toasts.find((t) => t.id === error)!.duration).toBe(6000)
  })
})
