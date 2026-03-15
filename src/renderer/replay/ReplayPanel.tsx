import { useState, useCallback, useEffect } from 'react'
import { replayStore, useIsReplaying } from './replayStore'
import { replayEngine } from './ReplayEngine'
import type { CanvasEvent } from '../recording/types'
import type { RecordingListEntry } from '../../preload/types'
import { eventRecorder } from '../recording/EventRecorder'
import { addToast } from '../stores/toastStore'
import '../styles/replay.css'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

export default function ReplayPanel(): JSX.Element {
  const [recordings, setRecordings] = useState<RecordingListEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const isReplaying = useIsReplaying()

  const refreshList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.smokeAPI.recording.list()
      setRecordings(list)
    } catch {
      setRecordings([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (expanded) {
      refreshList()
    }
  }, [expanded, refreshList])

  const handleLoadRecording = useCallback(async (filename: string) => {
    const data = await window.smokeAPI.recording.load(filename)
    if (!data || !data.events.length) return

    const events = data.events as CanvasEvent[]
    replayStore.getState().startReplay(events)
    replayEngine.start()
    replayEngine.play()
  }, [])

  const handleReplayCurrent = useCallback(() => {
    const events = eventRecorder.getEvents() as CanvasEvent[]
    if (events.length === 0) return

    replayStore.getState().startReplay([...events])
    replayEngine.start()
    replayEngine.play()
  }, [])

  const handleExport = useCallback(async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation()
    try {
      await window.smokeAPI.recording.exportRecording(filename)
      addToast(`Recording "${filename}" exported`, 'success')
    } catch (err) {
      addToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [])

  const handleImport = useCallback(async () => {
    const result = await window.smokeAPI.recording.importRecording()
    if (result) {
      refreshList()
    }
  }, [refreshList])

  if (isReplaying) return <></>

  return (
    <div className="replay-panel">
      <button
        className="replay-panel-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="replay-panel-toggle-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
        Recordings
      </button>

      {expanded && (
        <div className="replay-panel-content">
          <div className="replay-panel-actions">
            <button
              className="replay-panel-action"
              onClick={handleReplayCurrent}
              title="Replay events from the current session"
            >
              Replay current session
            </button>
            <button
              className="replay-panel-action replay-panel-action-secondary"
              onClick={handleImport}
              title="Import a .smoke-replay or JSON recording"
            >
              Import recording
            </button>
          </div>

          {loading && <div className="replay-panel-loading">Loading...</div>}

          {!loading && recordings.length === 0 && (
            <div className="replay-panel-empty">No saved recordings</div>
          )}

          {recordings.map((rec) => (
            <div key={rec.filename} className="replay-panel-item-row">
              <button
                className="replay-panel-item"
                onClick={() => handleLoadRecording(rec.filename)}
              >
                <span className="replay-panel-item-date">
                  {formatDate(rec.startedAt)}
                </span>
                <span className="replay-panel-item-meta">
                  {rec.eventCount} events &middot; {formatDuration(rec.durationMs)}
                </span>
              </button>
              <button
                className="replay-panel-export-btn"
                onClick={(e) => handleExport(e, rec.filename)}
                title="Export recording"
              >
                Export
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
