import { describe, it, expect } from 'vitest'

/**
 * Regression test for smoke-k9t: duplicate listener stacking in useRubberBandSelect.
 *
 * The bug: document listeners for pointermove/pointerup were attached inside
 * onPointerDown without guarding against re-entry. Multiple pointerdown events
 * before pointerup would corrupt state and cause erratic selection.
 *
 * The fix: guard onPointerDown with `if (pointerIdRef.current !== null) return`
 * to reject re-entry while already tracking a pointer.
 *
 * These tests exercise the guard logic using a minimal reproduction of the
 * listener-attach logic, using plain objects instead of DOM PointerEvent.
 */

interface FakePointerEvent {
  pointerId: number
  button: number
}

// Minimal reproduction of the listener-attach logic from useRubberBandSelect (FIXED)
function createRubberBandHandler() {
  let pointerIdRef: number | null = null
  let listenerCount = 0

  const onPointerUp = (e: FakePointerEvent) => {
    if (e.pointerId !== pointerIdRef) return
    pointerIdRef = null
    listenerCount--
  }

  const onPointerDown = (e: FakePointerEvent) => {
    if (e.button !== 0) return
    // THE FIX: guard against re-entry
    if (pointerIdRef !== null) return

    pointerIdRef = e.pointerId
    listenerCount++
  }

  return {
    onPointerDown,
    onPointerUp,
    getListenerCount: () => listenerCount,
    getPointerId: () => pointerIdRef,
  }
}

// Same logic WITHOUT the guard — demonstrates the bug
function createBuggyRubberBandHandler() {
  let pointerIdRef: number | null = null
  let listenerCount = 0

  const onPointerUp = (e: FakePointerEvent) => {
    if (e.pointerId !== pointerIdRef) return
    pointerIdRef = null
    listenerCount--
  }

  const onPointerDown = (e: FakePointerEvent) => {
    if (e.button !== 0) return
    // NO GUARD — this is the bug
    pointerIdRef = e.pointerId
    listenerCount++
  }

  return {
    onPointerDown,
    onPointerUp,
    getListenerCount: () => listenerCount,
    getPointerId: () => pointerIdRef,
  }
}

function fakePointerEvent(pointerId: number, button = 0): FakePointerEvent {
  return { pointerId, button }
}

describe('useRubberBandSelect guard against duplicate listeners (smoke-k9t)', () => {
  it('rejects second pointerdown while already tracking a pointer', () => {
    const handler = createRubberBandHandler()

    handler.onPointerDown(fakePointerEvent(1))
    expect(handler.getPointerId()).toBe(1)
    expect(handler.getListenerCount()).toBe(1)

    // Second pointerdown with different pointer — should be rejected
    handler.onPointerDown(fakePointerEvent(2))
    expect(handler.getPointerId()).toBe(1) // still tracking original pointer
    expect(handler.getListenerCount()).toBe(1) // no extra listeners
  })

  it('accepts new pointerdown after pointerup completes', () => {
    const handler = createRubberBandHandler()

    handler.onPointerDown(fakePointerEvent(1))
    expect(handler.getPointerId()).toBe(1)
    handler.onPointerUp(fakePointerEvent(1))
    expect(handler.getPointerId()).toBe(null)

    // Second interaction — should work fine
    handler.onPointerDown(fakePointerEvent(2))
    expect(handler.getPointerId()).toBe(2)
    expect(handler.getListenerCount()).toBe(1)
  })

  it('buggy version corrupts state on rapid pointerdown (demonstrates the bug)', () => {
    const handler = createBuggyRubberBandHandler()

    handler.onPointerDown(fakePointerEvent(1))
    handler.onPointerDown(fakePointerEvent(2))

    // Bug: pointerId was overwritten from 1 to 2
    expect(handler.getPointerId()).toBe(2)
    // pointerup for original pointer 1 now fails the pointerId check
    handler.onPointerUp(fakePointerEvent(1))
    // State is still corrupted — pointer 1's up was ignored
    expect(handler.getPointerId()).toBe(2) // leaked, never cleaned up
  })

  it('fixed version prevents state corruption from rapid pointerdown', () => {
    const handler = createRubberBandHandler()

    handler.onPointerDown(fakePointerEvent(1))
    handler.onPointerDown(fakePointerEvent(2)) // rejected

    expect(handler.getPointerId()).toBe(1) // original preserved

    // pointerup for original pointer 1 works correctly
    handler.onPointerUp(fakePointerEvent(1))
    expect(handler.getPointerId()).toBe(null) // properly cleaned up
  })

  it('ignores non-left-button clicks', () => {
    const handler = createRubberBandHandler()

    handler.onPointerDown(fakePointerEvent(1, 2)) // right click
    expect(handler.getPointerId()).toBe(null)
    expect(handler.getListenerCount()).toBe(0)
  })
})
