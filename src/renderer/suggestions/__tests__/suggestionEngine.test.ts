import { describe, it, expect } from 'vitest'
import type { FileSuggestion } from '../../stores/suggestionStore'

/**
 * Unit-testable pure functions extracted from useSuggestionEngine.
 * The hook itself is tested indirectly via store interactions in suggestionStore.test.ts.
 */

// Re-implement the pure functions for testing since they're not exported
function suggestionId(filePath: string): string {
  return `ghost-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`
}

function computeGhostPositions(
  sourcePosition: { x: number; y: number },
  sourceSize: { width: number; height: number },
  count: number
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  const GAP_X = 80
  const START_X = sourcePosition.x + sourceSize.width + GAP_X
  const CENTER_Y = sourcePosition.y + sourceSize.height / 2
  const SPACING_Y = 100

  const totalHeight = (count - 1) * SPACING_Y
  const startY = CENTER_Y - totalHeight / 2

  for (let i = 0; i < count; i++) {
    positions.push({
      x: START_X + (i % 2 === 0 ? 0 : 40),
      y: startY + i * SPACING_Y,
    })
  }
  return positions
}

function reasonLabel(reason: FileSuggestion['reason']): string {
  switch (reason) {
    case 'import':
      return 'imports'
    case 'dependent':
      return 'imported by'
    case 'keyword':
      return 'related'
  }
}

describe('suggestionId', () => {
  it('creates a ghost- prefixed id from file path', () => {
    expect(suggestionId('/project/src/file.ts')).toBe('ghost--project-src-file-ts')
  })

  it('replaces all non-alphanumeric characters with hyphens', () => {
    expect(suggestionId('a/b.c')).toBe('ghost-a-b-c')
  })

  it('handles simple filename', () => {
    expect(suggestionId('file')).toBe('ghost-file')
  })
})

describe('computeGhostPositions', () => {
  it('returns empty array for count 0', () => {
    const result = computeGhostPositions({ x: 0, y: 0 }, { width: 400, height: 300 }, 0)
    expect(result).toEqual([])
  })

  it('returns one position for count 1', () => {
    const result = computeGhostPositions({ x: 100, y: 100 }, { width: 400, height: 300 }, 1)
    expect(result).toHaveLength(1)
    // START_X = 100 + 400 + 80 = 580
    // CENTER_Y = 100 + 150 = 250
    // totalHeight = 0, startY = 250
    expect(result[0].x).toBe(580)
    expect(result[0].y).toBe(250)
  })

  it('places suggestions to the right of the source', () => {
    const source = { x: 200, y: 100 }
    const size = { width: 400, height: 300 }
    const result = computeGhostPositions(source, size, 3)

    for (const pos of result) {
      expect(pos.x).toBeGreaterThan(source.x + size.width)
    }
  })

  it('centers suggestions vertically around source midpoint', () => {
    const source = { x: 0, y: 0 }
    const size = { width: 400, height: 300 }
    const result = computeGhostPositions(source, size, 3)

    const centerY = source.y + size.height / 2
    const avgY = result.reduce((sum, p) => sum + p.y, 0) / result.length
    expect(avgY).toBe(centerY)
  })

  it('staggers alternate items horizontally', () => {
    const result = computeGhostPositions({ x: 0, y: 0 }, { width: 400, height: 300 }, 4)
    // Even indices: x = START_X + 0
    // Odd indices: x = START_X + 40
    expect(result[0].x).toBe(result[2].x) // Both even
    expect(result[1].x).toBe(result[3].x) // Both odd
    expect(result[1].x - result[0].x).toBe(40) // Stagger offset
  })

  it('spaces suggestions 100px apart vertically', () => {
    const result = computeGhostPositions({ x: 0, y: 0 }, { width: 400, height: 300 }, 3)
    expect(result[1].y - result[0].y).toBe(100)
    expect(result[2].y - result[1].y).toBe(100)
  })
})

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
