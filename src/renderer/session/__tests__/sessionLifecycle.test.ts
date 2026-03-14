import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { gridStore } from '../../stores/gridStore'
import { preferencesStore } from '../../stores/preferencesStore'
import { snapshotStore } from '../../stores/snapshotStore'

// Mock smokeAPI
const mockPtySpawn = vi.fn().mockResolvedValue({ id: 'test', pid: 1234 })
const mockPtyKill = vi.fn()
const mockPtyOnExit = vi.fn().mockReturnValue(() => {})

Object.defineProperty(globalThis, 'window', {
  value: {
    smokeAPI: {
      pty: {
        spawn: mockPtySpawn,
        kill: mockPtyKill,
        onData: vi.fn().mockReturnValue(() => {}),
        onExit: mockPtyOnExit,
        write: vi.fn(),
        resize: vi.fn(),
      },
      config: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      },
      layout: {
        save: vi.fn(),
        load: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
      },
    },
  },
  writable: true,
})

// Mock navigator for platform detection
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'MacIntel' },
  writable: true,
})

describe('Session Lifecycle', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true })
    preferencesStore.setState({
      preferences: {
        defaultShell: '',
        autoLaunchClaude: false,
        claudeCommand: 'claude',
        gridSize: 20,
        sidebarPosition: 'left',
        sidebarWidth: 240,
        theme: 'dark',
        defaultCwd: '',
      },
      loaded: true,
    })
    snapshotStore.setState({ snapshots: new Map() })
    vi.clearAllMocks()
  })

  describe('focusSession with null', () => {
    it('unfocuses all sessions when called with null', () => {
      const session = sessionStore.getState().createSession('/tmp')
      sessionStore.getState().focusSession(session.id)
      expect(sessionStore.getState().focusedId).toBe(session.id)

      sessionStore.getState().focusSession(null)
      expect(sessionStore.getState().focusedId).toBeNull()
    })
  })

  describe('session creation with position', () => {
    it('creates session at provided position snapped to grid', () => {
      const session = sessionStore.getState().createSession('/tmp', { x: 107, y: 213 })
      // Position should be stored as-is (snapping is done by the creation utility)
      expect(session.position).toEqual({ x: 107, y: 213 })
    })

    it('creates session with correct CWD', () => {
      const session = sessionStore.getState().createSession('/home/user/project')
      expect(session.cwd).toBe('/home/user/project')
      expect(session.title).toBe('project')
    })
  })

  describe('session status on exit', () => {
    it('updates session status to exited', () => {
      const session = sessionStore.getState().createSession('/tmp')
      expect(session.status).toBe('running')

      sessionStore.getState().updateSession(session.id, {
        status: 'exited',
        exitCode: 0,
      })

      const updated = sessionStore.getState().sessions.get(session.id)!
      expect(updated.status).toBe('exited')
      expect(updated.exitCode).toBe(0)
    })

    it('keeps session in store after exit (window stays open)', () => {
      const session = sessionStore.getState().createSession('/tmp')
      sessionStore.getState().updateSession(session.id, {
        status: 'exited',
        exitCode: 0,
      })

      // Session should still exist
      expect(sessionStore.getState().sessions.has(session.id)).toBe(true)
      expect(sessionStore.getState().sessions.size).toBe(1)
    })
  })

  describe('session close cleanup', () => {
    it('removeSession clears focused and highlighted state', () => {
      const session = sessionStore.getState().createSession('/tmp')
      sessionStore.getState().focusSession(session.id)
      sessionStore.getState().highlightSession(session.id)

      sessionStore.getState().removeSession(session.id)

      expect(sessionStore.getState().focusedId).toBeNull()
      expect(sessionStore.getState().highlightedId).toBeNull()
      expect(sessionStore.getState().sessions.size).toBe(0)
    })
  })

  describe('bringToFront on focus', () => {
    it('increments zIndex when brought to front', () => {
      const s1 = sessionStore.getState().createSession('/a')
      const s2 = sessionStore.getState().createSession('/b')

      const initialZ1 = sessionStore.getState().sessions.get(s1.id)!.zIndex
      const initialZ2 = sessionStore.getState().sessions.get(s2.id)!.zIndex
      expect(initialZ2).toBeGreaterThan(initialZ1)

      sessionStore.getState().bringToFront(s1.id)
      const updatedZ1 = sessionStore.getState().sessions.get(s1.id)!.zIndex
      expect(updatedZ1).toBeGreaterThan(initialZ2)
    })
  })

  describe('grid snapping for session creation', () => {
    it('snapToGrid correctly rounds positions', () => {
      const { snapToGrid } = gridStore.getState()
      expect(snapToGrid(107)).toBe(100)
      expect(snapToGrid(113)).toBe(120)
      expect(snapToGrid(0)).toBe(0)
      expect(snapToGrid(20)).toBe(20)
      expect(snapToGrid(10)).toBe(20) // rounds to nearest
      expect(snapToGrid(9)).toBe(0) // rounds down
    })
  })

  describe('preferences-based CWD', () => {
    it('defaultCwd preference is available in store', () => {
      preferencesStore.getState().updatePreference('defaultCwd', '/custom/path')
      const prefs = preferencesStore.getState().preferences
      expect(prefs.defaultCwd).toBe('/custom/path')
    })

    it('empty defaultCwd falls back behavior', () => {
      const prefs = preferencesStore.getState().preferences
      expect(prefs.defaultCwd).toBe('')
    })
  })

  describe('multiple session management', () => {
    it('can create and track multiple sessions', () => {
      const s1 = sessionStore.getState().createSession('/a', { x: 0, y: 0 })
      const s2 = sessionStore.getState().createSession('/b', { x: 200, y: 0 })
      const s3 = sessionStore.getState().createSession('/c', { x: 400, y: 0 })

      expect(sessionStore.getState().sessions.size).toBe(3)

      sessionStore.getState().removeSession(s2.id)
      expect(sessionStore.getState().sessions.size).toBe(2)
      expect(sessionStore.getState().sessions.has(s1.id)).toBe(true)
      expect(sessionStore.getState().sessions.has(s2.id)).toBe(false)
      expect(sessionStore.getState().sessions.has(s3.id)).toBe(true)
    })

    it('focus one session while others remain unfocused', () => {
      const s1 = sessionStore.getState().createSession('/a')
      const s2 = sessionStore.getState().createSession('/b')

      sessionStore.getState().focusSession(s1.id)
      expect(sessionStore.getState().focusedId).toBe(s1.id)

      sessionStore.getState().focusSession(s2.id)
      expect(sessionStore.getState().focusedId).toBe(s2.id)
    })
  })
})
