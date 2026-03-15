import { describe, it, expect } from 'vitest'
import { computeLayout, computeIncrementalLayout } from '../layoutEngine'
import type { CodeNode, CodeEdge } from '../CodeGraph'

function makeGraph(nodes: CodeNode[], edges: CodeEdge[] = []) {
  return { nodes, edges }
}

describe('computeLayout', () => {
  it('positions root at origin', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: 0 },
    ])
    const result = computeLayout(graph, '/a.ts')
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0]).toEqual({ filePath: '/a.ts', x: 0, y: 0, depth: 0 })
  })

  it('positions depth-1 nodes in a column offset by horizontalSpacing', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: ['/b.ts', '/c.ts'], importedBy: [], depth: 0 },
      { filePath: '/b.ts', imports: [], importedBy: ['/a.ts'], depth: 1 },
      { filePath: '/c.ts', imports: [], importedBy: ['/a.ts'], depth: 1 },
    ])
    const result = computeLayout(graph, '/a.ts', { horizontalSpacing: 720 })

    const depth1 = result.positions.filter((p) => p.depth === 1)
    expect(depth1.length).toBe(2)
    expect(depth1[0].x).toBe(720)
    expect(depth1[1].x).toBe(720)
    // They should be vertically spaced
    expect(depth1[0].y).not.toBe(depth1[1].y)
  })

  it('centers columns vertically around origin', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: 1 },
      { filePath: '/b.ts', imports: [], importedBy: [], depth: 1 },
      { filePath: '/c.ts', imports: [], importedBy: [], depth: 1 },
    ])
    const result = computeLayout(graph, '/a.ts', { verticalSpacing: 200, originY: 0 })

    const ys = result.positions.map((p) => p.y)
    // 3 nodes, spacing 200: total height = 400, startY = -200
    expect(ys).toEqual([-200, 0, 200])
  })

  it('returns empty positions for empty graph', () => {
    const result = computeLayout({ nodes: [], edges: [] }, '/a.ts')
    expect(result.positions).toHaveLength(0)
  })
})

describe('computeIncrementalLayout', () => {
  it('preserves existing positions and adds new ones', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: 0 },
      { filePath: '/b.ts', imports: [], importedBy: [], depth: 1 },
      { filePath: '/c.ts', imports: [], importedBy: [], depth: 1 },
    ])
    const existing = [
      { filePath: '/a.ts', x: 0, y: 0, depth: 0 },
      { filePath: '/b.ts', x: 720, y: 0, depth: 1 },
    ]

    const result = computeIncrementalLayout(graph, existing, { verticalSpacing: 200 })
    expect(result.positions).toHaveLength(3)

    // Existing positions should be unchanged
    const posA = result.positions.find((p) => p.filePath === '/a.ts')!
    expect(posA.x).toBe(0)
    expect(posA.y).toBe(0)

    // New node should be placed below existing node at same depth
    const posC = result.positions.find((p) => p.filePath === '/c.ts')!
    expect(posC.x).toBe(720)
    expect(posC.y).toBe(200) // below /b.ts at y=0
  })

  it('returns existing positions when no new nodes', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: 0 },
    ])
    const existing = [{ filePath: '/a.ts', x: 100, y: 200, depth: 0 }]

    const result = computeIncrementalLayout(graph, existing)
    expect(result.positions).toEqual(existing)
  })
})
