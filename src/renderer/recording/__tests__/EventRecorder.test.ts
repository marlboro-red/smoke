import { describe, it, expect, beforeEach, vi } from 'vitest'

// We need to mock window.smokeAPI before importing EventRecorder
const mockFlush = vi.fn().mockResolvedValue('/tmp/recording.json')
vi.stubGlobal('window', {
  smokeAPI: {
    recording: { flush: mockFlush },
  },
})

// Dynamic import after globals are set up
const { EventRecorder } = await import('../EventRecorder').then((m) => {
  // EventRecorder is exported as a singleton; we need the class for fresh instances
  return { EventRecorder: m.eventRecorder.constructor as new () => typeof m.eventRecorder }
})

describe('EventRecorder', () => {
  let recorder: InstanceType<typeof EventRecorder>

  beforeEach(() => {
    recorder = new EventRecorder()
    mockFlush.mockClear()
  })

  it('records events with timestamps', () => {
    recorder.record('session_created', {
      sessionId: 'abc',
      type: 'terminal',
      title: 'test',
      position: { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
    })

    const events = recorder.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('session_created')
    expect(events[0].timestamp).toBeGreaterThan(0)
    expect(events[0].payload.sessionId).toBe('abc')
  })

  it('tracks event count', () => {
    expect(recorder.eventCount).toBe(0)

    recorder.record('viewport_changed', { panX: 10, panY: 20, zoom: 1.5 })
    recorder.record('viewport_changed', { panX: 30, panY: 40, zoom: 2.0 })

    expect(recorder.eventCount).toBe(2)
  })

  it('returns event log with version and startedAt', () => {
    recorder.record('session_closed', { sessionId: 'xyz' })

    const log = recorder.getEventLog()
    expect(log.version).toBe(1)
    expect(log.startedAt).toBeGreaterThan(0)
    expect(log.events).toHaveLength(1)
  })

  it('clears events and resets startedAt', () => {
    recorder.record('session_moved', {
      sessionId: 'a',
      from: { x: 0, y: 0 },
      to: { x: 100, y: 200 },
    })
    expect(recorder.eventCount).toBe(1)

    recorder.clear()
    expect(recorder.eventCount).toBe(0)
    expect(recorder.getEvents()).toHaveLength(0)
  })

  it('pauses and resumes recording', () => {
    expect(recorder.recording).toBe(true)

    recorder.pause()
    expect(recorder.recording).toBe(false)

    recorder.record('viewport_changed', { panX: 0, panY: 0, zoom: 1 })
    expect(recorder.eventCount).toBe(0)

    recorder.resume()
    expect(recorder.recording).toBe(true)

    recorder.record('viewport_changed', { panX: 10, panY: 10, zoom: 1 })
    expect(recorder.eventCount).toBe(1)
  })

  it('evicts oldest events when exceeding capacity', () => {
    // Record more than MAX_EVENTS (10_000)
    for (let i = 0; i < 10_005; i++) {
      recorder.record('viewport_changed', { panX: i, panY: 0, zoom: 1 })
    }

    expect(recorder.eventCount).toBe(10_000)
    // First event should be the 6th one recorded (index 5)
    const first = recorder.getEvents()[0]
    expect(first.payload.panX).toBe(5)
  })

  it('flushes to disk via IPC', async () => {
    recorder.record('session_created', {
      sessionId: 'flush-test',
      type: 'terminal',
      title: 'test',
      position: { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
    })

    const path = await recorder.flushToDisk()
    expect(path).toBe('/tmp/recording.json')
    expect(mockFlush).toHaveBeenCalledOnce()

    const arg = mockFlush.mock.calls[0][0]
    expect(arg.version).toBe(1)
    expect(arg.events).toHaveLength(1)
  })

  it('records all event types', () => {
    recorder.record('session_created', {
      sessionId: 's1',
      type: 'terminal',
      title: 'term',
      cwd: '/tmp',
      position: { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
    })
    recorder.record('session_moved', {
      sessionId: 's1',
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
    })
    recorder.record('session_resized', {
      sessionId: 's1',
      from: { cols: 80, rows: 24, width: 640, height: 480 },
      to: { cols: 120, rows: 36, width: 960, height: 720 },
    })
    recorder.record('terminal_snapshot', {
      sessionId: 's1',
      lines: ['$ hello', 'world'],
    })
    recorder.record('ai_message', {
      conversationId: 'c1',
      role: 'user',
      text: 'hello',
    })
    recorder.record('viewport_changed', { panX: 50, panY: 50, zoom: 1.5 })
    recorder.record('session_closed', { sessionId: 's1', exitCode: 0 })

    expect(recorder.eventCount).toBe(7)
    const types = recorder.getEvents().map((e) => e.type)
    expect(types).toEqual([
      'session_created',
      'session_moved',
      'session_resized',
      'terminal_snapshot',
      'ai_message',
      'viewport_changed',
      'session_closed',
    ])
  })
})
