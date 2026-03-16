import { useState, useEffect, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { sessionStore, useSessionList } from '../stores/sessionStore'
import { getCanvasRootElement, getCurrentPan, getCurrentZoom, setZoomTo, setPanTo } from '../canvas/useCanvasControls'
import { useIsIndexing, useSearchProgress, useStructureAnalyzing, indexingStore, computeSearchEta, formatEta } from '../stores/indexingStore'
import type { ElementType, BuiltinElementType } from '../stores/sessionStore'
import { isPluginElementType, getPluginElementRegistration } from '../plugin/pluginElementRegistry'
import '../styles/statusbar.css'

const ZOOM_PRESETS = [
  { label: '50%', value: 0.5 },
  { label: '100%', value: 1.0 },
  { label: '150%', value: 1.5 },
  { label: 'Fit All', value: -1 },
]

function fitAllZoom(): void {
  const sessions = sessionStore.getState().sessions
  if (sessions.size === 0) return

  const root = getCanvasRootElement()
  if (!root) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const session of sessions.values()) {
    const { x, y } = session.position
    const { width, height } = session.size
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }

  const contentW = maxX - minX
  const contentH = maxY - minY
  if (contentW <= 0 || contentH <= 0) return

  const rect = root.getBoundingClientRect()
  const padding = 60
  const scaleX = (rect.width - padding * 2) / contentW
  const scaleY = (rect.height - padding * 2) / contentH
  const zoom = Math.min(scaleX, scaleY, 3.0)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  setPanTo(
    rect.width / 2 - centerX * zoom,
    rect.height / 2 - centerY * zoom,
  )
  setZoomTo(zoom)
}

export default function StatusBar(): JSX.Element {
  const zoom = useCanvasStore((s) => s.zoom)
  const sessions = useSessionList()
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const zoomMenuRef = useRef<HTMLDivElement>(null)

  // Indexing progress
  const isIndexing = useIsIndexing()
  const searchProgress = useSearchProgress()
  const structureAnalyzing = useStructureAnalyzing()

  // Fetch git branch on mount and periodically
  useEffect(() => {
    const fetchBranch = (): void => {
      window.smokeAPI?.app.getGitBranch().then(setGitBranch).catch(() => setGitBranch(null))
    }
    fetchBranch()
    const interval = setInterval(fetchBranch, 30000)
    return () => clearInterval(interval)
  }, [])

  // Track mouse position on canvas
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      const root = getCanvasRootElement()
      if (!root) return
      const rect = root.getBoundingClientRect()
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom
      ) {
        return
      }
      const pan = getCurrentPan()
      const z = getCurrentZoom()
      const canvasX = Math.round((e.clientX - rect.left - pan.x) / z)
      const canvasY = Math.round((e.clientY - rect.top - pan.y) / z)
      setCursorPos({ x: canvasX, y: canvasY })
    }
    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Close zoom menu on outside click
  useEffect(() => {
    if (!showZoomMenu) return
    const handleClick = (e: MouseEvent): void => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showZoomMenu])

  const handleZoomPreset = useCallback((value: number) => {
    if (value === -1) {
      fitAllZoom()
    } else {
      setZoomTo(value)
    }
    setShowZoomMenu(false)
  }, [])

  // Compute element counts
  const totalCount = sessions.length
  const typeCounts = new Map<ElementType, number>()
  let activeTerminals = 0
  for (const session of sessions) {
    typeCounts.set(session.type, (typeCounts.get(session.type) || 0) + 1)
    if (session.type === 'terminal' && session.status === 'running') {
      activeTerminals++
    }
  }

  const breakdownParts: string[] = []
  const builtinTypeLabels: Record<BuiltinElementType, string> = {
    terminal: 'term',
    file: 'file',
    note: 'note',
    webview: 'web',
    image: 'img',
    snippet: 'snip',
  }
  for (const [type, count] of typeCounts) {
    let label: string
    if (isPluginElementType(type)) {
      const reg = getPluginElementRegistration(type)
      label = reg?.statusLabel ?? type.slice('plugin:'.length)
    } else {
      label = builtinTypeLabels[type as BuiltinElementType] ?? type
    }
    breakdownParts.push(`${count} ${label}`)
  }

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-bar-item status-bar-zoom" ref={zoomMenuRef}>
          <button
            className="status-bar-zoom-btn"
            onClick={() => setShowZoomMenu(!showZoomMenu)}
            title="Zoom level — click to change"
          >
            {Math.round(zoom * 100)}%
          </button>
          {showZoomMenu && (
            <div className="status-bar-zoom-menu">
              {ZOOM_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className={`status-bar-zoom-option${preset.value === zoom ? ' active' : ''}`}
                  onClick={() => handleZoomPreset(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="status-bar-separator" />
        <div className="status-bar-item">
          {totalCount} element{totalCount !== 1 ? 's' : ''}
          {breakdownParts.length > 0 && (
            <span className="status-bar-dim"> ({breakdownParts.join(', ')})</span>
          )}
        </div>
        <div className="status-bar-separator" />
        <div className="status-bar-item">
          {activeTerminals} active
        </div>
        {isIndexing && (
          <>
            <div className="status-bar-separator" />
            <IndexingIndicator
              searchProgress={searchProgress}
              structureAnalyzing={structureAnalyzing}
            />
          </>
        )}
      </div>
      <div className="status-bar-right">
        {cursorPos && (
          <div className="status-bar-item status-bar-dim">
            {cursorPos.x}, {cursorPos.y}
          </div>
        )}
        {gitBranch && (
          <>
            <div className="status-bar-separator" />
            <div className="status-bar-item status-bar-branch">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6c0 .73-.593 1.322-1.325 1.322H9.422A2.25 2.25 0 007.5 8.5v1.128a2.251 2.251 0 10 1.5 0V8.5c0-.456.37-.828.828-.828h1.747A2.822 2.822 0 0014.397 5V5.372a2.25 2.25 0 10-1.5 0V5c0-.73-.593-1.322-1.325-1.322H9.825c-.196 0-.385.024-.566.07A2.243 2.243 0 009.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
              </svg>
              {gitBranch}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Compact indexing progress indicator for the status bar. */
function IndexingIndicator({
  searchProgress,
  structureAnalyzing,
}: {
  searchProgress: { indexed: number; total: number; startedAt: number | null }
  structureAnalyzing: boolean
}): JSX.Element {
  const state = indexingStore.getState()
  const eta = computeSearchEta(state)
  const etaStr = formatEta(eta)
  const pct = searchProgress.total > 0
    ? Math.round((searchProgress.indexed / searchProgress.total) * 100)
    : 0

  return (
    <div className="status-bar-item status-bar-indexing">
      <span className="status-bar-indexing-spinner" />
      {searchProgress.total > 0 ? (
        <span>
          Indexing {searchProgress.indexed}/{searchProgress.total}
          {etaStr && <span className="status-bar-dim"> {etaStr}</span>}
        </span>
      ) : structureAnalyzing ? (
        <span>Analyzing structure</span>
      ) : (
        <span>Indexing...</span>
      )}
      {searchProgress.total > 0 && (
        <span className="status-bar-progress-track">
          <span
            className="status-bar-progress-fill"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </div>
  )
}
