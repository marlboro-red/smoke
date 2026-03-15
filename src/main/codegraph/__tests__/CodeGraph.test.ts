import { describe, it, expect } from 'vitest'
import { CodeGraph } from '../CodeGraph'

describe('CodeGraph', () => {
  it('adds nodes and edges', () => {
    const g = new CodeGraph()
    g.addNode('/a.ts', 0)
    g.addNode('/b.ts', 1)
    g.addEdge('/a.ts', '/b.ts', 'import')

    expect(g.nodes.size).toBe(2)
    expect(g.edges.length).toBe(1)
    expect(g.nodes.get('/a.ts')!.imports).toEqual(['/b.ts'])
    expect(g.nodes.get('/b.ts')!.importedBy).toEqual(['/a.ts'])
  })

  it('prevents duplicate edges', () => {
    const g = new CodeGraph()
    g.addNode('/a.ts', 0)
    g.addNode('/b.ts', 1)
    g.addEdge('/a.ts', '/b.ts')
    g.addEdge('/a.ts', '/b.ts')

    expect(g.edges.length).toBe(1)
  })

  it('removes nodes and cleans up edges', () => {
    const g = new CodeGraph()
    g.addNode('/a.ts', 0)
    g.addNode('/b.ts', 1)
    g.addNode('/c.ts', 1)
    g.addEdge('/a.ts', '/b.ts')
    g.addEdge('/a.ts', '/c.ts')

    g.removeNode('/b.ts')

    expect(g.nodes.size).toBe(2)
    expect(g.edges.length).toBe(1)
    expect(g.nodes.get('/a.ts')!.imports).toEqual(['/c.ts'])
  })

  it('removes edges', () => {
    const g = new CodeGraph()
    g.addNode('/a.ts', 0)
    g.addNode('/b.ts', 1)
    g.addEdge('/a.ts', '/b.ts')

    g.removeEdge('/a.ts', '/b.ts')

    expect(g.edges.length).toBe(0)
    expect(g.nodes.get('/a.ts')!.imports).toEqual([])
    expect(g.nodes.get('/b.ts')!.importedBy).toEqual([])
  })

  it('returns neighbors (imports + importedBy)', () => {
    const g = new CodeGraph()
    g.addNode('/a.ts', 0)
    g.addNode('/b.ts', 1)
    g.addNode('/c.ts', 1)
    g.addEdge('/a.ts', '/b.ts')
    g.addEdge('/c.ts', '/a.ts')

    const neighbors = g.getNeighbors('/a.ts')
    expect(neighbors).toContain('/b.ts')
    expect(neighbors).toContain('/c.ts')
    expect(neighbors.length).toBe(2)
  })

  it('BFS traversal respects depth limit', () => {
    const g = new CodeGraph()
    g.addNode('/a.ts', 0)
    g.addNode('/b.ts', 1)
    g.addNode('/c.ts', 2)
    g.addNode('/d.ts', 3)
    g.addEdge('/a.ts', '/b.ts')
    g.addEdge('/b.ts', '/c.ts')
    g.addEdge('/c.ts', '/d.ts')

    const depth1 = g.bfs('/a.ts', 1)
    expect(depth1).toEqual(['/a.ts', '/b.ts'])

    const depth2 = g.bfs('/a.ts', 2)
    expect(depth2).toEqual(['/a.ts', '/b.ts', '/c.ts'])
  })

  it('serializes and deserializes', () => {
    const g = new CodeGraph()
    g.addNode('/a.ts', 0)
    g.addNode('/b.ts', 1)
    g.addEdge('/a.ts', '/b.ts', 'require')

    const json = g.toJSON()
    const g2 = CodeGraph.fromJSON(json)

    expect(g2.nodes.size).toBe(2)
    expect(g2.edges.length).toBe(1)
    expect(g2.edges[0].type).toBe('require')
    expect(g2.nodes.get('/a.ts')!.imports).toEqual(['/b.ts'])
  })
})
