import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CanvasEvent } from '../../recording/types'

// Mock window.smokeAPI for EventRecorder
vi.stubGlobal('window', {
  smokeAPI: {
    recording: { flush: vi.fn().mockResolvedValue('/tmp/test.json') },
  },
})

const { replayStore } = await import('../replayStore')
const { replayEngine } = await import('../ReplayEngine')
const { sessionStore } = await import('../../stores/sessionStore')
const { canvasStore } = await import('../../stores/canvasStore')
const { snapshotStore } = await import('../../stores/snapshotStore')

const BASE_TS = 1000000

function makeSessionCreatedEvent(id: string, offset: number): CanvasEvent {
  return {
    timestamp: BASE_TS + offset,
    type: 'session_created',
    payload: {
      sessionId: id,
      type: 'terminal',
      title: `session-${id}`,
      cwd: '/tmp',
      position: { x: offset, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
    },
  }
}

function makeSessionMovedEvent(id: string, offset: number, toX: number, toY: number): CanvasEvent {
  return {
    timestamp: BASE_TS + offset,
    type: 'session_moved',
    payload: {
      sessionId: id,
      from: { x: 0, y: 0 },
      to: { x: toX, y: toY },
    },
  }
}

function makeViewportEvent(offset: number, panX: number, panY: number, zoom: number): CanvasEvent {
  return {
    timestamp: BASE_TS + offset,
    type: 'viewport_changed',
    payload: { panX, panY, zoom },
  }
}

function makeSnapshotEvent(id: string, offset: number, lines: string[]): CanvasEvent {
  return {
    timestamp: BASE_TS + offset,
    type: 'terminal_snapshot',
    payload: { sessionId: id, lines },
  }
}

function makeSessionClosedEvent(id: string, offset: number): CanvasEvent {
  return {
    timestamp: BASE_TS + offset,
    type: 'session_closed',
    payload: { sessionId: id },
  }
}

describe('ReplayEngine', () => {
  beforeEach(() => {
    // Clean up any active replay
    replayStore.getState().stopReplay()

    // Clear stores
    for (const id of sessionStore.getState().sessions.keys()) {
      sessionStore.getState().removeSession(id)
    }
    canvasStore.getState().setPan(0, 0)
    canvasStore.getState().setZoom(1)
  })

  it('applies session_created events on start', () => {
    const events: CanvasEvent[] = [
      makeSessionCreatedEvent('s1', 0),
      makeSessionCreatedEvent('s2', 1000),
    ]

    replayStore.getState().startReplay(events)
    // Manually seek to end to apply all events
    replayEngine.seekTo(events[events.length - 1].timestamp - events[0].timestamp)

    const sessions = sessionStore.getState().sessions
    expect(sessions.has('s1')).toBe(true)
    expect(sessions.has('s2')).toBe(true)
    expect(sessions.get('s1')!.title).toBe('session-s1')

    replayEngine.stop()
  })

  it('applies session_moved events', () => {
    const events: CanvasEvent[] = [
      makeSessionCreatedEvent('s1', 0),
      makeSessionMovedEvent('s1', 1000, 200, 300),
    ]

    replayStore.getState().startReplay(events)
    replayEngine.seekTo(1000)

    const session = sessionStore.getState().sessions.get('s1')
    expect(session!.position).toEqual({ x: 200, y: 300 })

    replayEngine.stop()
  })

  it('applies viewport_changed events', () => {
    const events: CanvasEvent[] = [
      makeViewportEvent(0, 0, 0, 1),
      makeViewportEvent(1000, 100, 200, 1.5),
    ]

    replayStore.getState().startReplay(events)
    replayEngine.seekTo(1000)

    expect(canvasStore.getState().panX).toBe(100)
    expect(canvasStore.getState().panY).toBe(200)
    expect(canvasStore.getState().zoom).toBe(1.5)

    replayEngine.stop()
  })

  it('applies terminal_snapshot events', () => {
    const events: CanvasEvent[] = [
      makeSessionCreatedEvent('s1', 0),
      makeSnapshotEvent('s1', 1000, ['$ ls', 'file.txt']),
    ]

    replayStore.getState().startReplay(events)
    replayEngine.seekTo(1000)

    const snapshot = snapshotStore.getState().snapshots.get('s1')
    expect(snapshot).toEqual(['$ ls', 'file.txt'])

    replayEngine.stop()
  })

  it('applies session_closed events', () => {
    const events: CanvasEvent[] = [
      makeSessionCreatedEvent('s1', 0),
      makeSessionClosedEvent('s1', 2000),
    ]

    replayStore.getState().startReplay(events)
    replayEngine.seekTo(2000)

    expect(sessionStore.getState().sessions.has('s1')).toBe(false)

    replayEngine.stop()
  })

  it('seeks forward and backward correctly', () => {
    const events: CanvasEvent[] = [
      makeSessionCreatedEvent('s1', 0),
      makeSessionCreatedEvent('s2', 1000),
      makeSessionCreatedEvent('s3', 2000),
    ]

    replayStore.getState().startReplay(events)

    // Seek to 1500ms — s1 and s2 should exist, s3 should not
    replayEngine.seekTo(1500)
    expect(sessionStore.getState().sessions.has('s1')).toBe(true)
    expect(sessionStore.getState().sessions.has('s2')).toBe(true)
    expect(sessionStore.getState().sessions.has('s3')).toBe(false)

    // Seek backward to 500ms — only s1 should exist
    replayEngine.seekTo(500)
    expect(sessionStore.getState().sessions.has('s1')).toBe(true)
    expect(sessionStore.getState().sessions.has('s2')).toBe(false)

    replayEngine.stop()
  })

  it('restores original state on stop', () => {
    // Create a session before replay
    const original = sessionStore.getState().createSession('/home')
    canvasStore.getState().setPan(50, 50)
    canvasStore.getState().setZoom(1.5)

    const events: CanvasEvent[] = [
      makeSessionCreatedEvent('replay-s1', 0),
      makeViewportEvent(1000, 200, 200, 2.0),
    ]

    replayStore.getState().startReplay(events)
    replayEngine.start()
    replayEngine.seekTo(1000)

    // During replay, original session should be gone
    expect(sessionStore.getState().sessions.has(original.id)).toBe(false)

    // Stop replay — original state should be restored
    replayEngine.stop()

    expect(sessionStore.getState().sessions.has(original.id)).toBe(true)
    expect(canvasStore.getState().panX).toBe(50)
    expect(canvasStore.getState().panY).toBe(50)
    expect(canvasStore.getState().zoom).toBe(1.5)

    // Clean up
    sessionStore.getState().removeSession(original.id)
  })
})
