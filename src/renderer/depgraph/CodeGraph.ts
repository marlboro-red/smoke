/**
 * Pure data structure for code relationship graphs.
 * No rendering or IO — used by the graph builder and layout engine.
 */

export interface CodeNode {
  filePath: string
  imports: string[]      // file paths this node imports
  importedBy: string[]   // file paths that import this node
  moduleGroup?: string   // optional grouping (e.g., directory, package)
  depth: number          // BFS depth from the root node
}

export type EdgeType = 'import' | 'require' | 'use' | 'reexport'

export interface CodeEdge {
  from: string   // source filePath
  to: string     // target filePath
  type: EdgeType
}

export class CodeGraph {
  readonly nodes: Map<string, CodeNode> = new Map()
  readonly edges: CodeEdge[] = []

  addNode(filePath: string, depth: number, moduleGroup?: string): CodeNode {
    const existing = this.nodes.get(filePath)
    if (existing) return existing

    const node: CodeNode = {
      filePath,
      imports: [],
      importedBy: [],
      moduleGroup,
      depth,
    }
    this.nodes.set(filePath, node)
    return node
  }

  removeNode(filePath: string): boolean {
    const node = this.nodes.get(filePath)
    if (!node) return false

    // Remove all edges involving this node
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const edge = this.edges[i]
      if (edge.from === filePath || edge.to === filePath) {
        this.edges.splice(i, 1)
      }
    }

    // Clean up references in neighboring nodes
    for (const importedPath of node.imports) {
      const target = this.nodes.get(importedPath)
      if (target) {
        target.importedBy = target.importedBy.filter((p) => p !== filePath)
      }
    }
    for (const importerPath of node.importedBy) {
      const source = this.nodes.get(importerPath)
      if (source) {
        source.imports = source.imports.filter((p) => p !== filePath)
      }
    }

    this.nodes.delete(filePath)
    return true
  }

  addEdge(from: string, to: string, type: EdgeType): boolean {
    const sourceNode = this.nodes.get(from)
    const targetNode = this.nodes.get(to)
    if (!sourceNode || !targetNode) return false

    // Avoid duplicate edges
    const exists = this.edges.some(
      (e) => e.from === from && e.to === to && e.type === type
    )
    if (exists) return false

    this.edges.push({ from, to, type })
    if (!sourceNode.imports.includes(to)) {
      sourceNode.imports.push(to)
    }
    if (!targetNode.importedBy.includes(from)) {
      targetNode.importedBy.push(from)
    }
    return true
  }

  removeEdge(from: string, to: string, type: EdgeType): boolean {
    const idx = this.edges.findIndex(
      (e) => e.from === from && e.to === to && e.type === type
    )
    if (idx === -1) return false

    this.edges.splice(idx, 1)

    // Only clean up node references if no other edges of any type connect them
    const stillConnected = this.edges.some(
      (e) => e.from === from && e.to === to
    )
    if (!stillConnected) {
      const sourceNode = this.nodes.get(from)
      const targetNode = this.nodes.get(to)
      if (sourceNode) {
        sourceNode.imports = sourceNode.imports.filter((p) => p !== to)
      }
      if (targetNode) {
        targetNode.importedBy = targetNode.importedBy.filter((p) => p !== from)
      }
    }

    return true
  }

  getNeighbors(filePath: string): CodeNode[] {
    const node = this.nodes.get(filePath)
    if (!node) return []

    const neighborPaths = new Set([...node.imports, ...node.importedBy])
    const neighbors: CodeNode[] = []
    for (const p of neighborPaths) {
      const n = this.nodes.get(p)
      if (n) neighbors.push(n)
    }
    return neighbors
  }

  /**
   * BFS traversal from a starting node with an optional depth limit.
   * Returns nodes in BFS order.
   */
  bfs(startPath: string, maxDepth = Infinity): CodeNode[] {
    const startNode = this.nodes.get(startPath)
    if (!startNode) return []

    const visited = new Set<string>([startPath])
    const result: CodeNode[] = [startNode]
    const queue: Array<{ path: string; depth: number }> = [
      { path: startPath, depth: 0 },
    ]

    while (queue.length > 0) {
      const { path, depth } = queue.shift()!
      if (depth >= maxDepth) continue

      const node = this.nodes.get(path)!
      for (const neighborPath of node.imports) {
        if (visited.has(neighborPath)) continue
        visited.add(neighborPath)

        const neighbor = this.nodes.get(neighborPath)
        if (neighbor) {
          result.push(neighbor)
          queue.push({ path: neighborPath, depth: depth + 1 })
        }
      }
    }

    return result
  }
}
