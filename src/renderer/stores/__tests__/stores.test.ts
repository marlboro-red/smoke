import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore } from '../sessionStore'
import { canvasStore } from '../canvasStore'
import { gridStore } from '../gridStore'

describe('sessionStore', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  it('creates a session with UUID, default size, and returns it', () => {
    const session = sessionStore.getState().createSession('/home/user/project')
    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(session.size).toEqual({ cols: 80, rows: 24, width: 640, height: 480 })
    expect(session.status).toBe('running')
    expect(session.cwd).toBe('/home/user/project')
    expect(session.title).toBe('project')
    expect(session.position).toEqual({ x: 0, y: 0 })
  })

  it('creates a session with custom position', () => {
    const session = sessionStore.getState().createSession('/tmp', { x: 100, y: 200 })
    expect(session.position).toEqual({ x: 100, y: 200 })
  })

  it('stores sessions in Map for efficient lookup by ID', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    const { sessions } = sessionStore.getState()
    expect(sessions).toBeInstanceOf(Map)
    expect(sessions.get(s1.id)).toEqual(s1)
    expect(sessions.get(s2.id)).toEqual(s2)
    expect(sessions.size).toBe(2)
  })

  it('removes a session', () => {
    const session = sessionStore.getState().createSession('/tmp')
    sessionStore.getState().removeSession(session.id)
    expect(sessionStore.getState().sessions.size).toBe(0)
  })

  it('updates a session with partial patch', () => {
    const session = sessionStore.getState().createSession('/tmp')
    sessionStore.getState().updateSession(session.id, { title: 'Custom Title' })
    expect(sessionStore.getState().sessions.get(session.id)!.title).toBe('Custom Title')
  })

  it('focuses a session', () => {
    const session = sessionStore.getState().createSession('/tmp')
    sessionStore.getState().focusSession(session.id)
    expect(sessionStore.getState().focusedId).toBe(session.id)
  })

  it('highlights a session', () => {
    const session = sessionStore.getState().createSession('/tmp')
    sessionStore.getState().highlightSession(session.id)
    expect(sessionStore.getState().highlightedId).toBe(session.id)
    sessionStore.getState().highlightSession(null)
    expect(sessionStore.getState().highlightedId).toBeNull()
  })

  it('brings a session to front by incrementing zIndex', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    sessionStore.getState().bringToFront(s1.id)
    const updated = sessionStore.getState().sessions.get(s1.id)!
    expect(updated.zIndex).toBeGreaterThan(s2.zIndex)
  })

  it('clears focusedId when focused session is removed', () => {
    const session = sessionStore.getState().createSession('/tmp')
    sessionStore.getState().focusSession(session.id)
    sessionStore.getState().removeSession(session.id)
    expect(sessionStore.getState().focusedId).toBeNull()
  })
})

describe('canvasStore', () => {
  beforeEach(() => {
    canvasStore.setState({ panX: 0, panY: 0, zoom: 1.0, gridSize: 20 })
  })

  it('setPan updates values', () => {
    canvasStore.getState().setPan(100, 200)
    const state = canvasStore.getState()
    expect(state.panX).toBe(100)
    expect(state.panY).toBe(200)
  })

  it('setZoom updates value', () => {
    canvasStore.getState().setZoom(2.0)
    expect(canvasStore.getState().zoom).toBe(2.0)
  })

  it('setZoom clamps to 0.1–3.0', () => {
    canvasStore.getState().setZoom(0.05)
    expect(canvasStore.getState().zoom).toBe(0.1)
    canvasStore.getState().setZoom(5.0)
    expect(canvasStore.getState().zoom).toBe(3.0)
  })

  it('setGridSize updates value', () => {
    canvasStore.getState().setGridSize(40)
    expect(canvasStore.getState().gridSize).toBe(40)
  })
})

describe('gridStore', () => {
  beforeEach(() => {
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true })
  })

  it('snapToGrid(107) with gridSize=20 returns 100', () => {
    expect(gridStore.getState().snapToGrid(107)).toBe(100)
  })

  it('snapToGrid(113) with gridSize=20 returns 120', () => {
    expect(gridStore.getState().snapToGrid(113)).toBe(120)
  })

  it('toggleSnap toggles the value', () => {
    expect(gridStore.getState().snapEnabled).toBe(true)
    gridStore.getState().toggleSnap()
    expect(gridStore.getState().snapEnabled).toBe(false)
    gridStore.getState().toggleSnap()
    expect(gridStore.getState().snapEnabled).toBe(true)
  })

  it('toggleGrid toggles the value', () => {
    expect(gridStore.getState().showGrid).toBe(true)
    gridStore.getState().toggleGrid()
    expect(gridStore.getState().showGrid).toBe(false)
  })

  it('setGridSize updates gridSize', () => {
    gridStore.getState().setGridSize(40)
    expect(gridStore.getState().gridSize).toBe(40)
  })

  it('snapToGrid uses current gridSize', () => {
    gridStore.getState().setGridSize(10)
    expect(gridStore.getState().snapToGrid(17)).toBe(20)
    expect(gridStore.getState().snapToGrid(14)).toBe(10)
  })
})
