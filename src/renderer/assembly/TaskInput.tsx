import { useEffect, useRef, useCallback } from 'react'
import {
  taskInputStore,
  useTaskInputOpen,
  useTaskInputQuery,
  useTaskInputLoading,
  useTaskInputPhase,
  useTaskHistory,
  type AssemblyPhase,
} from './taskInputStore'
import '../styles/task-input.css'

const PHASE_LABELS: Record<AssemblyPhase, string> = {
  indexing: 'Indexing codebase...',
  searching: 'Searching for relevant files...',
  scoring: 'Scoring relevance...',
  assembling: 'Assembling workspace...',
}

const PHASE_ORDER: AssemblyPhase[] = ['indexing', 'searching', 'scoring', 'assembling']

function PhaseIndicator({ phase }: { phase: AssemblyPhase }): JSX.Element {
  const idx = PHASE_ORDER.indexOf(phase)

  return (
    <div className="task-input-progress">
      <div className="task-input-progress-bar">
        <div
          className="task-input-progress-fill"
          style={{ width: `${((idx + 1) / PHASE_ORDER.length) * 100}%` }}
        />
      </div>
      <div className="task-input-progress-phases">
        {PHASE_ORDER.map((p, i) => (
          <span
            key={p}
            className={`task-input-phase ${i < idx ? 'done' : ''} ${p === phase ? 'active' : ''}`}
          >
            {i < idx ? '\u2713' : ''} {PHASE_LABELS[p].replace('...', '')}
          </span>
        ))}
      </div>
    </div>
  )
}

function HistoryList({ onSelect }: { onSelect: (desc: string) => void }): JSX.Element | null {
  const history = useTaskHistory()

  if (history.length === 0) return null

  return (
    <div className="task-input-history">
      <div className="task-input-history-header">
        <span className="task-input-history-title">Recent tasks</span>
        <button
          className="task-input-history-clear"
          onClick={() => taskInputStore.getState().clearHistory()}
          title="Clear task history"
        >
          Clear
        </button>
      </div>
      <div className="task-input-history-list">
        {history.map((entry) => (
          <button
            key={entry.timestamp}
            className="task-input-history-item"
            onClick={() => onSelect(entry.description)}
          >
            <span className="task-input-history-text">{entry.description}</span>
            <button
              className="task-input-history-remove"
              onClick={(e) => {
                e.stopPropagation()
                taskInputStore.getState().removeHistoryEntry(entry.timestamp)
              }}
              title="Remove from history"
            >
              &times;
            </button>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function TaskInput(): JSX.Element | null {
  const isOpen = useTaskInputOpen()
  const query = useTaskInputQuery()
  const loading = useTaskInputLoading()
  const phase = useTaskInputPhase()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to let animation start
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault()
        e.stopPropagation()
        taskInputStore.getState().close()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [isOpen, loading])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current && !loading) {
        taskInputStore.getState().close()
      }
    },
    [loading],
  )

  const handleSubmit = useCallback(() => {
    const q = taskInputStore.getState().query.trim()
    if (q && !taskInputStore.getState().loading) {
      taskInputStore.getState().submit(q)
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleHistorySelect = useCallback((description: string) => {
    taskInputStore.getState().setQuery(description)
    inputRef.current?.focus()
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    taskInputStore.getState().setQuery(e.target.value)
  }, [])

  if (!isOpen) return null

  return (
    <div className="task-input-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="task-input-modal">
        {/* Header */}
        <div className="task-input-header">
          <div className="task-input-header-top">
            <h2 className="task-input-title">Assemble Workspace</h2>
            <button
              className="task-input-close-btn"
              onClick={() => taskInputStore.getState().close()}
              disabled={loading}
              aria-label="Close"
              title="Close"
            >
              &times;
            </button>
          </div>
          <p className="task-input-subtitle">
            Describe what you're working on and the relevant files will be assembled on the canvas.
          </p>
        </div>

        {/* Input area */}
        <div className="task-input-body">
          <div className="task-input-field-wrapper">
            <textarea
              ref={inputRef}
              className="task-input-field"
              placeholder="e.g. Fix the login timeout bug in the auth middleware..."
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={3}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {/* Loading state */}
          {loading && phase && <PhaseIndicator phase={phase} />}

          {/* History */}
          {!loading && <HistoryList onSelect={handleHistorySelect} />}
        </div>

        {/* Footer */}
        <div className="task-input-footer">
          <span className="task-input-footer-hint">
            {loading ? 'Processing...' : 'Enter to submit \u00b7 Esc to cancel'}
          </span>
          <div className="task-input-footer-actions">
            <button
              className="task-input-cancel-btn"
              onClick={() => taskInputStore.getState().close()}
              disabled={loading}
              title="Cancel and close"
            >
              Cancel
            </button>
            <button
              className="task-input-submit-btn"
              onClick={handleSubmit}
              disabled={loading || !query.trim()}
              title="Assemble workspace from task description"
            >
              {loading ? 'Assembling...' : 'Assemble'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
