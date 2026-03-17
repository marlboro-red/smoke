import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { snapshotStore } from '../../stores/snapshotStore'

// Mock terminalRegistry
vi.mock('../../terminal/terminalRegistry', () => ({
  unregisterTerminal: vi.fn(),
}))

import { unregisterTerminal } from '../../terminal/terminalRegistry'

// Mock window.smokeAPI
const mockKill = vi.fn()
const mockOnExit = vi.fn(() => () => {})

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

import { closeSession } from '../useSessionClose'

describe('closeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    snapshotStore.setState({ snapshots: new Map() })
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

  it('removes session from UI immediately and kills PTY in background', () => {
    createTestSession('sess-1')
    snapshotStore.getState().setSnapshot('sess-1', ['line1'])

    closeSession('sess-1')

    // Session should be removed from UI immediately
    expect(unregisterTerminal).toHaveBeenCalledWith('sess-1')
    expect(sessionStore.getState().sessions.has('sess-1')).toBe(false)
    expect(snapshotStore.getState().snapshots.has('sess-1')).toBe(false)

    // PTY kill should be sent in background
    expect(mockKill).toHaveBeenCalledWith('sess-1')
  })

  it('cleans up immediately without killing PTY if session already exited', () => {
    createTestSession('sess-2', 'exited')

    closeSession('sess-2')

    // Should clean up immediately without killing PTY
    expect(mockKill).not.toHaveBeenCalled()
    expect(unregisterTerminal).toHaveBeenCalledWith('sess-2')
    expect(sessionStore.getState().sessions.has('sess-2')).toBe(false)
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
})
