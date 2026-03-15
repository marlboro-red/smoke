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
    expect(depth1).toHaveLength(2)
    expect(depth1[0].x).toBe(720)
    expect(depth1[1].x).toBe(720)
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
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })

  it('computes correct bounds including node dimensions', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: 0 },
    ])
    const result = computeLayout(graph, '/a.ts', { nodeWidth: 640, nodeHeight: 480 })
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 640, maxY: 480 })
  })

  it('respects custom origin', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: 0 },
    ])
    const result = computeLayout(graph, '/a.ts', { originX: 100, originY: 200 })
    expect(result.positions[0]).toEqual({ filePath: '/a.ts', x: 100, y: 200, depth: 0 })
  })

  it('treats negative depth as 0', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: -1 },
    ])
    const result = computeLayout(graph, '/a.ts')
    expect(result.positions[0].depth).toBe(0)
    expect(result.positions[0].x).toBe(0)
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

    const posA = result.positions.find((p) => p.filePath === '/a.ts')!
    expect(posA.x).toBe(0)
    expect(posA.y).toBe(0)

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

  it('centers new nodes at empty depth levels', () => {
    const graph = makeGraph([
      { filePath: '/a.ts', imports: [], importedBy: [], depth: 0 },
      { filePath: '/b.ts', imports: [], importedBy: [], depth: 2 },
      { filePath: '/c.ts', imports: [], importedBy: [], depth: 2 },
    ])
    const existing = [{ filePath: '/a.ts', x: 0, y: 0, depth: 0 }]

    const result = computeIncrementalLayout(graph, existing, {
      verticalSpacing: 200,
      horizontalSpacing: 720,
    })

    const depth2 = result.positions.filter((p) => p.depth === 2)
    expect(depth2).toHaveLength(2)
    expect(depth2[0].x).toBe(1440)
    // Centered: -100 and 100
    expect(depth2[0].y).toBe(-100)
    expect(depth2[1].y).toBe(100)
  })
})
