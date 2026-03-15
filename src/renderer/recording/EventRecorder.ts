import type { CanvasEvent, CanvasEventType, CanvasEventPayloadMap, EventLog } from './types'

const MAX_EVENTS = 10_000

class EventRecorder {
  private events: CanvasEvent[] = []
  private startedAt: number = Date.now()
  private _recording = true

  record<T extends CanvasEventType>(type: T, payload: CanvasEventPayloadMap[T]): void {
    if (!this._recording) return

    this.events.push({
      timestamp: Date.now(),
      type,
      payload,
    } as CanvasEvent)

    // Evict oldest events if over capacity
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(this.events.length - MAX_EVENTS)
    }
  }

  getEvents(): readonly CanvasEvent[] {
    return this.events
  }

  getEventLog(): EventLog {
    return {
      version: 1,
      startedAt: this.startedAt,
      events: [...this.events],
    }
  }

  clear(): void {
    this.events = []
    this.startedAt = Date.now()
  }

  get recording(): boolean {
    return this._recording
  }

  pause(): void {
    this._recording = false
  }

  resume(): void {
    this._recording = true
  }

  get eventCount(): number {
    return this.events.length
  }

  async flushToDisk(): Promise<string> {
    const log = this.getEventLog()
    const filePath = await window.smokeAPI.recording.flush(log)
    return filePath
  }
}

export const eventRecorder = new EventRecorder()
