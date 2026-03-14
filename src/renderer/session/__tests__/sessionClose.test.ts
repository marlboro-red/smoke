import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { snapshotStore } from '../../stores/snapshotStore'

// Mock terminalRegistry
vi.mock('../../terminal/terminalRegistry', () => ({
  unregisterTerminal: vi.fn(),
}))

import { unregisterTerminal } from '../../terminal/terminalRegistry'

// Mock window.smokeAPI
let exitCallbacks: Array<(event: { id: string; exitCode: number; signal?: number }) => void> = []
const mockKill = vi.fn()
const mockOnExit = vi.fn((cb: any) => {
  exitCallbacks.push(cb)
  return () => {
    exitCallbacks = exitCallbacks.filter(c => c !== cb)
  }
})

Object.defineProperty(globalThis, 'window', {
  value: {
    smokeAPI: {
      pty: {
        kill: mockKill,
        onExit: mockOnExit,
      },
    },
  },
  writable: true,
})

// We need to re-import after setting up mocks, and we need to clear the pendingCloses set
// between tests. Since pendingCloses is module-scoped, we import fresh or reset manually.
import { closeSession } from '../useSessionClose'

describe('closeSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    exitCallbacks = []

    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    snapshotStore.setState({ snapshots: new Map() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createTestSession(id: string, status: string = 'running') {
    const session = sessionStore.getState().createSession('/tmp', { x: 0, y: 0 })
    // Override id and status for testing
    const sessions = new Map(sessionStore.getState().sessions)
    const s = sessions.get(session.id)!
    sessions.delete(session.id)
    sessions.set(id, { ...s, id, status: status as any })
    sessionStore.setState({ sessions })
    return id
  }

  it('kills PTY and cleans up on exit event', () => {
    createTestSession('sess-1')
    snapshotStore.getState().setSnapshot('sess-1', ['line1'])

    closeSession('sess-1')

    expect(mockKill).toHaveBeenCalledWith('sess-1')

    // Simulate PTY exit
    exitCallbacks.forEach(cb => cb({ id: 'sess-1', exitCode: 0 }))

    expect(unregisterTerminal).toHaveBeenCalledWith('sess-1')
    expect(sessionStore.getState().sessions.has('sess-1')).toBe(false)
    expect(snapshotStore.getState().snapshots.has('sess-1')).toBe(false)
  })

  it('cleans up immediately if session already exited', () => {
    createTestSession('sess-2', 'exited')

    closeSession('sess-2')

    // Should clean up immediately without killing PTY
    expect(mockKill).not.toHaveBeenCalled()
    expect(unregisterTerminal).toHaveBeenCalledWith('sess-2')
    expect(sessionStore.getState().sessions.has('sess-2')).toBe(false)
  })

  it('cleans up after EXIT_TIMEOUT if onExit never fires (smoke-9dc regression)', () => {
    createTestSession('sess-3')

    closeSession('sess-3')

    expect(mockKill).toHaveBeenCalledWith('sess-3')
    expect(sessionStore.getState().sessions.has('sess-3')).toBe(true)

    // Advance past EXIT_TIMEOUT (5000ms)
    vi.advanceTimersByTime(5000)

    expect(unregisterTerminal).toHaveBeenCalledWith('sess-3')
    expect(sessionStore.getState().sessions.has('sess-3')).toBe(false)
  })

  it('prevents double-close (smoke-9dc regression)', () => {
    createTestSession('sess-4')

    closeSession('sess-4')
    closeSession('sess-4')

    // kill should only be called once
    expect(mockKill).toHaveBeenCalledTimes(1)
  })

  it('handles close of nonexistent session gracefully', () => {
    // Should not throw
    closeSession('nonexistent')
    expect(mockKill).not.toHaveBeenCalled()
  })

  it('clears timeout when exit fires before timeout', () => {
    createTestSession('sess-5')

    closeSession('sess-5')

    // Simulate exit before timeout
    exitCallbacks.forEach(cb => cb({ id: 'sess-5', exitCode: 0 }))

    expect(unregisterTerminal).toHaveBeenCalledTimes(1)

    // Advance past timeout — should NOT call unregister again
    vi.advanceTimersByTime(5000)
    expect(unregisterTerminal).toHaveBeenCalledTimes(1)
  })
})
