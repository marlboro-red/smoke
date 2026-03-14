import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'

describe('sidebar highlight sync', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  it('highlightSession sets highlightedId for sidebar hover', () => {
    const session = sessionStore.getState().createSession('/home/user')
    sessionStore.getState().highlightSession(session.id)
    expect(sessionStore.getState().highlightedId).toBe(session.id)
  })

  it('highlightSession(null) clears highlight on mouse leave', () => {
    const session = sessionStore.getState().createSession('/home/user')
    sessionStore.getState().highlightSession(session.id)
    sessionStore.getState().highlightSession(null)
    expect(sessionStore.getState().highlightedId).toBeNull()
  })

  it('focusSession updates focusedId for sidebar active state', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    sessionStore.getState().focusSession(s1.id)
    expect(sessionStore.getState().focusedId).toBe(s1.id)
    sessionStore.getState().focusSession(s2.id)
    expect(sessionStore.getState().focusedId).toBe(s2.id)
  })

  it('removing highlighted session clears highlightedId', () => {
    const session = sessionStore.getState().createSession('/tmp')
    sessionStore.getState().highlightSession(session.id)
    sessionStore.getState().removeSession(session.id)
    expect(sessionStore.getState().highlightedId).toBeNull()
  })

  it('session list is sorted by createdAt for sidebar display', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    const s3 = sessionStore.getState().createSession('/c')
    const sessions = Array.from(sessionStore.getState().sessions.values())
    const sorted = [...sessions].sort((a, b) => a.createdAt - b.createdAt)
    expect(sorted[0].id).toBe(s1.id)
    expect(sorted[2].id).toBe(s3.id)
  })

  it('bringToFront increments zIndex for clicked sidebar item', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    const initialZ = sessionStore.getState().sessions.get(s1.id)!.zIndex
    sessionStore.getState().bringToFront(s1.id)
    const newZ = sessionStore.getState().sessions.get(s1.id)!.zIndex
    expect(newZ).toBeGreaterThan(initialZ)
    expect(newZ).toBeGreaterThan(sessionStore.getState().sessions.get(s2.id)!.zIndex)
  })
})

describe('pan-to-session calculation', () => {
  // Test the math used in useSidebarSync without needing DOM/RAF
  function calculatePanTarget(
    viewportWidth: number,
    viewportHeight: number,
    sessionX: number,
    sessionY: number,
    sessionWidth: number,
    sessionHeight: number,
    zoom: number
  ): { x: number; y: number } {
    return {
      x: viewportWidth / 2 - (sessionX + sessionWidth / 2) * zoom,
      y: viewportHeight / 2 - (sessionY + sessionHeight / 2) * zoom,
    }
  }

  it('centers session at origin in a 1920x1080 viewport at zoom=1', () => {
    const result = calculatePanTarget(1920, 1080, 0, 0, 640, 480, 1)
    // Center of session: (320, 240), viewport center: (960, 540)
    expect(result.x).toBe(960 - 320)  // 640
    expect(result.y).toBe(540 - 240)  // 300
  })

  it('accounts for session position offset', () => {
    const result = calculatePanTarget(1920, 1080, 500, 300, 640, 480, 1)
    // Center of session: (820, 540), viewport center: (960, 540)
    expect(result.x).toBe(960 - 820)  // 140
    expect(result.y).toBe(540 - 540)  // 0
  })

  it('accounts for zoom factor', () => {
    const result = calculatePanTarget(1920, 1080, 0, 0, 640, 480, 2)
    // Center of session in screen space: (320*2, 240*2) = (640, 480)
    expect(result.x).toBe(960 - 640)  // 320
    expect(result.y).toBe(540 - 480)  // 60
  })

  it('handles small viewport', () => {
    const result = calculatePanTarget(800, 600, 1000, 1000, 640, 480, 1)
    // Center of session: (1320, 1240), viewport center: (400, 300)
    expect(result.x).toBe(400 - 1320)  // -920
    expect(result.y).toBe(300 - 1240)  // -940
  })

  it('handles fractional zoom', () => {
    const result = calculatePanTarget(1920, 1080, 100, 100, 640, 480, 0.5)
    // Center of session in screen space: (420*0.5, 340*0.5) = (210, 170)
    expect(result.x).toBe(960 - 210)  // 750
    expect(result.y).toBe(540 - 170)  // 370
  })
})

describe('ease-out animation', () => {
  function easeOut(t: number): number {
    return 1 - (1 - t) * (1 - t)
  }

  it('starts at 0', () => {
    expect(easeOut(0)).toBe(0)
  })

  it('ends at 1', () => {
    expect(easeOut(1)).toBe(1)
  })

  it('is faster at start than linear', () => {
    expect(easeOut(0.25)).toBeGreaterThan(0.25)
  })

  it('decelerates toward the end (derivative decreasing)', () => {
    // The rate of change decreases as t approaches 1
    const delta1 = easeOut(0.3) - easeOut(0.2)
    const delta2 = easeOut(0.9) - easeOut(0.8)
    expect(delta1).toBeGreaterThan(delta2)
  })

  it('is monotonically increasing', () => {
    const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(easeOut)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })
})

describe('shortenCwd', () => {
  function shortenCwd(cwd: string): string {
    const home = '~'
    const parts = cwd.replace(/^\/Users\/[^/]+/, home).split('/')
    if (parts.length <= 3) return parts.join('/')
    return parts[0] + '/.../' + parts[parts.length - 1]
  }

  it('shortens home directory paths', () => {
    expect(shortenCwd('/Users/john/projects')).toBe('~/projects')
  })

  it('shortens deep paths with ellipsis', () => {
    expect(shortenCwd('/Users/john/projects/myapp/src')).toBe('~/.../src')
  })

  it('preserves short paths', () => {
    expect(shortenCwd('/tmp')).toBe('/tmp')
  })

  it('preserves root-relative short paths', () => {
    expect(shortenCwd('/var/log')).toBe('/var/log')
  })
})
