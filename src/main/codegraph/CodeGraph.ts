/**
 * Graph data model for code relationships (smoke-mib.3).
 *
 * Pure data structure — no rendering, no I/O.
 * Used by the graph builder and layout engine.
 */

export interface CodeNode {
  filePath: string
  imports: string[]      // file paths this node imports
  importedBy: string[]   // file paths that import this node
  moduleGroup?: string   // directory or package grouping
  depth: number          // BFS depth from root (-1 if not yet placed)
}

export interface CodeEdge {
  from: string  // source file path
  to: string    // target file path
  type: 'import' | 'require' | 'use'
}

export class CodeGraph {
  readonly nodes = new Map<string, CodeNode>()
  readonly edges: CodeEdge[] = []

  addNode(filePath: string, depth = -1): CodeNode {
    const existing = this.nodes.get(filePath)
    if (existing) return existing

    const node: CodeNode = {
      filePath,
      imports: [],
      importedBy: [],
      moduleGroup: getModuleGroup(filePath),
      depth,
    }
    this.nodes.set(filePath, node)
    return node
  }

  removeNode(filePath: string): void {
    const node = this.nodes.get(filePath)
    if (!node) return

    // Remove all edges involving this node
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const e = this.edges[i]
      if (e.from === filePath || e.to === filePath) {
        this.edges.splice(i, 1)
      }
    }

    // Clean up adjacency lists in other nodes
    for (const imp of node.imports) {
      const target = this.nodes.get(imp)
      if (target) {
        target.importedBy = target.importedBy.filter((p) => p !== filePath)
      }
    }
    for (const imp of node.importedBy) {
      const source = this.nodes.get(imp)
      if (source) {
        source.imports = source.imports.filter((p) => p !== filePath)
      }
    }

    this.nodes.delete(filePath)
  }

  addEdge(from: string, to: string, type: CodeEdge['type'] = 'import'): void {
    // Avoid duplicates
    if (this.edges.some((e) => e.from === from && e.to === to)) return

    this.edges.push({ from, to, type })

    const sourceNode = this.nodes.get(from)
    const targetNode = this.nodes.get(to)
    if (sourceNode && !sourceNode.imports.includes(to)) {
      sourceNode.imports.push(to)
    }
    if (targetNode && !targetNode.importedBy.includes(from)) {
      targetNode.importedBy.push(from)
    }
  }

  removeEdge(from: string, to: string): void {
    const idx = this.edges.findIndex((e) => e.from === from && e.to === to)
    if (idx === -1) return

    this.edges.splice(idx, 1)

    const sourceNode = this.nodes.get(from)
    if (sourceNode) {
      sourceNode.imports = sourceNode.imports.filter((p) => p !== to)
    }
    const targetNode = this.nodes.get(to)
    if (targetNode) {
      targetNode.importedBy = targetNode.importedBy.filter((p) => p !== from)
    }
  }

  getNeighbors(filePath: string): string[] {
    const node = this.nodes.get(filePath)
    if (!node) return []
    const set = new Set([...node.imports, ...node.importedBy])
    return Array.from(set)
  }

  /**
   * BFS traversal from a starting node, up to maxDepth levels.
   * Returns visited file paths in BFS order.
   */
  bfs(startPath: string, maxDepth: number): string[] {
    const visited = new Set<string>()
    const queue: Array<{ path: string; depth: number }> = [{ path: startPath, depth: 0 }]
    const result: string[] = []

    while (queue.length > 0) {
      const { path, depth } = queue.shift()!
      if (visited.has(path)) continue
      visited.add(path)
      result.push(path)

      if (depth >= maxDepth) continue

      const node = this.nodes.get(path)
      if (!node) continue

      for (const imp of node.imports) {
        if (!visited.has(imp)) {
          queue.push({ path: imp, depth: depth + 1 })
        }
      }
    }

    return result
  }

  /** Serialize to a plain object for IPC transfer. */
  toJSON(): { nodes: Array<CodeNode & { filePath: string }>; edges: CodeEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
    }
  }

  /** Hydrate from serialized data. */
  static fromJSON(data: { nodes: CodeNode[]; edges: CodeEdge[] }): CodeGraph {
    const graph = new CodeGraph()
    for (const n of data.nodes) {
      const node = graph.addNode(n.filePath, n.depth)
      node.moduleGroup = n.moduleGroup
    }
    for (const e of data.edges) {
      graph.addEdge(e.from, e.to, e.type)
    }
    return graph
  }
}

/** Extract a module group from a file path (parent directory). */
function getModuleGroup(filePath: string): string {
  const parts = filePath.split('/')
  parts.pop() // remove filename
  return parts.join('/')
}
