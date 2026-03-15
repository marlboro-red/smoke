/**
 * Hierarchical layout engine for positioning graph nodes (smoke-mib.4).
 *
 * Takes a CodeGraph (serialized as arrays) and computes {x, y} positions
 * for each node. Uses BFS depth levels to position nodes in columns —
 * single O(V+E) pass, no iteration needed.
 *
 * Supports incremental layout: when new nodes are added (user expands a
 * file), computes only new positions and shifts siblings minimally.
 *
 * All functions are pure (no side effects, no DOM access) so they can
 * run in a web worker.
 *
 * Output positions are compatible with canvas session coordinates.
 */

import type { CodeNode, CodeEdge } from './CodeGraph'

export interface NodePosition {
  filePath: string
  x: number
  y: number
  depth: number
}

export interface LayoutResult {
  positions: NodePosition[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

export interface LayoutOptions {
  /** Horizontal spacing between depth columns (px). Default: 720 */
  horizontalSpacing?: number
  /** Vertical spacing between sibling nodes (px). Default: 200 */
  verticalSpacing?: number
  /** Node width for bounds calculation (px). Default: 640 */
  nodeWidth?: number
  /** Node height for bounds calculation (px). Default: 480 */
  nodeHeight?: number
  /** Origin X position for the root node (px). Default: 0 */
  originX?: number
  /** Origin Y position for the root node (px). Default: 0 */
  originY?: number
}

const DEFAULTS: Required<LayoutOptions> = {
  horizontalSpacing: 720,
  verticalSpacing: 200,
  nodeWidth: 640,
  nodeHeight: 480,
  originX: 0,
  originY: 0,
}

/**
 * Compute layout positions for all nodes in a code graph.
 * Uses BFS depth levels to arrange nodes in columns, centered vertically.
 */
export function computeLayout(
  graph: { nodes: CodeNode[]; edges: CodeEdge[] },
  rootPath: string,
  options: LayoutOptions = {}
): LayoutResult {
  const opts = { ...DEFAULTS, ...options }

  // Group nodes by depth
  const depthBuckets = new Map<number, CodeNode[]>()
  for (const node of graph.nodes) {
    const depth = node.depth >= 0 ? node.depth : 0
    if (!depthBuckets.has(depth)) {
      depthBuckets.set(depth, [])
    }
    depthBuckets.get(depth)!.push(node)
  }

  const positions: NodePosition[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [depth, nodes] of depthBuckets) {
    const x = opts.originX + depth * opts.horizontalSpacing

    // Center the column vertically around the origin
    const totalHeight = (nodes.length - 1) * opts.verticalSpacing
    const startY = opts.originY - totalHeight / 2

    for (let i = 0; i < nodes.length; i++) {
      const y = startY + i * opts.verticalSpacing

      positions.push({ filePath: nodes[i].filePath, x, y, depth })

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + opts.nodeWidth)
      maxY = Math.max(maxY, y + opts.nodeHeight)
    }
  }

  if (positions.length === 0) {
    return { positions, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  }

  return { positions, bounds: { minX, minY, maxX, maxY } }
}

/**
 * Compute incremental layout for newly added nodes.
 * Preserves existing positions and only computes positions for new nodes,
 * placing them below existing siblings at the same depth.
 */
export function computeIncrementalLayout(
  graph: { nodes: CodeNode[]; edges: CodeEdge[] },
  existingPositions: NodePosition[],
  options: LayoutOptions = {}
): LayoutResult {
  const opts = { ...DEFAULTS, ...options }
  const existingSet = new Set(existingPositions.map((p) => p.filePath))

  const newNodes = graph.nodes.filter((n) => !existingSet.has(n.filePath))
  if (newNodes.length === 0) {
    const bounds = computeBounds(existingPositions, opts.nodeWidth, opts.nodeHeight)
    return { positions: [...existingPositions], bounds }
  }

  // Group new nodes by depth
  const depthBuckets = new Map<number, CodeNode[]>()
  for (const node of newNodes) {
    const depth = node.depth >= 0 ? node.depth : 0
    if (!depthBuckets.has(depth)) {
      depthBuckets.set(depth, [])
    }
    depthBuckets.get(depth)!.push(node)
  }

  // Count existing nodes at each depth
  const existingDepthCounts = new Map<number, number>()
  for (const pos of existingPositions) {
    existingDepthCounts.set(pos.depth, (existingDepthCounts.get(pos.depth) ?? 0) + 1)
  }

  const allPositions = [...existingPositions]

  for (const [depth, nodes] of depthBuckets) {
    const x = opts.originX + depth * opts.horizontalSpacing
    const existingCount = existingDepthCounts.get(depth) ?? 0

    // Place new nodes below existing ones at this depth
    let maxExistingY = opts.originY
    for (const pos of existingPositions) {
      if (pos.depth === depth) {
        maxExistingY = Math.max(maxExistingY, pos.y)
      }
    }

    const startY = existingCount > 0
      ? maxExistingY + opts.verticalSpacing
      : opts.originY - ((nodes.length - 1) * opts.verticalSpacing) / 2

    for (let i = 0; i < nodes.length; i++) {
      allPositions.push({
        filePath: nodes[i].filePath,
        x,
        y: startY + i * opts.verticalSpacing,
        depth,
      })
    }
  }

  const bounds = computeBounds(allPositions, opts.nodeWidth, opts.nodeHeight)
  return { positions: allPositions, bounds }
}

function computeBounds(
  positions: NodePosition[],
  nodeWidth: number,
  nodeHeight: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (positions.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of positions) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + nodeWidth)
    maxY = Math.max(maxY, p.y + nodeHeight)
  }
  return { minX, minY, maxX, maxY }
}
