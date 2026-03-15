import { useCallback, useRef } from 'react'
import { useReplayStore, replayStore } from './replayStore'
import { replayEngine } from './ReplayEngine'
import type { PlaybackSpeed } from './replayStore'
import '../styles/replay.css'

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 1, 2, 4]

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function ReplayControls(): JSX.Element {
  const playing = useReplayStore((s) => s.playing)
  const currentTime = useReplayStore((s) => s.currentTime)
  const duration = useReplayStore((s) => s.duration)
  const speed = useReplayStore((s) => s.speed)
  const currentIndex = useReplayStore((s) => s.currentIndex)
  const eventCount = useReplayStore((s) => s.events.length)
  const scrubberRef = useRef<HTMLDivElement>(null)

  const handlePlayPause = useCallback(() => {
    if (playing) {
      replayEngine.pause()
    } else {
      replayEngine.play()
    }
  }, [playing])

  const handleStop = useCallback(() => {
    replayEngine.stop()
  }, [])

  const handleSpeedClick = useCallback(() => {
    const currentIdx = SPEED_OPTIONS.indexOf(speed)
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length
    replayStore.getState().setSpeed(SPEED_OPTIONS[nextIdx])
  }, [speed])

  const handleScrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = scrubberRef.current
      if (!bar || duration === 0) return
      const rect = bar.getBoundingClientRect()
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      replayEngine.seekTo(fraction * duration)
    },
    [duration]
  )

  const handleScrubDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.buttons !== 1) return
      handleScrub(e)
    },
    [handleScrub]
  )

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="replay-controls">
      <div className="replay-controls-inner">
        <div className="replay-label">REPLAY</div>

        <button
          className="replay-btn replay-btn-play"
          onClick={handlePlayPause}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '\u23F8' : '\u25B6'}
        </button>

        <button
          className="replay-btn replay-btn-stop"
          onClick={handleStop}
          title="Stop replay"
        >
          \u23F9
        </button>

        <div
          className="replay-scrubber"
          ref={scrubberRef}
          onClick={handleScrub}
          onMouseMove={handleScrubDrag}
        >
          <div
            className="replay-scrubber-fill"
            style={{ width: `${progress}%` }}
          />
          <div
            className="replay-scrubber-handle"
            style={{ left: `${progress}%` }}
          />
        </div>

        <span className="replay-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <button
          className="replay-btn replay-btn-speed"
          onClick={handleSpeedClick}
          title="Change playback speed"
        >
          {speed}x
        </button>

        <span className="replay-event-count">
          {currentIndex}/{eventCount} events
        </span>
      </div>
    </div>
  )
}
