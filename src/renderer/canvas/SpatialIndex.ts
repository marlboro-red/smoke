/**
 * Simple quadtree spatial index for efficient viewport culling.
 *
 * Turns O(n) per-frame scans into O(log n + k) where k = visible items.
 * Rebuilt on session changes (infrequent); queried on pan/zoom (frequent).
 */

interface AABB {
  x: number
  y: number
  width: number
  height: number
}

interface SpatialEntry {
  id: string
  bounds: AABB
}

const MAX_ENTRIES = 8
const MAX_DEPTH = 8

export class SpatialIndex {
  private root: QuadNode

  constructor(worldBounds: AABB) {
    this.root = new QuadNode(worldBounds, 0)
  }

  insert(id: string, bounds: AABB): void {
    this.root.insert({ id, bounds })
  }

  query(viewport: AABB): string[] {
    const results: string[] = []
    this.root.query(viewport, results)
    return results
  }

  static fromEntries(
    entries: Iterable<{ id: string; bounds: AABB }>
  ): SpatialIndex {
    // Compute world bounds from all entries
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const items: SpatialEntry[] = []

    for (const e of entries) {
      items.push({ id: e.id, bounds: e.bounds })
      minX = Math.min(minX, e.bounds.x)
      minY = Math.min(minY, e.bounds.y)
      maxX = Math.max(maxX, e.bounds.x + e.bounds.width)
      maxY = Math.max(maxY, e.bounds.y + e.bounds.height)
    }

    if (items.length === 0) {
      return new SpatialIndex({ x: 0, y: 0, width: 1, height: 1 })
    }

    // Add padding so edge items aren't on exact boundaries
    const pad = 1000
    const worldBounds: AABB = {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    }

    const index = new SpatialIndex(worldBounds)
    for (const item of items) {
      index.insert(item.id, item.bounds)
    }
    return index
  }
}

function aabbIntersects(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

class QuadNode {
  private bounds: AABB
  private depth: number
  private entries: SpatialEntry[] = []
  private children: QuadNode[] | null = null

  constructor(bounds: AABB, depth: number) {
    this.bounds = bounds
    this.depth = depth
  }

  insert(entry: SpatialEntry): void {
    if (!aabbIntersects(this.bounds, entry.bounds)) return

    if (this.children) {
      for (const child of this.children) {
        child.insert(entry)
      }
      return
    }

    this.entries.push(entry)

    if (this.entries.length > MAX_ENTRIES && this.depth < MAX_DEPTH) {
      this.subdivide()
    }
  }

  query(viewport: AABB, results: string[]): void {
    if (!aabbIntersects(this.bounds, viewport)) return

    if (this.children) {
      for (const child of this.children) {
        child.query(viewport, results)
      }
      return
    }

    for (const entry of this.entries) {
      if (aabbIntersects(entry.bounds, viewport)) {
        results.push(entry.id)
      }
    }
  }

  private subdivide(): void {
    const { x, y, width, height } = this.bounds
    const hw = width / 2
    const hh = height / 2
    const d = this.depth + 1

    this.children = [
      new QuadNode({ x, y, width: hw, height: hh }, d),
      new QuadNode({ x: x + hw, y, width: hw, height: hh }, d),
      new QuadNode({ x, y: y + hh, width: hw, height: hh }, d),
      new QuadNode({ x: x + hw, y: y + hh, width: hw, height: hh }, d),
    ]

    for (const entry of this.entries) {
      for (const child of this.children) {
        child.insert(entry)
      }
    }
    this.entries = []
  }
}
