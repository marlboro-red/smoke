import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { canvasStore } from '../../stores/canvasStore'
import { gridStore } from '../../stores/gridStore'
import { serializeCurrentLayout } from '../useLayoutPersistence'

describe('serializeCurrentLayout', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    canvasStore.setState({ panX: 0, panY: 0, zoom: 1.0, gridSize: 20 })
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true })
  })

  it('serializes empty layout when no sessions exist', () => {
    const layout = serializeCurrentLayout('test')
    expect(layout.name).toBe('test')
    expect(layout.sessions).toEqual([])
    expect(layout.viewport).toEqual({ panX: 0, panY: 0, zoom: 1.0 })
    expect(layout.gridSize).toBe(20)
  })

  it('serializes sessions with positions, sizes, CWDs, and titles', () => {
    const s1 = sessionStore.getState().createSession('/home/user/project', { x: 100, y: 200 })
    sessionStore.getState().updateSession(s1.id, {
      title: 'My Project',
      size: { cols: 120, rows: 40, width: 960, height: 640 },
    })

    const layout = serializeCurrentLayout('my-layout')
    expect(layout.sessions).toHaveLength(1)
    expect(layout.sessions[0]).toEqual({
      title: 'My Project',
      cwd: '/home/user/project',
      position: { x: 100, y: 200 },
      size: { width: 960, height: 640, cols: 120, rows: 40 },
    })
  })

  it('serializes multiple sessions', () => {
    sessionStore.getState().createSession('/a', { x: 0, y: 0 })
    sessionStore.getState().createSession('/b', { x: 700, y: 0 })
    sessionStore.getState().createSession('/c', { x: 0, y: 500 })

    const layout = serializeCurrentLayout('multi')
    expect(layout.sessions).toHaveLength(3)
    expect(layout.sessions.map((s) => s.cwd)).toEqual(['/a', '/b', '/c'])
  })

  it('captures current viewport state', () => {
    canvasStore.getState().setPan(-150, 300)
    canvasStore.getState().setZoom(1.5)

    const layout = serializeCurrentLayout('viewport-test')
    expect(layout.viewport).toEqual({ panX: -150, panY: 300, zoom: 1.5 })
  })

  it('captures current grid size', () => {
    gridStore.getState().setGridSize(40)

    const layout = serializeCurrentLayout('grid-test')
    expect(layout.gridSize).toBe(40)
  })
})

describe('layout auto-save debounce logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounce timer resets on rapid changes', () => {
    // Simulating the debounce behavior: if we fire multiple changes within 2s,
    // only the last one should trigger a save
    let saveCount = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const debouncedSave = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        saveCount++
      }, 2000)
    }

    // Rapid changes
    debouncedSave()
    debouncedSave()
    debouncedSave()

    // Before debounce expires
    vi.advanceTimersByTime(1500)
    expect(saveCount).toBe(0)

    // After debounce expires
    vi.advanceTimersByTime(1000)
    expect(saveCount).toBe(1)
  })
})

describe('layout data model', () => {
  it('Layout has correct shape when serialized from stores', () => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    canvasStore.setState({ panX: 50, panY: -100, zoom: 2.0, gridSize: 20 })
    gridStore.setState({ gridSize: 30, snapEnabled: true, showGrid: true })

    sessionStore.getState().createSession('/test/path', { x: 200, y: 300 })

    const layout = serializeCurrentLayout('shape-test')

    // Verify all required fields
    expect(layout).toHaveProperty('name')
    expect(layout).toHaveProperty('sessions')
    expect(layout).toHaveProperty('viewport')
    expect(layout).toHaveProperty('gridSize')

    // Verify session shape
    const session = layout.sessions[0]
    expect(session).toHaveProperty('title')
    expect(session).toHaveProperty('cwd')
    expect(session).toHaveProperty('position')
    expect(session).toHaveProperty('size')
    expect(session.position).toHaveProperty('x')
    expect(session.position).toHaveProperty('y')
    expect(session.size).toHaveProperty('width')
    expect(session.size).toHaveProperty('height')
    expect(session.size).toHaveProperty('cols')
    expect(session.size).toHaveProperty('rows')

    // Verify viewport shape
    expect(layout.viewport).toHaveProperty('panX')
    expect(layout.viewport).toHaveProperty('panY')
    expect(layout.viewport).toHaveProperty('zoom')
  })

  it('does not include transient session fields (id, zIndex, status, exitCode, createdAt)', () => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    canvasStore.setState({ panX: 0, panY: 0, zoom: 1.0, gridSize: 20 })
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true })

    sessionStore.getState().createSession('/tmp', { x: 0, y: 0 })

    const layout = serializeCurrentLayout('transient-test')
    const session = layout.sessions[0]
    const keys = Object.keys(session)
    expect(keys).toEqual(['title', 'cwd', 'position', 'size'])
    expect(session).not.toHaveProperty('id')
    expect(session).not.toHaveProperty('zIndex')
    expect(session).not.toHaveProperty('status')
    expect(session).not.toHaveProperty('exitCode')
    expect(session).not.toHaveProperty('createdAt')
  })
})
