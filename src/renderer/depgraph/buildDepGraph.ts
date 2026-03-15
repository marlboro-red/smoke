/**
 * Build a dependency graph visualization on the canvas.
 *
 * Given a root file viewer session, this module:
 * 1. Parses imports from the file content
 * 2. Resolves them to absolute paths
 * 3. Recursively traverses dependencies (up to a max depth)
 * 4. Creates file viewer sessions in a tree layout
 * 5. Connects them with arrow connectors
 */

import { sessionStore, findFileSessionByPath, type FileViewerSession } from '../stores/sessionStore'
import { connectorStore } from '../stores/connectorStore'
import { gridStore } from '../stores/gridStore'
import { parseImports } from './importParser'
import { resolveAllImports } from './importResolver'

const MAX_DEPTH = 3
const HORIZONTAL_SPACING = 720   // px between columns
const VERTICAL_SPACING = 540     // px between rows in same column
const FILE_VIEWER_WIDTH = 640
const FILE_VIEWER_HEIGHT = 480

interface GraphNode {
  filePath: string
  sessionId: string
  depth: number
  children: string[] // file paths of dependencies
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go',
    mjs: 'javascript', cjs: 'javascript',
  }
  return langMap[ext] || 'text'
}

function getImporterDir(filePath: string): string {
  const parts = filePath.split('/')
  parts.pop()
  return parts.join('/')
}

/**
 * Create or find a file viewer session for a given path, positioned in a tree layout.
 */
async function ensureFileSession(
  filePath: string,
  position: { x: number; y: number }
): Promise<FileViewerSession | null> {
  // Reuse existing session if the file is already open
  const existing = findFileSessionByPath(filePath)
  if (existing) return existing

  try {
    const result = await window.smokeAPI.fs.readfile(filePath)
    const language = detectLanguage(filePath)
    const { snapToGrid } = gridStore.getState()
    const snappedPos = { x: snapToGrid(position.x), y: snapToGrid(position.y) }

    const session = sessionStore.getState().createFileSession(
      filePath,
      result.content,
      language,
      snappedPos
    )
    return session
  } catch {
    // File unreadable — skip
    return null
  }
}

/**
 * Build the dependency graph starting from a root file viewer session.
 */
export async function buildDepGraph(rootSession: FileViewerSession): Promise<void> {
  const visited = new Map<string, GraphNode>()
  const rootX = rootSession.position.x
  const rootY = rootSession.position.y

  // Track nodes per depth level for vertical positioning
  const depthCounts = new Map<number, number>()

  // Register root node
  visited.set(rootSession.filePath, {
    filePath: rootSession.filePath,
    sessionId: rootSession.id,
    depth: 0,
    children: [],
  })

  // BFS traversal
  const queue: Array<{ filePath: string; content: string; language: string; depth: number }> = [{
    filePath: rootSession.filePath,
    content: rootSession.content,
    language: rootSession.language,
    depth: 0,
  }]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.depth >= MAX_DEPTH) continue

    const parsed = parseImports(current.content, current.language)
    const importerDir = getImporterDir(current.filePath)
    const resolvedPaths = await resolveAllImports(parsed, importerDir, current.language)

    const parentNode = visited.get(current.filePath)!
    parentNode.children = resolvedPaths

    for (const depPath of resolvedPaths) {
      if (visited.has(depPath)) continue

      const childDepth = current.depth + 1
      const depthCount = depthCounts.get(childDepth) ?? 0
      depthCounts.set(childDepth, depthCount + 1)

      // Position: root + offset based on depth (x) and index within depth (y)
      const posX = rootX + childDepth * HORIZONTAL_SPACING
      const posY = rootY + depthCount * VERTICAL_SPACING

      const session = await ensureFileSession(depPath, { x: posX, y: posY })
      if (!session) continue

      visited.set(depPath, {
        filePath: depPath,
        sessionId: session.id,
        depth: childDepth,
        children: [],
      })

      // Read content for further traversal
      try {
        const result = await window.smokeAPI.fs.readfile(depPath)
        const language = detectLanguage(depPath)
        queue.push({
          filePath: depPath,
          content: result.content,
          language,
          depth: childDepth,
        })
      } catch {
        // Can't read — stop traversal for this node
      }
    }
  }

  // Create connectors for all edges
  for (const [, node] of visited) {
    for (const childPath of node.children) {
      const childNode = visited.get(childPath)
      if (!childNode) continue

      // Avoid duplicate connectors
      const existingConnectors = Array.from(connectorStore.getState().connectors.values())
      const alreadyExists = existingConnectors.some(
        (c) => c.sourceId === node.sessionId && c.targetId === childNode.sessionId
      )
      if (alreadyExists) continue

      connectorStore.getState().addConnector(node.sessionId, childNode.sessionId, {
        label: 'imports',
        color: '#4A90D9',
      })
    }
  }

  // Center the tree vertically around the root
  centerTreeAroundRoot(rootSession, visited, depthCounts)
}

/**
 * Adjust child positions so the tree is centered vertically around the root.
 */
function centerTreeAroundRoot(
  rootSession: FileViewerSession,
  visited: Map<string, GraphNode>,
  depthCounts: Map<number, number>
): void {
  const rootY = rootSession.position.y
  const rootCenterY = rootY + FILE_VIEWER_HEIGHT / 2

  for (const [depth, count] of depthCounts) {
    if (depth === 0) continue
    const totalHeight = (count - 1) * VERTICAL_SPACING + FILE_VIEWER_HEIGHT
    const startY = rootCenterY - totalHeight / 2

    // Gather nodes at this depth, sorted by current Y
    const nodesAtDepth = Array.from(visited.values())
      .filter((n) => n.depth === depth)
      .sort((a, b) => {
        const sa = sessionStore.getState().sessions.get(a.sessionId)
        const sb = sessionStore.getState().sessions.get(b.sessionId)
        return (sa?.position.y ?? 0) - (sb?.position.y ?? 0)
      })

    nodesAtDepth.forEach((node, idx) => {
      const newY = gridStore.getState().snapToGrid(startY + idx * VERTICAL_SPACING)
      sessionStore.getState().updateSession(node.sessionId, {
        position: {
          x: sessionStore.getState().sessions.get(node.sessionId)!.position.x,
          y: newY,
        },
      })
    })
  }
}
