import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { sessionStore } from '../sessionStore'
import { regionStore } from '../regionStore'
import { gridStore } from '../gridStore'
import { reSnapAllElements } from '../reSnapAllElements'

describe('reSnapAllElements', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    regionStore.setState({ regions: new Map() })
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true, isResnapping: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-snaps session positions to the new grid size', () => {
    // Create a session at position (25, 37) — not aligned to grid 30
    const session = sessionStore.getState().createSession('/tmp', { x: 25, y: 37 })
    sessionStore.getState().updateSession(session.id, {
      size: { cols: 80, rows: 24, width: 640, height: 480 },
    })

    reSnapAllElements(30)

    const updated = sessionStore.getState().sessions.get(session.id)!
    // 25 → snap to 30, 37 → snap to 30
    expect(updated.position.x).toBe(30)
    expect(updated.position.y).toBe(30)
  })

  it('re-snaps session sizes to the new grid size', () => {
    const session = sessionStore.getState().createSession('/tmp', { x: 0, y: 0 })
    sessionStore.getState().updateSession(session.id, {
      size: { cols: 80, rows: 24, width: 645, height: 485 },
    })

    reSnapAllElements(30)

    const updated = sessionStore.getState().sessions.get(session.id)!
    // 645 → round(21.5)*30 = 660, 485 → round(16.17)*30 = 480
    expect(updated.size.width).toBe(660)
    expect(updated.size.height).toBe(480)
  })

  it('re-snaps region positions to the new grid size', () => {
    const region = regionStore.getState().createRegion('Test', { x: 55, y: 73 }, { width: 600, height: 400 })

    reSnapAllElements(30)

    const updated = regionStore.getState().regions.get(region.id)!
    // 55 → snap to 60, 73 → snap to 60
    expect(updated.position.x).toBe(60)
    expect(updated.position.y).toBe(60)
  })

  it('re-snaps region sizes to the new grid size', () => {
    const region = regionStore.getState().createRegion('Test', { x: 0, y: 0 }, { width: 615, height: 410 })

    reSnapAllElements(30)

    const updated = regionStore.getState().regions.get(region.id)!
    // 615 → round(20.5)*30 = 630, 410 → round(13.67)*30 = 420
    expect(updated.size.width).toBe(630)
    expect(updated.size.height).toBe(420)
  })

  it('sets isResnapping to true during transition and false after 300ms', () => {
    sessionStore.getState().createSession('/tmp', { x: 25, y: 37 })

    reSnapAllElements(30)

    expect(gridStore.getState().isResnapping).toBe(true)

    vi.advanceTimersByTime(300)

    expect(gridStore.getState().isResnapping).toBe(false)
  })

  it('handles multiple sessions correctly', () => {
    sessionStore.getState().createSession('/a', { x: 13, y: 27 })
    sessionStore.getState().createSession('/b', { x: 48, y: 55 })

    reSnapAllElements(25)

    const sessions = Array.from(sessionStore.getState().sessions.values())
    // 13 → 25, 27 → 25
    expect(sessions[0].position).toEqual({ x: 25, y: 25 })
    // 48 → 50, 55 → 50
    expect(sessions[1].position).toEqual({ x: 50, y: 50 })
  })

  it('enforces minimum size based on new grid', () => {
    const session = sessionStore.getState().createSession('/tmp', { x: 0, y: 0 })
    sessionStore.getState().updateSession(session.id, {
      size: { cols: 80, rows: 24, width: 100, height: 80 },
    })

    reSnapAllElements(50)

    const updated = sessionStore.getState().sessions.get(session.id)!
    // min width = 10 * 50 = 500, min height = 8 * 50 = 400
    expect(updated.size.width).toBe(500)
    expect(updated.size.height).toBe(400)
  })
})
