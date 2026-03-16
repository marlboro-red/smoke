import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore } from '../sessionStore'
import { activityStore } from '../activityStore'
import { preferencesStore } from '../preferencesStore'

/**
 * Regression tests for smoke-d6u8:
 * Zustand selectors returning Set/object types must use shallow equality
 * to prevent cascade re-renders when unrelated state changes.
 *
 * These tests verify at the store level that:
 * 1. Set references aren't unnecessarily replaced
 * 2. Subscribe notifications with shallow comparison skip unrelated changes
 */

/** Shallow comparison for Sets and objects (mirrors zustand's shallow) */
function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }
  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false
  }
  return true
}

describe('sessionStore selectedIds — no spurious notifications (smoke-d6u8)', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      selectedIds: new Set<string>(),
      nextZIndex: 1,
    })
  })

  it('unrelated state change does not create new selectedIds reference', () => {
    const before = sessionStore.getState().selectedIds
    sessionStore.getState().createSession('/tmp')
    const after = sessionStore.getState().selectedIds
    expect(before).toBe(after)
  })

  it('subscribe with shallow selector skips unrelated updates', () => {
    let notifyCount = 0
    const selector = (state: ReturnType<typeof sessionStore.getState>) => state.selectedIds
    const unsub = sessionStore.subscribe((state, prev) => {
      if (!shallowEqual(selector(state), selector(prev))) {
        notifyCount++
      }
    })

    // Unrelated change: create session — should NOT trigger selectedIds change
    sessionStore.getState().createSession('/tmp')
    expect(notifyCount).toBe(0)

    // Related change: toggle selection — SHOULD trigger
    const s = sessionStore.getState().createSession('/a')
    notifyCount = 0
    sessionStore.getState().toggleSelectSession(s.id)
    expect(notifyCount).toBe(1)

    unsub()
  })

  it('removeSession creates new selectedIds only when id was selected', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    sessionStore.getState().toggleSelectSession(s1.id)

    let notifyCount = 0
    const selector = (state: ReturnType<typeof sessionStore.getState>) => state.selectedIds
    const unsub = sessionStore.subscribe((state, prev) => {
      if (!shallowEqual(selector(state), selector(prev))) {
        notifyCount++
      }
    })

    // Remove unselected session — selectedIds changes because removeSession always creates new Set
    // but with shallow comparison, content is the same so it should not notify
    sessionStore.getState().removeSession(s2.id)
    // selectedIds still has s1.id and s2 was never selected, so shallow equal should match
    expect(notifyCount).toBe(0)

    // Remove selected session — SHOULD trigger
    sessionStore.getState().removeSession(s1.id)
    expect(notifyCount).toBe(1)

    unsub()
  })
})

describe('activityStore activeIds — no spurious notifications (smoke-d6u8)', () => {
  beforeEach(() => {
    activityStore.setState({ activeIds: new Set() })
  })

  it('markActive with same id is a no-op (early return)', () => {
    activityStore.getState().markActive('session-1')
    const refAfterFirst = activityStore.getState().activeIds

    activityStore.getState().markActive('session-1')
    const refAfterSecond = activityStore.getState().activeIds

    // Store should return same state (early return), so same reference
    expect(refAfterFirst).toBe(refAfterSecond)
  })

  it('clearActive with absent id is a no-op', () => {
    const before = activityStore.getState().activeIds
    activityStore.getState().clearActive('nonexistent')
    const after = activityStore.getState().activeIds
    expect(before).toBe(after)
  })

  it('subscribe with shallow equality fires only on actual changes', () => {
    let notifyCount = 0
    const selector = (state: ReturnType<typeof activityStore.getState>) => state.activeIds
    const unsub = activityStore.subscribe((state, prev) => {
      if (!shallowEqual(selector(state), selector(prev))) {
        notifyCount++
      }
    })

    activityStore.getState().markActive('s1')
    expect(notifyCount).toBe(1)

    // Duplicate mark — no change
    activityStore.getState().markActive('s1')
    expect(notifyCount).toBe(1)

    activityStore.getState().clearActive('s1')
    expect(notifyCount).toBe(2)

    unsub()
  })
})

describe('preferencesStore preferences — no spurious notifications (smoke-d6u8)', () => {
  it('subscribe with shallow equality skips when values unchanged', () => {
    const prefs = { ...preferencesStore.getState().preferences }
    let notifyCount = 0
    const selector = (state: ReturnType<typeof preferencesStore.getState>) => state.preferences
    const unsub = preferencesStore.subscribe((state, prev) => {
      if (!shallowEqual(selector(state), selector(prev))) {
        notifyCount++
      }
    })

    // Setting identical preferences — shallow equal, should not notify
    preferencesStore.getState().setPreferences({ ...prefs })
    expect(notifyCount).toBe(0)

    // Changing a value — should notify
    preferencesStore.getState().updatePreference('theme', prefs.theme === 'dark' ? 'light' : 'dark')
    expect(notifyCount).toBe(1)

    unsub()
  })
})
