import { useMemo } from 'react'
import type { Session, FileViewerSession } from '../stores/sessionStore'
import type { Connector } from '../stores/connectorStore'

export interface DirectoryCluster {
  /** Unique key derived from directory path */
  id: string
  /** Human-readable directory name (e.g. "stores") */
  dirName: string
  /** Full directory path for deduplication */
  dirPath: string
  /** Session IDs of files in this cluster */
  memberIds: string[]
  /** Number of files in the cluster */
  fileCount: number
  /** Number of connections (connectors) touching cluster members */
  connectionCount: number
  /** Centroid position of all member sessions */
  position: { x: number; y: number }
  /** Bounding box encompassing all member sessions */
  bounds: { x: number; y: number; width: number; height: number }
}

/**
 * Extract the parent directory path from a file path.
 * e.g. "/project/src/renderer/stores/sessionStore.ts" → "/project/src/renderer/stores"
 */
function getParentDir(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  return idx > 0 ? filePath.substring(0, idx) : '/'
}

/**
 * Extract a short directory label from a full directory path.
 * e.g. "/project/src/renderer/stores" → "stores"
 */
function getDirLabel(dirPath: string): string {
  const idx = dirPath.lastIndexOf('/')
  return idx >= 0 ? dirPath.substring(idx + 1) : dirPath
}

/**
 * Compute directory clusters from file-type sessions on the canvas.
 * Only active when isClusterMode is true. Groups file viewers by parent
 * directory, computes bounding boxes and connection counts.
 */
export function useDirectoryClusters(
  sessions: Session[],
  connectors: Connector[],
  isClusterMode: boolean,
): DirectoryCluster[] {
  return useMemo(() => {
    if (!isClusterMode) return []

    // Group file sessions by parent directory
    const dirGroups = new Map<string, FileViewerSession[]>()

    for (const session of sessions) {
      if (session.type !== 'file') continue
      if (session.isPinned) continue
      const file = session as FileViewerSession
      const dir = getParentDir(file.filePath)
      if (!dirGroups.has(dir)) {
        dirGroups.set(dir, [])
      }
      dirGroups.get(dir)!.push(file)
    }

    // Build a set of member IDs per directory for connection counting
    const clusters: DirectoryCluster[] = []

    for (const [dirPath, files] of dirGroups) {
      if (files.length < 2) continue

      const memberIds = new Set(files.map((f) => f.id))

      // Compute bounding box and centroid
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

      // Count connections that touch at least one member
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
  }, [sessions, connectors, isClusterMode])
}
