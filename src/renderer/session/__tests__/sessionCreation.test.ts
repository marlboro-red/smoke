import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { preferencesStore } from '../../stores/preferencesStore'
import { gridStore } from '../../stores/gridStore'

// Mock useCanvasControls module-level exports
vi.mock('../../canvas/useCanvasControls', () => ({
  getCurrentPan: vi.fn(() => ({ x: 0, y: 0 })),
  getCurrentZoom: vi.fn(() => 1),
  getCanvasRootElement: vi.fn(() => null),
}))

// Mock window.smokeAPI
const mockSpawn = vi.fn()
Object.defineProperty(globalThis, 'window', {
  value: {
    smokeAPI: {
      pty: { spawn: mockSpawn },
    },
  },
  writable: true,
})

import { createNewSession } from '../useSessionCreation'

describe('createNewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    preferencesStore.setState({
      preferences: {
        defaultShell: '',
        autoLaunchClaude: false,
        claudeCommand: 'claude',
        gridSize: 20,
        sidebarPosition: 'left' as const,
        sidebarWidth: 240,
        theme: 'dark',
        defaultCwd: '',
      },
      launchCwd: '',
      loaded: true,
    })
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true })
  })

  it('creates a session and spawns a PTY', () => {
    createNewSession({ x: 100, y: 200 })

    const sessions = sessionStore.getState().sessions
    expect(sessions.size).toBe(1)

    const session = sessions.values().next().value!
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ id: session.id, cwd: '' })
    )
  })

  it('snaps position to grid', () => {
    createNewSession({ x: 107, y: 213 })

    const sessions = sessionStore.getState().sessions
    const session = sessions.values().next().value!
    // gridStore snaps 107 → 100, 213 → 220 (with gridSize=20)
    expect(session.position.x).toBe(100)
    expect(session.position.y).toBe(220)
  })

  it('focuses and brings the new session to front', () => {
    createNewSession({ x: 100, y: 100 })

    const state = sessionStore.getState()
    const session = state.sessions.values().next().value!
    expect(state.focusedId).toBe(session.id)
  })

  it('uses configured defaultCwd from preferences', () => {
    preferencesStore.setState({
      ...preferencesStore.getState(),
      preferences: {
        ...preferencesStore.getState().preferences,
        defaultCwd: '/custom/path',
      },
    })

    createNewSession({ x: 0, y: 0 })

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/custom/path' })
    )
  })

  it('falls back to launchCwd when defaultCwd is empty (smoke-5sc regression)', () => {
    preferencesStore.setState({
      ...preferencesStore.getState(),
      launchCwd: '/launched/from/here',
    })

    createNewSession({ x: 0, y: 0 })

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/launched/from/here' })
    )
  })

  it('prefers defaultCwd over launchCwd', () => {
    preferencesStore.setState({
      ...preferencesStore.getState(),
      preferences: {
        ...preferencesStore.getState().preferences,
        defaultCwd: '/configured/cwd',
      },
      launchCwd: '/launched/from/here',
    })

    createNewSession({ x: 0, y: 0 })

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/configured/cwd' })
    )
  })

  it('falls back to empty string when both defaultCwd and launchCwd are empty', () => {
    createNewSession({ x: 0, y: 0 })

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '' })
    )
  })
})
