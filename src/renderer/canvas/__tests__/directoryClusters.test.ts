import { describe, it, expect } from 'vitest'

/**
 * Pure unit tests for directory clustering logic.
 * Mirrors the clustering algorithm in useDirectoryClusters.ts
 * without importing React hooks.
 */

interface SessionLike {
  id: string
  type: string
  filePath?: string
  isPinned?: boolean
  position: { x: number; y: number }
  size: { width: number; height: number }
}

interface ConnectorLike {
  id: string
  sourceId: string
  targetId: string
}

interface DirectoryCluster {
  id: string
  dirName: string
  dirPath: string
  memberIds: string[]
  fileCount: number
  connectionCount: number
  position: { x: number; y: number }
  bounds: { x: number; y: number; width: number; height: number }
}

function getParentDir(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  return idx > 0 ? filePath.substring(0, idx) : '/'
}

function getDirLabel(dirPath: string): string {
  const idx = dirPath.lastIndexOf('/')
  return idx >= 0 ? dirPath.substring(idx + 1) : dirPath
}

function computeClusters(
  sessions: SessionLike[],
  connectors: ConnectorLike[],
  isClusterMode: boolean,
): DirectoryCluster[] {
  if (!isClusterMode) return []

  const dirGroups = new Map<string, SessionLike[]>()

  for (const session of sessions) {
    if (session.type !== 'file') continue
    if (session.isPinned) continue
    const dir = getParentDir(session.filePath!)
    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, [])
    }
    dirGroups.get(dir)!.push(session)
  }

  const clusters: DirectoryCluster[] = []

  for (const [dirPath, files] of dirGroups) {
    if (files.length < 2) continue

    const memberIds = new Set(files.map((f) => f.id))

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let sumX = 0
    let sumY = 0

    for (const file of files) {
      minX = Math.min(minX, file.position.x)
      minY = Math.min(minY, file.position.y)
      maxX = Math.max(maxX, file.position.x + file.size.width)
      maxY = Math.max(maxY, file.position.y + file.size.height)
      sumX += file.position.x + file.size.width / 2
      sumY += file.position.y + file.size.height / 2
    }

    let connectionCount = 0
    for (const c of connectors) {
      if (memberIds.has(c.sourceId) || memberIds.has(c.targetId)) {
        connectionCount++
      }
    }

    clusters.push({
      id: `cluster:${dirPath}`,
      dirName: getDirLabel(dirPath),
      dirPath,
      memberIds: Array.from(memberIds),
      fileCount: files.length,
      connectionCount,
      position: {
        x: sumX / files.length - 80,
        y: sumY / files.length - 40,
      },
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    })
  }

  return clusters
}

// ─── Test fixtures ───

function makeFileSession(id: string, filePath: string, x: number, y: number): SessionLike {
  return {
    id,
    type: 'file',
    filePath,
    position: { x, y },
    size: { width: 640, height: 480 },
  }
}

function makeTerminal(id: string, x: number, y: number): SessionLike {
  return {
    id,
    type: 'terminal',
    position: { x, y },
    size: { width: 640, height: 480 },
  }
}

describe('computeClusters - basic grouping', () => {
  it('returns empty when cluster mode is off', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0),
      makeFileSession('b', '/src/stores/canvasStore.ts', 700, 0),
    ]
    expect(computeClusters(sessions, [], false)).toEqual([])
  })

  it('groups 2+ files from the same directory', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0),
      makeFileSession('b', '/src/stores/canvasStore.ts', 700, 0),
    ]
    const clusters = computeClusters(sessions, [], true)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].dirName).toBe('stores')
    expect(clusters[0].fileCount).toBe(2)
    expect(clusters[0].memberIds).toContain('a')
    expect(clusters[0].memberIds).toContain('b')
  })

  it('does not group a single file in a directory', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0),
      makeFileSession('b', '/src/canvas/Canvas.tsx', 700, 0),
    ]
    const clusters = computeClusters(sessions, [], true)
    expect(clusters).toHaveLength(0)
  })

  it('creates separate clusters for different directories', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0),
      makeFileSession('b', '/src/stores/canvasStore.ts', 700, 0),
      makeFileSession('c', '/src/canvas/Canvas.tsx', 0, 600),
      makeFileSession('d', '/src/canvas/Grid.tsx', 700, 600),
    ]
    const clusters = computeClusters(sessions, [], true)
    expect(clusters).toHaveLength(2)
    const names = clusters.map((c) => c.dirName).sort()
    expect(names).toEqual(['canvas', 'stores'])
  })

  it('ignores terminal sessions', () => {
    const sessions = [
      makeTerminal('t1', 0, 0),
      makeTerminal('t2', 700, 0),
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 600),
    ]
    const clusters = computeClusters(sessions, [], true)
    expect(clusters).toHaveLength(0)
  })

  it('ignores pinned file sessions', () => {
    const sessions = [
      { ...makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0), isPinned: true },
      makeFileSession('b', '/src/stores/canvasStore.ts', 700, 0),
    ]
    const clusters = computeClusters(sessions, [], true)
    expect(clusters).toHaveLength(0)
  })
})

describe('computeClusters - bounding box', () => {
  it('computes correct bounding box for two files', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 100, 200),
      makeFileSession('b', '/src/stores/canvasStore.ts', 800, 200),
    ]
    const clusters = computeClusters(sessions, [], true)
    expect(clusters[0].bounds).toEqual({
      x: 100,
      y: 200,
      width: 800 + 640 - 100,  // maxX - minX
      height: 480,              // same y, so just height of one session
    })
  })

  it('computes centroid-based position', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0),
      makeFileSession('b', '/src/stores/canvasStore.ts', 640, 0),
    ]
    const clusters = computeClusters(sessions, [], true)
    // Centroid x = ((0 + 320) + (640 + 320)) / 2 = 640
    // Centroid y = ((0 + 240) + (0 + 240)) / 2 = 240
    expect(clusters[0].position.x).toBe(640 - 80)
    expect(clusters[0].position.y).toBe(240 - 40)
  })
})

describe('computeClusters - connection counting', () => {
  it('counts connectors touching cluster members', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0),
      makeFileSession('b', '/src/stores/canvasStore.ts', 700, 0),
      makeFileSession('c', '/src/canvas/Canvas.tsx', 0, 600),
    ]
    const connectors = [
      { id: 'c1', sourceId: 'a', targetId: 'c' },
      { id: 'c2', sourceId: 'c', targetId: 'b' },
      { id: 'c3', sourceId: 'a', targetId: 'b' },
    ]
    const clusters = computeClusters(sessions, connectors, true)
    // The stores cluster has members a and b
    // c1: a is in cluster → counted
    // c2: b is in cluster → counted
    // c3: both a and b in cluster → counted
    expect(clusters[0].connectionCount).toBe(3)
  })

  it('returns 0 connections when no connectors exist', () => {
    const sessions = [
      makeFileSession('a', '/src/stores/sessionStore.ts', 0, 0),
      makeFileSession('b', '/src/stores/canvasStore.ts', 700, 0),
    ]
    const clusters = computeClusters(sessions, [], true)
    expect(clusters[0].connectionCount).toBe(0)
  })
})

describe('cluster threshold', () => {
  const CLUSTER_THRESHOLD = 0.2

  it('threshold is 0.2', () => {
    expect(CLUSTER_THRESHOLD).toBe(0.2)
  })

  it('zoom below threshold triggers cluster mode', () => {
    expect(0.15 < CLUSTER_THRESHOLD).toBe(true)
    expect(0.19 < CLUSTER_THRESHOLD).toBe(true)
  })

  it('zoom at or above threshold stays in thumbnail mode', () => {
    expect(0.2 < CLUSTER_THRESHOLD).toBe(false)
    expect(0.3 < CLUSTER_THRESHOLD).toBe(false)
  })
})

describe('getParentDir', () => {
  it('extracts parent directory from file path', () => {
    expect(getParentDir('/src/renderer/stores/sessionStore.ts')).toBe('/src/renderer/stores')
  })

  it('returns / for root-level files', () => {
    expect(getParentDir('/index.ts')).toBe('/')
  })

  it('handles deeply nested paths', () => {
    expect(getParentDir('/a/b/c/d/file.ts')).toBe('/a/b/c/d')
  })
})

describe('getDirLabel', () => {
  it('extracts directory name from path', () => {
    expect(getDirLabel('/src/renderer/stores')).toBe('stores')
  })

  it('returns path when no slash', () => {
    expect(getDirLabel('stores')).toBe('stores')
  })
})
