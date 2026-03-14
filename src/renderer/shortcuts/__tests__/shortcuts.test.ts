import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveShortcut, getSortedSessionIds } from '../shortcutMap'
import { sessionStore } from '../../stores/sessionStore'
import { canvasStore } from '../../stores/canvasStore'
import { gridStore } from '../../stores/gridStore'
import { preferencesStore } from '../../stores/preferencesStore'
import { snapshotStore } from '../../stores/snapshotStore'

// Mock smokeAPI
Object.defineProperty(globalThis, 'window', {
  value: {
    smokeAPI: {
      pty: {
        spawn: vi.fn().mockResolvedValue({ id: 'test', pid: 1234 }),
        kill: vi.fn(),
        onData: vi.fn().mockReturnValue(() => {}),
        onExit: vi.fn().mockReturnValue(() => {}),
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

Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'MacIntel' },
  writable: true,
})

function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    type: 'keydown',
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent
}

describe('shortcutMap', () => {
  describe('resolveShortcut', () => {
    it('resolves Cmd+N to newSession on Mac', () => {
      const e = makeKeyEvent({ key: 'n', metaKey: true })
      expect(resolveShortcut(e)).toBe('newSession')
    })

    it('resolves Cmd+W to closeSession', () => {
      const e = makeKeyEvent({ key: 'w', metaKey: true })
      expect(resolveShortcut(e)).toBe('closeSession')
    })

    it('resolves Cmd+Tab to cycleNextSession', () => {
      const e = makeKeyEvent({ key: 'Tab', metaKey: true })
      expect(resolveShortcut(e)).toBe('cycleNextSession')
    })

    it('resolves Cmd+Shift+Tab to cyclePrevSession', () => {
      const e = makeKeyEvent({ key: 'Tab', metaKey: true, shiftKey: true })
      expect(resolveShortcut(e)).toBe('cyclePrevSession')
    })

    it('resolves Cmd+1 to focusSession1', () => {
      const e = makeKeyEvent({ key: '1', metaKey: true })
      expect(resolveShortcut(e)).toBe('focusSession1')
    })

    it('resolves Cmd+9 to focusSession9', () => {
      const e = makeKeyEvent({ key: '9', metaKey: true })
      expect(resolveShortcut(e)).toBe('focusSession9')
    })

    it('resolves Cmd+0 to resetZoom', () => {
      const e = makeKeyEvent({ key: '0', metaKey: true })
      expect(resolveShortcut(e)).toBe('resetZoom')
    })

    it('resolves Cmd+= to zoomIn', () => {
      const e = makeKeyEvent({ key: '=', metaKey: true })
      expect(resolveShortcut(e)).toBe('zoomIn')
    })

    it('resolves Cmd+- to zoomOut', () => {
      const e = makeKeyEvent({ key: '-', metaKey: true })
      expect(resolveShortcut(e)).toBe('zoomOut')
    })

    it('resolves Cmd+S to saveLayout', () => {
      const e = makeKeyEvent({ key: 's', metaKey: true })
      expect(resolveShortcut(e)).toBe('saveLayout')
    })

    it('resolves Cmd+, to openSettings', () => {
      const e = makeKeyEvent({ key: ',', metaKey: true })
      expect(resolveShortcut(e)).toBe('openSettings')
    })

    it('resolves Escape to escape', () => {
      const e = makeKeyEvent({ key: 'Escape' })
      expect(resolveShortcut(e)).toBe('escape')
    })

    it('returns null for unrecognized keys', () => {
      const e = makeKeyEvent({ key: 'a', metaKey: true })
      expect(resolveShortcut(e)).toBeNull()
    })

    it('returns null for regular keys without modifier', () => {
      const e = makeKeyEvent({ key: 'n' })
      expect(resolveShortcut(e)).toBeNull()
    })
  })

  describe('getSortedSessionIds', () => {
    it('returns empty array for empty map', () => {
      expect(getSortedSessionIds(new Map())).toEqual([])
    })

    it('sorts sessions by createdAt ascending', () => {
      const sessions = new Map([
        ['c', { createdAt: 300 }],
        ['a', { createdAt: 100 }],
        ['b', { createdAt: 200 }],
      ])
      expect(getSortedSessionIds(sessions)).toEqual(['a', 'b', 'c'])
    })

    it('returns single session', () => {
      const sessions = new Map([['only', { createdAt: 42 }]])
      expect(getSortedSessionIds(sessions)).toEqual(['only'])
    })
  })
})

describe('Keyboard shortcut actions', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true })
    canvasStore.setState({ panX: 0, panY: 0, zoom: 1.0, gridSize: 20 })
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

  describe('escape unfocuses terminal', () => {
    it('sets focusedId to null', () => {
      const session = sessionStore.getState().createSession('/tmp')
      sessionStore.getState().focusSession(session.id)
      expect(sessionStore.getState().focusedId).toBe(session.id)

      sessionStore.getState().focusSession(null)
      expect(sessionStore.getState().focusedId).toBeNull()
    })
  })

  describe('cycle session logic', () => {
    it('cycles forward through sorted sessions', () => {
      const s1 = sessionStore.getState().createSession('/a')
      const s2 = sessionStore.getState().createSession('/b')
      const s3 = sessionStore.getState().createSession('/c')

      const sorted = getSortedSessionIds(sessionStore.getState().sessions)
      expect(sorted).toEqual([s1.id, s2.id, s3.id])

      // From s1, next should be s2
      sessionStore.getState().focusSession(s1.id)
      const currentIdx = sorted.indexOf(s1.id)
      const nextIdx = (currentIdx + 1) % sorted.length
      expect(sorted[nextIdx]).toBe(s2.id)
    })

    it('wraps around at the end', () => {
      const s1 = sessionStore.getState().createSession('/a')
      const s2 = sessionStore.getState().createSession('/b')

      const sorted = getSortedSessionIds(sessionStore.getState().sessions)
      // From s2 (last), next should be s1 (first)
      const currentIdx = sorted.indexOf(s2.id)
      const nextIdx = (currentIdx + 1) % sorted.length
      expect(sorted[nextIdx]).toBe(s1.id)
    })

    it('cycles backward through sorted sessions', () => {
      const s1 = sessionStore.getState().createSession('/a')
      const s2 = sessionStore.getState().createSession('/b')
      const s3 = sessionStore.getState().createSession('/c')

      const sorted = getSortedSessionIds(sessionStore.getState().sessions)
      // From s1 (first), prev should be s3 (last)
      const currentIdx = sorted.indexOf(s1.id)
      const prevIdx = (currentIdx - 1 + sorted.length) % sorted.length
      expect(sorted[prevIdx]).toBe(s3.id)
    })

    it('selects first session when none focused (forward)', () => {
      const s1 = sessionStore.getState().createSession('/a')
      sessionStore.getState().createSession('/b')

      const sorted = getSortedSessionIds(sessionStore.getState().sessions)
      const currentIdx = -1 // no focus
      const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % sorted.length
      expect(sorted[nextIdx]).toBe(s1.id)
    })
  })

  describe('focus session by index', () => {
    it('Cmd+1 focuses first session', () => {
      const s1 = sessionStore.getState().createSession('/a')
      sessionStore.getState().createSession('/b')

      const sorted = getSortedSessionIds(sessionStore.getState().sessions)
      expect(sorted[0]).toBe(s1.id)
    })

    it('ignores index beyond session count', () => {
      sessionStore.getState().createSession('/a')
      const sorted = getSortedSessionIds(sessionStore.getState().sessions)
      expect(sorted[4]).toBeUndefined()
    })
  })
})
