import { describe, it, expect, beforeEach } from 'vitest'
import { CodeGraph } from '../CodeGraph'

describe('CodeGraph', () => {
  let graph: CodeGraph

  beforeEach(() => {
    graph = new CodeGraph()
  })

  describe('addNode', () => {
    it('adds a node and returns it', () => {
      const node = graph.addNode('/src/index.ts', 0)
      expect(node.filePath).toBe('/src/index.ts')
      expect(node.depth).toBe(0)
      expect(node.imports).toEqual([])
      expect(node.importedBy).toEqual([])
      expect(graph.nodes.size).toBe(1)
    })

    it('returns existing node if already added', () => {
      const first = graph.addNode('/src/index.ts', 0, 'src')
      const second = graph.addNode('/src/index.ts', 1, 'other')
      expect(first).toBe(second)
      expect(first.depth).toBe(0) // original values preserved
      expect(first.moduleGroup).toBe('src')
    })

    it('sets moduleGroup when provided', () => {
      const node = graph.addNode('/src/utils/helper.ts', 1, 'utils')
      expect(node.moduleGroup).toBe('utils')
    })
  })

  describe('removeNode', () => {
    it('removes a node and its edges', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)
      graph.addEdge('/src/a.ts', '/src/b.ts', 'import')

      expect(graph.removeNode('/src/b.ts')).toBe(true)
      expect(graph.nodes.size).toBe(1)
      expect(graph.edges).toHaveLength(0)

      const a = graph.nodes.get('/src/a.ts')!
      expect(a.imports).toEqual([])
    })

    it('returns false for non-existent node', () => {
      expect(graph.removeNode('/nope')).toBe(false)
    })

    it('cleans up both import and importedBy references', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)
      graph.addNode('/src/c.ts', 1)
      graph.addEdge('/src/a.ts', '/src/b.ts', 'import')
      graph.addEdge('/src/b.ts', '/src/c.ts', 'import')

      graph.removeNode('/src/b.ts')

      const a = graph.nodes.get('/src/a.ts')!
      const c = graph.nodes.get('/src/c.ts')!
      expect(a.imports).toEqual([])
      expect(c.importedBy).toEqual([])
    })
  })

  describe('addEdge', () => {
    it('adds an edge between existing nodes', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)

      expect(graph.addEdge('/src/a.ts', '/src/b.ts', 'import')).toBe(true)
      expect(graph.edges).toHaveLength(1)
      expect(graph.edges[0]).toEqual({
        from: '/src/a.ts',
        to: '/src/b.ts',
        type: 'import',
      })

      const a = graph.nodes.get('/src/a.ts')!
      const b = graph.nodes.get('/src/b.ts')!
      expect(a.imports).toContain('/src/b.ts')
      expect(b.importedBy).toContain('/src/a.ts')
    })

    it('returns false if source node does not exist', () => {
      graph.addNode('/src/b.ts', 1)
      expect(graph.addEdge('/nope', '/src/b.ts', 'import')).toBe(false)
    })

    it('returns false if target node does not exist', () => {
      graph.addNode('/src/a.ts', 0)
      expect(graph.addEdge('/src/a.ts', '/nope', 'import')).toBe(false)
    })

    it('prevents duplicate edges', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)
      graph.addEdge('/src/a.ts', '/src/b.ts', 'import')
      expect(graph.addEdge('/src/a.ts', '/src/b.ts', 'import')).toBe(false)
      expect(graph.edges).toHaveLength(1)
    })

    it('allows edges of different types between same nodes', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)
      graph.addEdge('/src/a.ts', '/src/b.ts', 'import')
      graph.addEdge('/src/a.ts', '/src/b.ts', 'reexport')
      expect(graph.edges).toHaveLength(2)
    })
  })

  describe('removeEdge', () => {
    it('removes a specific edge', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)
      graph.addEdge('/src/a.ts', '/src/b.ts', 'import')

      expect(graph.removeEdge('/src/a.ts', '/src/b.ts', 'import')).toBe(true)
      expect(graph.edges).toHaveLength(0)

      const a = graph.nodes.get('/src/a.ts')!
      const b = graph.nodes.get('/src/b.ts')!
      expect(a.imports).toEqual([])
      expect(b.importedBy).toEqual([])
    })

    it('returns false for non-existent edge', () => {
      expect(graph.removeEdge('/a', '/b', 'import')).toBe(false)
    })

    it('preserves node references when another edge still connects them', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)
      graph.addEdge('/src/a.ts', '/src/b.ts', 'import')
      graph.addEdge('/src/a.ts', '/src/b.ts', 'reexport')

      graph.removeEdge('/src/a.ts', '/src/b.ts', 'import')

      const a = graph.nodes.get('/src/a.ts')!
      const b = graph.nodes.get('/src/b.ts')!
      expect(a.imports).toContain('/src/b.ts')
      expect(b.importedBy).toContain('/src/a.ts')
      expect(graph.edges).toHaveLength(1)
    })
  })

  describe('getNeighbors', () => {
    it('returns all nodes connected by imports or importedBy', () => {
      graph.addNode('/src/a.ts', 0)
      graph.addNode('/src/b.ts', 1)
      graph.addNode('/src/c.ts', 1)
      graph.addEdge('/src/a.ts', '/src/b.ts', 'import')
      graph.addEdge('/src/c.ts', '/src/a.ts', 'import')

      const neighbors = graph.getNeighbors('/src/a.ts')
      const paths = neighbors.map((n) => n.filePath).sort()
      expect(paths).toEqual(['/src/b.ts', '/src/c.ts'])
    })

    it('returns empty array for unknown node', () => {
      expect(graph.getNeighbors('/nope')).toEqual([])
    })

    it('returns empty array for isolated node', () => {
      graph.addNode('/src/alone.ts', 0)
      expect(graph.getNeighbors('/src/alone.ts')).toEqual([])
    })
  })

  describe('bfs', () => {
    // Build a diamond graph: a -> b, a -> c, b -> d, c -> d
    function buildDiamond(): void {
      graph.addNode('/a.ts', 0)
      graph.addNode('/b.ts', 1)
      graph.addNode('/c.ts', 1)
      graph.addNode('/d.ts', 2)
      graph.addEdge('/a.ts', '/b.ts', 'import')
      graph.addEdge('/a.ts', '/c.ts', 'import')
      graph.addEdge('/b.ts', '/d.ts', 'import')
      graph.addEdge('/c.ts', '/d.ts', 'import')
    }

    it('traverses all reachable nodes', () => {
      buildDiamond()
      const result = graph.bfs('/a.ts')
      const paths = result.map((n) => n.filePath)
      expect(paths).toContain('/a.ts')
      expect(paths).toContain('/b.ts')
      expect(paths).toContain('/c.ts')
      expect(paths).toContain('/d.ts')
      expect(paths).toHaveLength(4)
    })

    it('respects maxDepth', () => {
      buildDiamond()
      const result = graph.bfs('/a.ts', 1)
      const paths = result.map((n) => n.filePath)
      expect(paths).toContain('/a.ts')
      expect(paths).toContain('/b.ts')
      expect(paths).toContain('/c.ts')
      expect(paths).not.toContain('/d.ts')
    })

    it('returns only start node at depth 0', () => {
      buildDiamond()
      const result = graph.bfs('/a.ts', 0)
      expect(result).toHaveLength(1)
      expect(result[0].filePath).toBe('/a.ts')
    })

    it('returns empty for unknown start node', () => {
      expect(graph.bfs('/nope')).toEqual([])
    })

    it('does not visit nodes twice', () => {
      buildDiamond()
      const result = graph.bfs('/a.ts')
      const paths = result.map((n) => n.filePath)
      expect(new Set(paths).size).toBe(paths.length)
    })

    it('follows only import direction (not importedBy)', () => {
      graph.addNode('/a.ts', 0)
      graph.addNode('/b.ts', 1)
      graph.addNode('/c.ts', 0)
      graph.addEdge('/a.ts', '/b.ts', 'import')
      graph.addEdge('/c.ts', '/a.ts', 'import') // c imports a

      // BFS from a should only reach b, not c
      const result = graph.bfs('/a.ts')
      const paths = result.map((n) => n.filePath)
      expect(paths).toEqual(['/a.ts', '/b.ts'])
    })
  })
})
