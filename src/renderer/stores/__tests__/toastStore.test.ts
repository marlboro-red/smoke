import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { toastStore, addToast, dismissToast, MAX_VISIBLE_TOASTS } from '../toastStore'

describe('toastStore', () => {
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

  describe('toast creation with severity levels', () => {
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

    it('assigns a unique id to each toast', () => {
      const id1 = addToast('First')
      const id2 = addToast('Second')
      expect(id1).not.toBe(id2)
    })

    it('records createdAt timestamp', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const id = addToast('Timestamped')
      const toast = toastStore.getState().toasts.find((t) => t.id === id)
      expect(toast!.createdAt).toBe(new Date('2026-01-01T00:00:00Z').getTime())
    })
  })

  describe('queue ordering', () => {
    it('maintains insertion order when adding multiple toasts', () => {
      const id1 = addToast('First', 'info')
      const id2 = addToast('Second', 'success')
      const id3 = addToast('Third', 'error')
      const toasts = toastStore.getState().toasts
      expect(toasts.map((t) => t.id)).toEqual([id1, id2, id3])
    })

    it('preserves order after dismissing a middle toast', () => {
      const id1 = addToast('First')
      const id2 = addToast('Second')
      const id3 = addToast('Third')
      dismissToast(id2)
      const toasts = toastStore.getState().toasts
      expect(toasts.map((t) => t.id)).toEqual([id1, id3])
    })

    it('new toasts appear at the end of the queue', () => {
      const id1 = addToast('First')
      const id2 = addToast('Second')
      dismissToast(id1)
      const id3 = addToast('Third')
      const toasts = toastStore.getState().toasts
      expect(toasts.map((t) => t.id)).toEqual([id2, id3])
    })
  })

  describe('auto-dismiss after configurable timeout', () => {
    it('does not auto-dismiss before the duration elapses', () => {
      // Auto-dismiss is handled by ToastContainer (React component),
      // but the store sets the duration correctly for consumers to use
      const id = addToast('Will dismiss', 'info')
      const toast = toastStore.getState().toasts.find((t) => t.id === id)
      expect(toast!.duration).toBe(4000)
      // Toast remains in store since store itself doesn't manage timers
      expect(toastStore.getState().toasts.length).toBe(1)
    })

    it('supports duration=0 for manual-dismiss-only toasts', () => {
      const id = addToast('Sticky toast', 'info', 0)
      const toast = toastStore.getState().toasts.find((t) => t.id === id)
      expect(toast!.duration).toBe(0)
    })

    it('allows overriding default duration per severity', () => {
      const id = addToast('Quick error', 'error', 1000)
      const toast = toastStore.getState().toasts.find((t) => t.id === id)
      expect(toast!.severity).toBe('error')
      expect(toast!.duration).toBe(1000) // overridden from default 6000
    })

    it('each severity has a different default auto-dismiss timing', () => {
      const ids = {
        info: addToast('i', 'info'),
        success: addToast('s', 'success'),
        warning: addToast('w', 'warning'),
        error: addToast('e', 'error'),
      }
      const toasts = toastStore.getState().toasts
      const durations = Object.fromEntries(
        toasts.map((t) => [Object.entries(ids).find(([, id]) => id === t.id)![0], t.duration])
      )
      // Each severity has a distinct duration
      const uniqueDurations = new Set(Object.values(durations))
      expect(uniqueDurations.size).toBe(4)
      // Warning > Info > Success, Error is the longest
      expect(durations.error).toBeGreaterThan(durations.warning)
      expect(durations.warning).toBeGreaterThan(durations.info)
      expect(durations.info).toBeGreaterThan(durations.success)
    })
  })

  describe('manual dismiss', () => {
    it('dismisses a toast by id', () => {
      const id = addToast('Dismissable')
      expect(toastStore.getState().toasts.length).toBe(1)
      dismissToast(id)
      expect(toastStore.getState().toasts.length).toBe(0)
    })

    it('only removes the specified toast when dismissing', () => {
      const id1 = addToast('Keep')
      const id2 = addToast('Remove')
      dismissToast(id2)
      const toasts = toastStore.getState().toasts
      expect(toasts.length).toBe(1)
      expect(toasts[0].id).toBe(id1)
    })

    it('dismissing a non-existent id is a no-op', () => {
      addToast('Existing')
      dismissToast('toast-nonexistent')
      expect(toastStore.getState().toasts.length).toBe(1)
    })

    it('can dismiss a manual-only toast (duration=0)', () => {
      const id = addToast('Sticky', 'info', 0)
      expect(toastStore.getState().toasts.length).toBe(1)
      dismissToast(id)
      expect(toastStore.getState().toasts.length).toBe(0)
    })

    it('can dismiss all toasts one by one', () => {
      const ids = [addToast('A'), addToast('B'), addToast('C')]
      for (const id of ids) dismissToast(id)
      expect(toastStore.getState().toasts.length).toBe(0)
    })
  })

  describe('max visible toast limit', () => {
    it('exports MAX_VISIBLE_TOASTS constant', () => {
      expect(MAX_VISIBLE_TOASTS).toBe(5)
    })

    it('allows up to MAX_VISIBLE_TOASTS toasts', () => {
      for (let i = 0; i < MAX_VISIBLE_TOASTS; i++) {
        addToast(`Toast ${i}`)
      }
      expect(toastStore.getState().toasts.length).toBe(MAX_VISIBLE_TOASTS)
    })

    it('drops the oldest toast when exceeding the limit', () => {
      const ids: string[] = []
      for (let i = 0; i <= MAX_VISIBLE_TOASTS; i++) {
        ids.push(addToast(`Toast ${i}`))
      }
      const toasts = toastStore.getState().toasts
      expect(toasts.length).toBe(MAX_VISIBLE_TOASTS)
      // First toast should have been dropped
      expect(toasts.find((t) => t.id === ids[0])).toBeUndefined()
      // Last toast should be present
      expect(toasts.find((t) => t.id === ids[MAX_VISIBLE_TOASTS])).toBeDefined()
    })

    it('drops multiple oldest toasts when adding many beyond the limit', () => {
      // Add double the max
      const ids: string[] = []
      for (let i = 0; i < MAX_VISIBLE_TOASTS * 2; i++) {
        ids.push(addToast(`Toast ${i}`))
      }
      const toasts = toastStore.getState().toasts
      expect(toasts.length).toBe(MAX_VISIBLE_TOASTS)
      // Only the last MAX_VISIBLE_TOASTS should remain
      const remainingIds = toasts.map((t) => t.id)
      for (let i = MAX_VISIBLE_TOASTS; i < MAX_VISIBLE_TOASTS * 2; i++) {
        expect(remainingIds).toContain(ids[i])
      }
    })

    it('allows new toasts after dismissing when at the limit', () => {
      const ids: string[] = []
      for (let i = 0; i < MAX_VISIBLE_TOASTS; i++) {
        ids.push(addToast(`Toast ${i}`))
      }
      // Dismiss one
      dismissToast(ids[0])
      expect(toastStore.getState().toasts.length).toBe(MAX_VISIBLE_TOASTS - 1)
      // Add a new one — should not exceed limit
      addToast('New toast')
      expect(toastStore.getState().toasts.length).toBe(MAX_VISIBLE_TOASTS)
    })
  })
})
