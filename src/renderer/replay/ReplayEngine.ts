import { replayStore } from './replayStore'
import { sessionStore } from '../stores/sessionStore'
import { canvasStore } from '../stores/canvasStore'
import { snapshotStore } from '../stores/snapshotStore'
import { eventRecorder } from '../recording/EventRecorder'
import type { CanvasEvent, CanvasEventPayloadMap } from '../recording/types'

class ReplayEngine {
  private rafId: number | null = null
  private lastFrameTime: number | null = null
  /** Session state before replay started, for restoration */
  private savedSessions: ReturnType<typeof sessionStore.getState>['sessions'] | null = null
  private savedSnapshots: ReturnType<typeof snapshotStore.getState>['snapshots'] | null = null
  private savedPan: { x: number; y: number } | null = null
  private savedZoom: number | null = null
  private wasRecording = true

  start(): void {
    const state = replayStore.getState()
    if (!state.active || state.events.length === 0) return

    // Save current state for restoration
    this.savedSessions = new Map(sessionStore.getState().sessions)
    this.savedSnapshots = new Map(snapshotStore.getState().snapshots)
    this.savedPan = { x: canvasStore.getState().panX, y: canvasStore.getState().panY }
    this.savedZoom = canvasStore.getState().zoom

    // Pause event recording during replay
    this.wasRecording = eventRecorder.recording
    eventRecorder.pause()

    // Clear current state for clean replay
    this.clearCanvasState()

    // Apply all events up to currentIndex (for seek support)
    this.applyEventsUpTo(state.currentIndex)
  }

  stop(): void {
    this.stopLoop()

    // Restore original state
    if (this.savedSessions) {
      // Clear replay sessions
      this.clearCanvasState()
      // Restore saved sessions
      for (const [id, session] of this.savedSessions) {
        sessionStore.setState((s) => {
          const sessions = new Map(s.sessions)
          sessions.set(id, session)
          return { sessions }
        })
      }
      this.savedSessions = null
    }
    if (this.savedSnapshots) {
      for (const [id, lines] of this.savedSnapshots) {
        snapshotStore.getState().setSnapshot(id, lines)
      }
      this.savedSnapshots = null
    }
    if (this.savedPan) {
      canvasStore.getState().setPan(this.savedPan.x, this.savedPan.y)
      this.savedPan = null
    }
    if (this.savedZoom != null) {
      canvasStore.getState().setZoom(this.savedZoom)
      this.savedZoom = null
    }

    // Resume event recording
    if (this.wasRecording) {
      eventRecorder.resume()
    }

    replayStore.getState().stopReplay()
  }

  play(): void {
    replayStore.getState().play()
    this.lastFrameTime = null
    this.startLoop()
  }

  pause(): void {
    replayStore.getState().pause()
    this.stopLoop()
  }

  seekTo(timeMs: number): void {
    const wasPlaying = replayStore.getState().playing
    if (wasPlaying) this.stopLoop()

    replayStore.getState().seekTo(timeMs)

    // Reapply all events from scratch up to new index
    this.clearCanvasState()
    this.applyEventsUpTo(replayStore.getState().currentIndex)

    if (wasPlaying) {
      this.lastFrameTime = null
      this.startLoop()
    }
  }

  private startLoop(): void {
    if (this.rafId != null) return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private stopLoop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.lastFrameTime = null
  }

  private tick = (now: number): void => {
    this.rafId = null
    const state = replayStore.getState()
    if (!state.active || !state.playing) return

    if (this.lastFrameTime == null) {
      this.lastFrameTime = now
      this.rafId = requestAnimationFrame(this.tick)
      return
    }

    const deltaMs = (now - this.lastFrameTime) * state.speed
    this.lastFrameTime = now

    const newTime = Math.min(state.currentTime + deltaMs, state.duration)
    replayStore.getState().setCurrentTime(newTime)

    const targetTimestamp = state.startTimestamp + newTime

    // Apply all events up to the current time
    let { currentIndex } = state
    while (currentIndex < state.events.length && state.events[currentIndex].timestamp <= targetTimestamp) {
      this.applyEvent(state.events[currentIndex])
      currentIndex++
      replayStore.getState().advanceIndex()
    }

    // Check if replay is complete
    if (newTime >= state.duration) {
      replayStore.getState().pause()
      this.stopLoop()
      return
    }

    this.rafId = requestAnimationFrame(this.tick)
  }

  private clearCanvasState(): void {
    const sessions = sessionStore.getState().sessions
    for (const id of sessions.keys()) {
      sessionStore.getState().removeSession(id)
    }
  }

  private applyEventsUpTo(index: number): void {
    const { events } = replayStore.getState()
    for (let i = 0; i < index; i++) {
      this.applyEvent(events[i])
    }
  }

  private applyEvent(event: CanvasEvent): void {
    switch (event.type) {
      case 'session_created': {
        const p = event.payload as CanvasEventPayloadMap['session_created']
        // Insert directly into the store with the recorded ID
        const session = {
          id: p.sessionId,
          type: p.type,
          title: p.title,
          position: p.position,
          size: p.size,
          zIndex: 1,
          createdAt: event.timestamp,
          ...(p.type === 'terminal' ? { cwd: p.cwd || '', status: 'exited' as const } : {}),
          ...(p.type === 'file' ? { filePath: p.filePath || '', content: '', language: '' } : {}),
        }
        sessionStore.setState((s) => {
          const sessions = new Map(s.sessions)
          sessions.set(p.sessionId, session as any)
          return { sessions }
        })
        break
      }
      case 'session_closed': {
        const p = event.payload as CanvasEventPayloadMap['session_closed']
        sessionStore.getState().removeSession(p.sessionId)
        snapshotStore.getState().removeSnapshot(p.sessionId)
        break
      }
      case 'session_moved': {
        const p = event.payload as CanvasEventPayloadMap['session_moved']
        sessionStore.getState().updateSession(p.sessionId, { position: p.to })
        break
      }
      case 'session_resized': {
        const p = event.payload as CanvasEventPayloadMap['session_resized']
        sessionStore.getState().updateSession(p.sessionId, { size: p.to })
        break
      }
      case 'terminal_snapshot': {
        const p = event.payload as CanvasEventPayloadMap['terminal_snapshot']
        snapshotStore.getState().setSnapshot(p.sessionId, p.lines)
        break
      }
      case 'viewport_changed': {
        const p = event.payload as CanvasEventPayloadMap['viewport_changed']
        canvasStore.getState().setPan(p.panX, p.panY)
        canvasStore.getState().setZoom(p.zoom)
        break
      }
      case 'ai_message':
        // AI messages are displayed in the timeline but don't modify stores during replay
        break
    }
  }
}

export const replayEngine = new ReplayEngine()
