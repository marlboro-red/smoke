import { useRef, useEffect, useCallback } from 'react'
import { useTerminalSearch } from './terminalSearchStore'
import { getTerminal } from './terminalRegistry'
import '../styles/terminal-search.css'

interface TerminalSearchBarProps {
  sessionId: string
}

export default function TerminalSearchBar({ sessionId }: TerminalSearchBarProps): JSX.Element | null {
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    activeSessionId,
    query,
    caseSensitive,
    regex,
    resultIndex,
    resultCount,
    setQuery,
    toggleCaseSensitive,
    toggleRegex,
    findNext,
    findPrevious,
    close,
  } = useTerminalSearch()

  const isActive = activeSessionId === sessionId

  const prevActiveRef = useRef(isActive)

  // Auto-focus input when search opens; refocus terminal when it closes
  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus()
    }
    if (prevActiveRef.current && !isActive) {
      const entry = getTerminal(sessionId)
      if (entry) entry.terminal.focus()
    }
    prevActiveRef.current = isActive
  }, [isActive, sessionId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          findPrevious()
        } else {
          findNext()
        }
        return
      }
    },
    [close, findNext, findPrevious]
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value)
    },
    [setQuery]
  )

  if (!isActive) return null

  const resultLabel =
    resultCount === 0
      ? query
        ? 'No results'
        : ''
      : resultIndex === -1
        ? `${resultCount}+ matches`
        : `${resultIndex + 1} of ${resultCount}`

  return (
    <div className="terminal-search-bar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="terminal-search-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="terminal-search-input"
          placeholder="Search terminal..."
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
        {resultLabel && (
          <span className="terminal-search-count">{resultLabel}</span>
        )}
      </div>
      <button
        className={`terminal-search-btn toggle ${caseSensitive ? 'active' : ''}`}
        title="Case Sensitive"
        onClick={toggleCaseSensitive}
      >
        Aa
      </button>
      <button
        className={`terminal-search-btn toggle ${regex ? 'active' : ''}`}
        title="Regex"
        onClick={toggleRegex}
      >
        .*
      </button>
      <button
        className="terminal-search-btn"
        title="Previous Match (Shift+Enter)"
        onClick={findPrevious}
        disabled={!query}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 2.5L1.5 7.5h9L6 2.5z" />
        </svg>
      </button>
      <button
        className="terminal-search-btn"
        title="Next Match (Enter)"
        onClick={findNext}
        disabled={!query}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 9.5l4.5-5h-9L6 9.5z" />
        </svg>
      </button>
      <button
        className="terminal-search-btn"
        title="Close (Escape)"
        onClick={close}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M9.35 3.35L6.71 6l2.64 2.65-.71.7L6 6.71 3.35 9.35l-.7-.7L5.29 6 2.65 3.35l.7-.7L6 5.29l2.65-2.64.7.7z" />
        </svg>
      </button>
    </div>
  )
}
