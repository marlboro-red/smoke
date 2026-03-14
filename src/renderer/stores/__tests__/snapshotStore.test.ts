import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Unit tests for snapshot store logic.
 * Uses a plain implementation to avoid importing zustand in test environment.
 */

function createSnapshotStore() {
  let snapshots = new Map<string, string[]>()
  return {
    getSnapshots: () => snapshots,
    setSnapshot: (sessionId: string, lines: string[]) => {
      snapshots = new Map(snapshots)
      snapshots.set(sessionId, lines)
    },
    removeSnapshot: (sessionId: string) => {
      snapshots = new Map(snapshots)
      snapshots.delete(sessionId)
    },
    reset: () => {
      snapshots = new Map()
    },
  }
}

describe('snapshotStore', () => {
  let store: ReturnType<typeof createSnapshotStore>

  beforeEach(() => {
    store = createSnapshotStore()
  })

  it('starts with empty snapshots', () => {
    expect(store.getSnapshots().size).toBe(0)
  })

  it('setSnapshot stores lines for a session', () => {
    store.setSnapshot('session-1', ['$ ls', 'file.txt', 'dir/'])
    const snapshot = store.getSnapshots().get('session-1')
    expect(snapshot).toEqual(['$ ls', 'file.txt', 'dir/'])
  })

  it('setSnapshot overwrites existing snapshot', () => {
    store.setSnapshot('session-1', ['old line'])
    store.setSnapshot('session-1', ['new line 1', 'new line 2'])
    const snapshot = store.getSnapshots().get('session-1')
    expect(snapshot).toEqual(['new line 1', 'new line 2'])
  })

  it('stores snapshots for multiple sessions', () => {
    store.setSnapshot('session-1', ['line a'])
    store.setSnapshot('session-2', ['line b'])
    expect(store.getSnapshots().size).toBe(2)
    expect(store.getSnapshots().get('session-1')).toEqual(['line a'])
    expect(store.getSnapshots().get('session-2')).toEqual(['line b'])
  })

  it('removeSnapshot deletes snapshot for a session', () => {
    store.setSnapshot('session-1', ['line'])
    store.removeSnapshot('session-1')
    expect(store.getSnapshots().has('session-1')).toBe(false)
  })

  it('removeSnapshot is no-op for non-existent session', () => {
    store.removeSnapshot('nonexistent')
    expect(store.getSnapshots().size).toBe(0)
  })

  it('removing one snapshot does not affect others', () => {
    store.setSnapshot('session-1', ['line a'])
    store.setSnapshot('session-2', ['line b'])
    store.removeSnapshot('session-1')
    expect(store.getSnapshots().has('session-1')).toBe(false)
    expect(store.getSnapshots().get('session-2')).toEqual(['line b'])
  })
})
