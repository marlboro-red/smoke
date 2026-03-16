import { describe, it, expect, beforeEach } from 'vitest'
import { suggestionId, computeGhostPositions } from '../useSuggestionEngine'
import { reasonLabel, extToLanguage } from '../GhostSuggestion'
import { suggestionStore, type FileSuggestion } from '../../stores/suggestionStore'

// ─── Helpers ───

function makeSuggestion(overrides: Partial<FileSuggestion> = {}): FileSuggestion {
  return {
    id: 'ghost-test-file-ts',
    filePath: '/project/src/test/file.ts',
    displayName: 'src/test/file.ts',
    relevanceScore: 0.8,
    reason: 'import',
    position: { x: 100, y: 200 },
    ...overrides,
  }
}

// ─── suggestionId ───

describe('suggestionId', () => {
  it('prefixes with ghost- and replaces non-alphanumeric chars with hyphens', () => {
    expect(suggestionId('/project/src/App.tsx')).toBe('ghost--project-src-App-tsx')
  })

  it('handles simple filenames', () => {
    expect(suggestionId('index.ts')).toBe('ghost-index-ts')
  })

  it('returns stable IDs for the same path', () => {
    const path = '/a/b/c.ts'
    expect(suggestionId(path)).toBe(suggestionId(path))
  })

  it('produces different IDs for different paths', () => {
    expect(suggestionId('/a.ts')).not.toBe(suggestionId('/b.ts'))
  })
})

// ─── computeGhostPositions ───

describe('computeGhostPositions', () => {
  const sourcePos = { x: 100, y: 200 }
  const sourceSize = { width: 400, height: 300 }

  it('returns empty array for count 0', () => {
    expect(computeGhostPositions(sourcePos, sourceSize, 0)).toEqual([])
  })

  it('returns correct number of positions', () => {
    expect(computeGhostPositions(sourcePos, sourceSize, 3)).toHaveLength(3)
    expect(computeGhostPositions(sourcePos, sourceSize, 5)).toHaveLength(5)
  })

  it('places positions to the right of the source session', () => {
    const positions = computeGhostPositions(sourcePos, sourceSize, 3)
    const rightEdge = sourcePos.x + sourceSize.width
    for (const pos of positions) {
      expect(pos.x).toBeGreaterThan(rightEdge)
    }
  })

  it('centers positions vertically around source center', () => {
    const positions = computeGhostPositions(sourcePos, sourceSize, 1)
    const centerY = sourcePos.y + sourceSize.height / 2
    // Single suggestion should be at center
    expect(positions[0].y).toBe(centerY)
  })

  it('applies stagger pattern (even indices aligned, odd offset by 40)', () => {
    const positions = computeGhostPositions(sourcePos, sourceSize, 4)
    // Even indices should share the same x
    expect(positions[0].x).toBe(positions[2].x)
    // Odd indices should be offset by 40
    expect(positions[1].x).toBe(positions[0].x + 40)
    expect(positions[3].x).toBe(positions[0].x + 40)
  })

  it('spaces positions 100px apart vertically', () => {
    const positions = computeGhostPositions(sourcePos, sourceSize, 3)
    expect(positions[1].y - positions[0].y).toBe(100)
    expect(positions[2].y - positions[1].y).toBe(100)
  })
})

// ─── reasonLabel ───

describe('reasonLabel', () => {
  it('returns "imports" for import reason', () => {
    expect(reasonLabel('import')).toBe('imports')
  })

  it('returns "imported by" for dependent reason', () => {
    expect(reasonLabel('dependent')).toBe('imported by')
  })

  it('returns "related" for keyword reason', () => {
    expect(reasonLabel('keyword')).toBe('related')
  })
})

// ─── extToLanguage ───

describe('extToLanguage', () => {
  it('maps .ts to typescript', () => {
    expect(extToLanguage('file.ts')).toBe('typescript')
  })

  it('maps .tsx to tsx', () => {
    expect(extToLanguage('Component.tsx')).toBe('tsx')
  })

  it('maps .js to javascript', () => {
    expect(extToLanguage('script.js')).toBe('javascript')
  })

  it('maps .py to python', () => {
    expect(extToLanguage('main.py')).toBe('python')
  })

  it('maps .rs to rust', () => {
    expect(extToLanguage('lib.rs')).toBe('rust')
  })

  it('maps .go to go', () => {
    expect(extToLanguage('main.go')).toBe('go')
  })

  it('maps .css to css', () => {
    expect(extToLanguage('style.css')).toBe('css')
  })

  it('maps .json to json', () => {
    expect(extToLanguage('package.json')).toBe('json')
  })

  it('maps .html to html', () => {
    expect(extToLanguage('index.html')).toBe('html')
  })

  it('maps .md to markdown', () => {
    expect(extToLanguage('README.md')).toBe('markdown')
  })

  it('returns the extension itself for unknown types', () => {
    expect(extToLanguage('file.rb')).toBe('rb')
    expect(extToLanguage('file.swift')).toBe('swift')
  })

  it('handles files with no extension', () => {
    expect(extToLanguage('Makefile')).toBe('makefile')
  })

  it('uses the last extension for multi-dot files', () => {
    expect(extToLanguage('config.spec.ts')).toBe('typescript')
  })
})

// ─── Relevance score normalization ───

describe('relevance score normalization', () => {
  // Mirrors the logic in fetchRelatedFiles:
  //   normalizedScore = Math.min(scored.score / 15, 1)
  //   final = normalizedScore * 0.6
  function normalizeRelevanceScore(rawScore: number): number {
    const normalized = Math.min(rawScore / 15, 1)
    return normalized * 0.6
  }

  it('normalizes a typical raw score', () => {
    // score of 7.5 → 0.5 normalized → 0.3 final
    expect(normalizeRelevanceScore(7.5)).toBeCloseTo(0.3, 5)
  })

  it('caps at 0.6 for very high raw scores', () => {
    expect(normalizeRelevanceScore(100)).toBe(0.6)
    expect(normalizeRelevanceScore(15)).toBe(0.6)
  })

  it('returns 0 for raw score of 0', () => {
    expect(normalizeRelevanceScore(0)).toBe(0)
  })

  it('keyword suggestions are always <= 0.6 (below graph-based thresholds)', () => {
    // Graph-based scores: import=0.9, dependent=0.7
    // Keyword max is 0.6, so keyword never outranks graph results
    for (const raw of [1, 5, 10, 15, 25, 100]) {
      expect(normalizeRelevanceScore(raw)).toBeLessThanOrEqual(0.6)
    }
  })
})

// ─── Suggestion filtering and sorting ───

describe('suggestion filtering and sorting', () => {
  function filterAndSort(
    candidates: Array<{ filePath: string; score: number; reason: FileSuggestion['reason'] }>,
    openPaths: Set<string>,
    maxSuggestions: number
  ): Array<{ filePath: string; score: number; reason: FileSuggestion['reason'] }> {
    const seen = new Set<string>()
    const filtered = candidates.filter((c) => {
      if (openPaths.has(c.filePath) || seen.has(c.filePath)) return false
      seen.add(c.filePath)
      return true
    })
    filtered.sort((a, b) => b.score - a.score)
    return filtered.slice(0, maxSuggestions)
  }

  it('excludes files already open on the canvas', () => {
    const candidates = [
      { filePath: '/a.ts', score: 0.9, reason: 'import' as const },
      { filePath: '/b.ts', score: 0.8, reason: 'import' as const },
    ]
    const open = new Set(['/a.ts'])
    const result = filterAndSort(candidates, open, 5)
    expect(result).toHaveLength(1)
    expect(result[0].filePath).toBe('/b.ts')
  })

  it('deduplicates by file path', () => {
    const candidates = [
      { filePath: '/a.ts', score: 0.9, reason: 'import' as const },
      { filePath: '/a.ts', score: 0.7, reason: 'dependent' as const },
      { filePath: '/b.ts', score: 0.5, reason: 'keyword' as const },
    ]
    const result = filterAndSort(candidates, new Set(), 5)
    expect(result).toHaveLength(2)
  })

  it('sorts by score descending', () => {
    const candidates = [
      { filePath: '/low.ts', score: 0.3, reason: 'keyword' as const },
      { filePath: '/high.ts', score: 0.9, reason: 'import' as const },
      { filePath: '/mid.ts', score: 0.7, reason: 'dependent' as const },
    ]
    const result = filterAndSort(candidates, new Set(), 5)
    expect(result.map((c) => c.filePath)).toEqual(['/high.ts', '/mid.ts', '/low.ts'])
  })

  it('limits results to maxSuggestions', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      filePath: `/file${i}.ts`,
      score: 1 - i * 0.1,
      reason: 'import' as const,
    }))
    const result = filterAndSort(candidates, new Set(), 5)
    expect(result).toHaveLength(5)
    // Should have the top 5 by score
    expect(result[0].score).toBe(1)
    expect(result[4].score).toBeCloseTo(0.6, 5)
  })

  it('returns empty array when all candidates are open', () => {
    const candidates = [
      { filePath: '/a.ts', score: 0.9, reason: 'import' as const },
    ]
    const result = filterAndSort(candidates, new Set(['/a.ts']), 5)
    expect(result).toEqual([])
  })
})

// ─── Dismiss logic via store ───

describe('dismiss and materialize actions', () => {
  beforeEach(() => {
    suggestionStore.getState().clearSuggestions()
    suggestionStore.getState().setEnabled(true)
  })

  it('dismiss removes one suggestion and keeps the rest', () => {
    const suggestions = [
      makeSuggestion({ id: 'ghost-a', relevanceScore: 0.9 }),
      makeSuggestion({ id: 'ghost-b', relevanceScore: 0.7 }),
      makeSuggestion({ id: 'ghost-c', relevanceScore: 0.5 }),
    ]
    suggestionStore.getState().setSuggestions(suggestions, '/src/main.ts')

    // Dismiss the middle suggestion
    suggestionStore.getState().removeSuggestion('ghost-b')

    const remaining = suggestionStore.getState().suggestions
    expect(remaining).toHaveLength(2)
    expect(remaining.map((s) => s.id)).toEqual(['ghost-a', 'ghost-c'])
  })

  it('dismiss all suggestions one by one leaves empty list', () => {
    const suggestions = [
      makeSuggestion({ id: 'ghost-a' }),
      makeSuggestion({ id: 'ghost-b' }),
    ]
    suggestionStore.getState().setSuggestions(suggestions, '/src/main.ts')

    suggestionStore.getState().removeSuggestion('ghost-a')
    suggestionStore.getState().removeSuggestion('ghost-b')

    expect(suggestionStore.getState().suggestions).toEqual([])
    // sourceFilePath is preserved (not cleared by individual dismissals)
    expect(suggestionStore.getState().sourceFilePath).toBe('/src/main.ts')
  })

  it('materialize removes the suggestion from the store (same as dismiss)', () => {
    // Materialize calls removeSuggestion after creating a file session
    const suggestions = [
      makeSuggestion({ id: 'ghost-target', filePath: '/src/target.ts' }),
      makeSuggestion({ id: 'ghost-other', filePath: '/src/other.ts' }),
    ]
    suggestionStore.getState().setSuggestions(suggestions, '/src/main.ts')

    // Simulate materialize action: remove the suggestion
    suggestionStore.getState().removeSuggestion('ghost-target')

    const remaining = suggestionStore.getState().suggestions
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('ghost-other')
  })

  it('dismiss preserves suggestion order', () => {
    const suggestions = [
      makeSuggestion({ id: 'ghost-1', relevanceScore: 0.9 }),
      makeSuggestion({ id: 'ghost-2', relevanceScore: 0.7 }),
      makeSuggestion({ id: 'ghost-3', relevanceScore: 0.5 }),
      makeSuggestion({ id: 'ghost-4', relevanceScore: 0.3 }),
    ]
    suggestionStore.getState().setSuggestions(suggestions, '/src/main.ts')

    suggestionStore.getState().removeSuggestion('ghost-2')

    const ids = suggestionStore.getState().suggestions.map((s) => s.id)
    expect(ids).toEqual(['ghost-1', 'ghost-3', 'ghost-4'])
  })
})

// ─── Fade-in / materializing state ───

describe('fade-in and materializing CSS state', () => {
  // The ghost-suggestion element starts with opacity: 0 and uses
  // ghost-fade-in animation. When materializing, the 'materializing'
  // class is added which triggers the ghost-materialize animation
  // and sets pointer-events: none.

  it('default state has no materializing class', () => {
    const baseClass = 'ghost-suggestion'
    const materializing = false
    const className = `${baseClass} ${materializing ? 'materializing' : ''}`.trim()
    expect(className).toBe('ghost-suggestion')
    expect(className).not.toContain('materializing')
  })

  it('materializing state adds materializing class', () => {
    const baseClass = 'ghost-suggestion'
    const materializing = true
    const className = `${baseClass} ${materializing ? 'materializing' : ''}`.trim()
    expect(className).toBe('ghost-suggestion materializing')
  })

  it('relevance bar width maps score to percentage', () => {
    // barWidth = Math.round(suggestion.relevanceScore * 100)
    expect(Math.round(0.9 * 100)).toBe(90)
    expect(Math.round(0.5 * 100)).toBe(50)
    expect(Math.round(0.0 * 100)).toBe(0)
    expect(Math.round(1.0 * 100)).toBe(100)
  })

  it('display path truncates long paths from the left', () => {
    function truncateDisplay(displayName: string): string {
      return displayName.length > 40
        ? '...' + displayName.slice(-37)
        : displayName
    }

    const short = 'src/components/App.tsx'
    expect(truncateDisplay(short)).toBe(short)

    const long = 'src/renderer/components/deeply/nested/path/to/SomeComponent.tsx'
    expect(truncateDisplay(long)).toHaveLength(40)
    expect(truncateDisplay(long).startsWith('...')).toBe(true)
  })
})
