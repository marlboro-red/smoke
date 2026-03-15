import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { CanvasEvent } from '../recording/types'

export type PlaybackSpeed = 0.5 | 1 | 2 | 4

interface ReplayStore {
  /** Whether a replay is currently active (regardless of play/pause) */
  active: boolean
  /** Whether playback is currently running (vs paused) */
  playing: boolean
  /** All events in the loaded recording */
  events: CanvasEvent[]
  /** Index of the next event to apply */
  currentIndex: number
  /** Playback speed multiplier */
  speed: PlaybackSpeed
  /** Timestamp of the first event (real recording time) */
  startTimestamp: number
  /** Timestamp of the last event */
  endTimestamp: number
  /** Current playback position (ms offset from start) */
  currentTime: number
  /** Total duration in ms */
  duration: number

  startReplay: (events: CanvasEvent[]) => void
  stopReplay: () => void
  play: () => void
  pause: () => void
  setSpeed: (speed: PlaybackSpeed) => void
  seekTo: (timeMs: number) => void
  setCurrentTime: (timeMs: number) => void
  advanceIndex: () => void
}

export const replayStore = createStore<ReplayStore>((set) => ({
  active: false,
  playing: false,
  events: [],
  currentIndex: 0,
  speed: 1,
  startTimestamp: 0,
  endTimestamp: 0,
  currentTime: 0,
  duration: 0,

  startReplay: (events: CanvasEvent[]) => {
    if (events.length === 0) return
    const start = events[0].timestamp
    const end = events[events.length - 1].timestamp
    set({
      active: true,
      playing: false,
      events,
      currentIndex: 0,
      currentTime: 0,
      startTimestamp: start,
      endTimestamp: end,
      duration: end - start,
    })
  },

  stopReplay: () => {
    set({
      active: false,
      playing: false,
      events: [],
      currentIndex: 0,
      currentTime: 0,
      startTimestamp: 0,
      endTimestamp: 0,
      duration: 0,
    })
  },

  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),

  setSpeed: (speed: PlaybackSpeed) => set({ speed }),

  seekTo: (timeMs: number) => {
    set((state) => {
      const clamped = Math.max(0, Math.min(timeMs, state.duration))
      const targetTimestamp = state.startTimestamp + clamped
      // Find the index of the first event at or after the target time
      let index = 0
      for (let i = 0; i < state.events.length; i++) {
        if (state.events[i].timestamp > targetTimestamp) break
        index = i + 1
      }
      return { currentTime: clamped, currentIndex: index }
    })
  },

  setCurrentTime: (timeMs: number) => set({ currentTime: timeMs }),

  advanceIndex: () => set((state) => ({ currentIndex: state.currentIndex + 1 })),
}))

export const useReplayStore = <T>(selector: (state: ReplayStore) => T): T =>
  useStore(replayStore, selector)

export const useIsReplaying = (): boolean =>
  useStore(replayStore, (s) => s.active)

export const useIsPlaying = (): boolean =>
  useStore(replayStore, (s) => s.playing)

export const useReplayProgress = (): { currentTime: number; duration: number } =>
  useStore(replayStore, (s) => ({ currentTime: s.currentTime, duration: s.duration }))
