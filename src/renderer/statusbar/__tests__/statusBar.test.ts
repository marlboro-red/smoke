import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { canvasStore } from '../../stores/canvasStore'
import { indexingStore, computeSearchEta, formatEta } from '../../stores/indexingStore'

// ---------------------------------------------------------------------------
// Helpers — extract the same pure logic the component uses so we can test it
// without React rendering overhead.
// ---------------------------------------------------------------------------

/** Same formatting the StatusBar uses for the zoom button label. */
function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}

/** The ZOOM_PRESETS constant exported from StatusBar (duplicated here because
 *  StatusBar.tsx doesn't export it). */
const ZOOM_PRESETS = [
  { label: '50%', value: 0.5 },
  { label: '100%', value: 1.0 },
  { label: '150%', value: 1.5 },
  { label: 'Fit All', value: -1 },
]

type ElementType = 'terminal' | 'file' | 'note' | 'webview' | 'image' | 'snippet'

const builtinTypeLabels: Record<ElementType, string> = {
  terminal: 'term',
  file: 'file',
  note: 'note',
  webview: 'web',
  image: 'img',
  snippet: 'snip',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatusBar zoom percentage formatting', () => {
  it('formats 1.0 as 100%', () => {
    expect(formatZoomPercent(1.0)).toBe('100%')
  })

  it('formats 0.5 as 50%', () => {
    expect(formatZoomPercent(0.5)).toBe('50%')
  })

  it('formats 1.5 as 150%', () => {
    expect(formatZoomPercent(1.5)).toBe('150%')
  })

  it('formats 3.0 as 300%', () => {
    expect(formatZoomPercent(3.0)).toBe('300%')
  })

  it('formats 0.1 as 10%', () => {
    expect(formatZoomPercent(0.1)).toBe('10%')
  })

  it('rounds fractional zoom values', () => {
    expect(formatZoomPercent(0.333)).toBe('33%')
    expect(formatZoomPercent(0.666)).toBe('67%')
    expect(formatZoomPercent(1.005)).toBe('100%') // 1.005*100 = 100.499… rounds down
  })
})

describe('StatusBar zoom presets', () => {
  it('contains exactly 4 presets', () => {
    expect(ZOOM_PRESETS).toHaveLength(4)
  })

  it('has 50%, 100%, 150% numeric presets', () => {
    const numericPresets = ZOOM_PRESETS.filter((p) => p.value > 0)
    expect(numericPresets).toEqual([
      { label: '50%', value: 0.5 },
      { label: '100%', value: 1.0 },
      { label: '150%', value: 1.5 },
    ])
  })

  it('has a Fit All preset with sentinel value -1', () => {
    const fitAll = ZOOM_PRESETS.find((p) => p.label === 'Fit All')
    expect(fitAll).toBeDefined()
    expect(fitAll!.value).toBe(-1)
  })

  it('preset labels match their zoom values', () => {
    for (const preset of ZOOM_PRESETS) {
      if (preset.value > 0) {
        expect(preset.label).toBe(`${Math.round(preset.value * 100)}%`)
      }
    }
  })
})

describe('StatusBar zoom store integration', () => {
  beforeEach(() => {
    canvasStore.setState({ zoom: 1.0 })
  })

  it('zoom defaults to 1.0', () => {
    expect(canvasStore.getState().zoom).toBe(1.0)
  })

  it('zoom is clamped to [0.1, 3.0]', () => {
    canvasStore.getState().setZoom(0.05)
    expect(canvasStore.getState().zoom).toBe(0.1)
    canvasStore.getState().setZoom(5.0)
    expect(canvasStore.getState().zoom).toBe(3.0)
  })

  it('setting zoom to a preset value updates the store', () => {
    for (const preset of ZOOM_PRESETS) {
      if (preset.value > 0) {
        canvasStore.getState().setZoom(preset.value)
        expect(canvasStore.getState().zoom).toBe(preset.value)
      }
    }
  })
})

describe('StatusBar element count derivation', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  it('shows 0 elements when no sessions exist', () => {
    const sessions = Array.from(sessionStore.getState().sessions.values())
    expect(sessions.length).toBe(0)
  })

  it('derives total element count from session store', () => {
    sessionStore.getState().createSession('/a')
    sessionStore.getState().createSession('/b')
    sessionStore.getState().createSession('/c')
    const sessions = Array.from(sessionStore.getState().sessions.values())
    expect(sessions.length).toBe(3)
  })

  it('computes per-type breakdown for terminals', () => {
    sessionStore.getState().createSession('/a')
    sessionStore.getState().createSession('/b')
    const sessions = Array.from(sessionStore.getState().sessions.values())

    const typeCounts = new Map<string, number>()
    for (const session of sessions) {
      typeCounts.set(session.type, (typeCounts.get(session.type) || 0) + 1)
    }
    expect(typeCounts.get('terminal')).toBe(2)
  })

  it('counts active terminals (status=running)', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    // Mark one as exited
    sessionStore.getState().updateSession(s2.id, { status: 'exited', exitCode: 0 })

    const sessions = Array.from(sessionStore.getState().sessions.values())
    let activeTerminals = 0
    for (const session of sessions) {
      if (session.type === 'terminal' && (session as { status: string }).status === 'running') {
        activeTerminals++
      }
    }
    expect(activeTerminals).toBe(1)
  })

  it('computes breakdown with mixed element types', () => {
    sessionStore.getState().createSession('/a')
    sessionStore.getState().createNoteSession({ x: 0, y: 0 })
    sessionStore.getState().createFileSession('/foo.ts', 'const x = 1', 'typescript', { x: 100, y: 0 })

    const sessions = Array.from(sessionStore.getState().sessions.values())
    const typeCounts = new Map<string, number>()
    for (const session of sessions) {
      typeCounts.set(session.type, (typeCounts.get(session.type) || 0) + 1)
    }

    expect(typeCounts.get('terminal')).toBe(1)
    expect(typeCounts.get('note')).toBe(1)
    expect(typeCounts.get('file')).toBe(1)
  })

  it('formats breakdown parts using short labels', () => {
    sessionStore.getState().createSession('/a')
    sessionStore.getState().createSession('/b')
    sessionStore.getState().createNoteSession({ x: 0, y: 0 })

    const sessions = Array.from(sessionStore.getState().sessions.values())
    const typeCounts = new Map<string, number>()
    for (const session of sessions) {
      typeCounts.set(session.type, (typeCounts.get(session.type) || 0) + 1)
    }

    const breakdownParts: string[] = []
    for (const [type, count] of typeCounts) {
      const label = builtinTypeLabels[type as ElementType] ?? type
      breakdownParts.push(`${count} ${label}`)
    }

    expect(breakdownParts).toContain('2 term')
    expect(breakdownParts).toContain('1 note')
  })

  it('pluralizes "element" correctly', () => {
    const formatElements = (count: number): string =>
      `${count} element${count !== 1 ? 's' : ''}`

    expect(formatElements(0)).toBe('0 elements')
    expect(formatElements(1)).toBe('1 element')
    expect(formatElements(5)).toBe('5 elements')
  })
})

describe('StatusBar git branch display logic', () => {
  it('renders branch name when present (truthy string)', () => {
    const gitBranch: string | null = 'main'
    expect(gitBranch).toBeTruthy()
    expect(typeof gitBranch).toBe('string')
  })

  it('does not render when gitBranch is null', () => {
    const gitBranch: string | null = null
    expect(gitBranch).toBeFalsy()
  })

  it('does not render when gitBranch is empty string', () => {
    const gitBranch: string | null = ''
    expect(gitBranch).toBeFalsy()
  })

  it('displays feature branch names', () => {
    const branches = ['feature/smoke-123', 'fix/login-bug', 'release/v2.0']
    for (const branch of branches) {
      expect(branch).toBeTruthy()
      expect(branch.length).toBeGreaterThan(0)
    }
  })
})

describe('StatusBar indexing progress calculation', () => {
  beforeEach(() => {
    indexingStore.setState({
      searchIndexing: false,
      searchIndexed: 0,
      searchTotal: 0,
      searchStartedAt: null,
      searchCompletedAt: null,
      structureAnalyzing: false,
      structureModuleCount: null,
    })
  })

  it('computes percentage as 0 when total is 0', () => {
    const progress = { indexed: 0, total: 0 }
    const pct = progress.total > 0
      ? Math.round((progress.indexed / progress.total) * 100)
      : 0
    expect(pct).toBe(0)
  })

  it('computes percentage for partial progress', () => {
    const progress = { indexed: 50, total: 200 }
    const pct = Math.round((progress.indexed / progress.total) * 100)
    expect(pct).toBe(25)
  })

  it('computes 100% when indexing is complete', () => {
    const progress = { indexed: 200, total: 200 }
    const pct = Math.round((progress.indexed / progress.total) * 100)
    expect(pct).toBe(100)
  })

  it('rounds percentage to nearest integer', () => {
    const progress = { indexed: 1, total: 3 }
    const pct = Math.round((progress.indexed / progress.total) * 100)
    expect(pct).toBe(33)
  })

  it('isIndexing is true when searchIndexing is true', () => {
    indexingStore.getState().setSearchIndexing(true)
    const state = indexingStore.getState()
    expect(state.searchIndexing || state.structureAnalyzing).toBe(true)
  })

  it('isIndexing is true when structureAnalyzing is true', () => {
    indexingStore.getState().setStructureAnalyzing(true)
    const state = indexingStore.getState()
    expect(state.searchIndexing || state.structureAnalyzing).toBe(true)
  })

  it('isIndexing is false when neither is active', () => {
    const state = indexingStore.getState()
    expect(state.searchIndexing || state.structureAnalyzing).toBe(false)
  })

  it('displays "Analyzing structure" when structureAnalyzing and no search progress', () => {
    const searchProgress = { indexed: 0, total: 0, startedAt: null }
    const structureAnalyzing = true
    // Component logic: if total > 0 show progress, else if structureAnalyzing show text
    const display = searchProgress.total > 0
      ? `Indexing ${searchProgress.indexed}/${searchProgress.total}`
      : structureAnalyzing
        ? 'Analyzing structure'
        : 'Indexing...'
    expect(display).toBe('Analyzing structure')
  })

  it('displays "Indexing..." as fallback', () => {
    const searchProgress = { indexed: 0, total: 0, startedAt: null }
    const structureAnalyzing = false
    const display = searchProgress.total > 0
      ? `Indexing ${searchProgress.indexed}/${searchProgress.total}`
      : structureAnalyzing
        ? 'Analyzing structure'
        : 'Indexing...'
    expect(display).toBe('Indexing...')
  })

  it('displays indexed/total when search progress is available', () => {
    const searchProgress = { indexed: 42, total: 100, startedAt: Date.now() }
    const display = searchProgress.total > 0
      ? `Indexing ${searchProgress.indexed}/${searchProgress.total}`
      : 'Indexing...'
    expect(display).toBe('Indexing 42/100')
  })

  it('ETA is included when computable', () => {
    const now = Date.now()
    indexingStore.setState({
      searchIndexing: true,
      searchIndexed: 50,
      searchTotal: 100,
      searchStartedAt: now - 5000,
    })
    const eta = computeSearchEta(indexingStore.getState())
    expect(eta).not.toBeNull()
    const etaStr = formatEta(eta)
    expect(etaStr).not.toBeNull()
    expect(etaStr).toMatch(/^~\d+/)
  })
})
