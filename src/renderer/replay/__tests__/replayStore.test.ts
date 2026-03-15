import { describe, it, expect, beforeEach } from 'vitest'
import type { CanvasEvent } from '../../recording/types'

const { replayStore } = await import('../replayStore')

function makeEvents(count: number, intervalMs = 1000): CanvasEvent[] {
  const base = 1000000
  return Array.from({ length: count }, (_, i) => ({
    timestamp: base + i * intervalMs,
    type: 'viewport_changed' as const,
    payload: { panX: i * 10, panY: 0, zoom: 1 },
  }))
}

describe('replayStore', () => {
  beforeEach(() => {
    replayStore.getState().stopReplay()
  })

  it('starts in inactive state', () => {
    const state = replayStore.getState()
    expect(state.active).toBe(false)
    expect(state.playing).toBe(false)
    expect(state.events).toHaveLength(0)
  })

  it('starts replay with events', () => {
    const events = makeEvents(5)
    replayStore.getState().startReplay(events)

    const state = replayStore.getState()
    expect(state.active).toBe(true)
    expect(state.playing).toBe(false)
    expect(state.events).toHaveLength(5)
    expect(state.currentIndex).toBe(0)
    expect(state.currentTime).toBe(0)
    expect(state.duration).toBe(4000) // 5 events, 1s apart
    expect(state.startTimestamp).toBe(1000000)
    expect(state.endTimestamp).toBe(1004000)
  })

  it('does not start replay with empty events', () => {
    replayStore.getState().startReplay([])
    expect(replayStore.getState().active).toBe(false)
  })

  it('plays and pauses', () => {
    replayStore.getState().startReplay(makeEvents(3))
    replayStore.getState().play()
    expect(replayStore.getState().playing).toBe(true)

    replayStore.getState().pause()
    expect(replayStore.getState().playing).toBe(false)
  })

  it('sets playback speed', () => {
    replayStore.getState().startReplay(makeEvents(3))
    replayStore.getState().setSpeed(4)
    expect(replayStore.getState().speed).toBe(4)
  })

  it('seeks to time position', () => {
    const events = makeEvents(5) // timestamps at 0, 1000, 2000, 3000, 4000 ms offset
    replayStore.getState().startReplay(events)

    // Seek to 2500ms — should be after events at 0, 1000, 2000 (3 events applied)
    replayStore.getState().seekTo(2500)
    const state = replayStore.getState()
    expect(state.currentTime).toBe(2500)
    expect(state.currentIndex).toBe(3) // events 0, 1, 2 have been "applied"
  })

  it('clamps seek within bounds', () => {
    replayStore.getState().startReplay(makeEvents(3))

    replayStore.getState().seekTo(-100)
    expect(replayStore.getState().currentTime).toBe(0)

    replayStore.getState().seekTo(999999)
    expect(replayStore.getState().currentTime).toBe(replayStore.getState().duration)
  })

  it('stops replay and resets state', () => {
    replayStore.getState().startReplay(makeEvents(5))
    replayStore.getState().play()
    replayStore.getState().setCurrentTime(1500)

    replayStore.getState().stopReplay()

    const state = replayStore.getState()
    expect(state.active).toBe(false)
    expect(state.playing).toBe(false)
    expect(state.events).toHaveLength(0)
    expect(state.currentTime).toBe(0)
    expect(state.duration).toBe(0)
  })

  it('advances index', () => {
    replayStore.getState().startReplay(makeEvents(3))
    expect(replayStore.getState().currentIndex).toBe(0)

    replayStore.getState().advanceIndex()
    expect(replayStore.getState().currentIndex).toBe(1)

    replayStore.getState().advanceIndex()
    expect(replayStore.getState().currentIndex).toBe(2)
  })
})
