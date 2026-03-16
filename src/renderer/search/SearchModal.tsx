import { useEffect, useRef, useCallback } from 'react'
import {
  canvasSearchStore,
  useCanvasSearchOpen,
  useCanvasSearchQuery,
  useCanvasSearchResults,
  useCanvasSearchCaseSensitive,
  useCanvasSearchRegex,
  type SearchMatch,
} from './searchStore'
import { panToSession } from '../sidebar/useSidebarSync'
import type { ElementType } from '../stores/sessionStore'
import { isPluginElementType, getPluginElementRegistration } from '../plugin/pluginElementRegistry'
import '../styles/search-modal.css'

function typeIcon(type: ElementType): string {
  if (isPluginElementType(type)) {
    const reg = getPluginElementRegistration(type)
    return reg?.searchIcon ?? '*'
  }
  switch (type) {
    case 'terminal':
      return '>'
    case 'file':
      return '#'
    case 'note':
      return '~'
    default:
      return '*'
  }
}

function HighlightedLine({
  line,
  matchStart,
  matchEnd,
}: {
  line: string
  matchStart: number
  matchEnd: number
}): JSX.Element {
  const contextRadius = 60
  const visibleStart = Math.max(0, matchStart - contextRadius)
  const visibleEnd = Math.min(line.length, matchEnd + contextRadius)

  const before = (visibleStart > 0 ? '...' : '') + line.slice(visibleStart, matchStart)
  const match = line.slice(matchStart, matchEnd)
  const after = line.slice(matchEnd, visibleEnd) + (visibleEnd < line.length ? '...' : '')

  return (
    <span className="search-line-content">
      {before}
      <mark className="search-highlight">{match}</mark>
      {after}
    </span>
  )
}

function SearchResult({
  match,
  onClick,
}: {
  match: SearchMatch
  onClick: () => void
}): JSX.Element {
  return (
    <button className="search-result-row" onClick={onClick}>
      <span className="search-result-line-num">{match.lineNumber}</span>
      <HighlightedLine
        line={match.lineContent}
        matchStart={match.matchStart}
        matchEnd={match.matchEnd}
      />
    </button>
  )
}

export default function SearchModal(): JSX.Element | null {
  const isOpen = useCanvasSearchOpen()
  const query = useCanvasSearchQuery()
  const results = useCanvasSearchResults()
  const caseSensitive = useCanvasSearchCaseSensitive()
  const regex = useCanvasSearchRegex()
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      // Delay to ensure DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        canvasSearchStore.getState().close()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [isOpen])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      canvasSearchStore.getState().close()
    }
  }, [])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    canvasSearchStore.getState().setQuery(e.target.value)
  }, [])

  const handleResultClick = useCallback((sessionId: string) => {
    canvasSearchStore.getState().close()
    panToSession(sessionId)
  }, [])

  if (!isOpen) return null

  const totalMatches = results.reduce((sum, g) => sum + g.matches.length, 0)

  return (
    <div className="search-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="search-modal">
        <div className="search-header">
          <div className="search-input-wrapper">
            <svg
              className="search-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="Search across all sessions..."
              value={query}
              onChange={handleInput}
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <span className="search-count">
                {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
              </span>
            )}
            <button
              className={`search-toggle-btn${caseSensitive ? ' active' : ''}`}
              title="Case Sensitive"
              onClick={() => canvasSearchStore.getState().toggleCaseSensitive()}
            >
              Aa
            </button>
            <button
              className={`search-toggle-btn${regex ? ' active' : ''}`}
              title="Regex"
              onClick={() => canvasSearchStore.getState().toggleRegex()}
            >
              .*
            </button>
          </div>
        </div>

        <div className="search-body">
          {!query && (
            <div className="search-empty">
              Type to search across all terminals, files, and notes
            </div>
          )}
          {query && results.length === 0 && (
            <div className="search-empty">No matches found</div>
          )}
          {results.map((group) => (
            <div key={group.sessionId} className="search-group">
              <div className="search-group-header">
                <span className="search-group-icon">{typeIcon(group.sessionType)}</span>
                <span className="search-group-title">{group.sessionTitle}</span>
                <span className="search-group-count">
                  {group.matches.length}
                </span>
              </div>
              <div className="search-group-results">
                {group.matches.slice(0, 50).map((match, i) => (
                  <SearchResult
                    key={`${match.lineNumber}-${match.matchStart}-${i}`}
                    match={match}
                    onClick={() => handleResultClick(group.sessionId)}
                  />
                ))}
                {group.matches.length > 50 && (
                  <div className="search-more">
                    +{group.matches.length - 50} more matches
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="search-footer">
          <span className="search-hint">Esc to close</span>
        </div>
      </div>
    </div>
  )
}
