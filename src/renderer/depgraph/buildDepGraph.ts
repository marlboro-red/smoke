/**
 * Graph renderer: materialize CodeGraph as file viewers and arrows on canvas.
 *
 * Uses the IPC-based codegraph system (codegraph:build / codegraph:expand)
 * to get a CodeGraph with layout positions, then:
 * 1. Creates file viewer sessions for each node
 * 2. Creates arrow connectors for each edge
 * 3. Positions elements according to layout engine output
 * 4. Animates elements into position
 * 5. Handles incremental updates via expand
 * 6. Avoids duplicating already-open file viewers
 */

import { sessionStore, findFileSessionByPath, type FileViewerSession } from '../stores/sessionStore'
import { connectorStore } from '../stores/connectorStore'
import { gridStore } from '../stores/gridStore'
import { regionStore } from '../stores/regionStore'
import { preferencesStore } from '../stores/preferencesStore'
import {
  setCachedImports,
  registerGraphNode,
  clearActiveGraph,
  clearImportCache,
  getActiveGraphEntries,
  getGraphSessionId,
  markNodeExpanded,
} from './GraphCache'
import type { CodeGraphResult, CodeGraphPosition, CodeGraphNode, CodeGraphEdge } from '../../preload/types'

const CONNECTOR_COLOR = '#4A90D9'
const ANIMATION_DURATION_MS = 300
const REGION_PADDING = 40

// Track region IDs created by graph materialization so we can clear them on rebuild
// Exported for testing
export const graphRegionIds = new Set<string>()

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go',
    mjs: 'javascript', cjs: 'javascript',
  }
  return langMap[ext] || 'text'
}

/**
 * Create or reuse a file viewer session at the given position.
 * Returns null if the file can't be read.
 */
async function ensureFileSession(
  filePath: string,
  position: { x: number; y: number },
): Promise<FileViewerSession | null> {
  const existing = findFileSessionByPath(filePath)
  if (existing) return existing

  try {
    const result = await window.smokeAPI.fs.readfile(filePath)
    const language = detectLanguage(filePath)
    const { snapToGrid } = gridStore.getState()
    const snappedPos = { x: snapToGrid(position.x), y: snapToGrid(position.y) }

    return sessionStore.getState().createFileSession(
      filePath,
      result.content,
      language,
      snappedPos,
    )
  } catch {
    return null
  }
}

/**
 * Check if a connector already exists between two sessions.
 */
function connectorExists(sourceId: string, targetId: string): boolean {
  for (const c of connectorStore.getState().connectors.values()) {
    if (c.sourceId === sourceId && c.targetId === targetId) return true
  }
  return false
}

/**
 * Animate session elements into their target positions using CSS transitions.
 */
function animateSessionPositions(
  sessionPositions: Array<{ sessionId: string; x: number; y: number }>,
): void {
  for (const { sessionId, x, y } of sessionPositions) {
    if (typeof document !== 'undefined') {
      const el = document.querySelector(`[data-session-id="${sessionId}"]`) as HTMLElement | null
      if (el) {
        el.style.transition = `left ${ANIMATION_DURATION_MS}ms ease-out, top ${ANIMATION_DURATION_MS}ms ease-out`
        setTimeout(() => {
          el.style.transition = ''
        }, ANIMATION_DURATION_MS + 50)
      }
    }

    sessionStore.getState().updateSession(sessionId, {
      position: { x, y },
    })
  }
}

/**
 * Remove all regions previously created by graph materialization.
 */
function clearGraphRegions(): void {
  for (const id of graphRegionIds) {
    regionStore.getState().removeRegion(id)
  }
  graphRegionIds.clear()
}

/**
 * Extract a human-readable directory label from a file path.
 * E.g., "/project/src/renderer/stores/sessionStore.ts" → "stores"
 */
function extractDirLabel(filePath: string): string {
  const parts = filePath.split('/')
  parts.pop() // remove filename
  return parts[parts.length - 1] || '/'
}

/**
 * Auto-group graph nodes by directory and create canvas regions.
 *
 * Groups nodes by their moduleGroup (parent directory). For each directory
 * with 2+ files, computes a bounding box around the positioned sessions
 * and creates a Region in the regionStore.
 */
function createRegionsFromGraph(
  nodes: CodeGraphNode[],
  fileToSession: Map<string, string>,
): void {
  // Group nodes by directory (moduleGroup)
  const dirGroups = new Map<string, string[]>()

  for (const node of nodes) {
    const dir = node.moduleGroup || extractDirLabel(node.filePath)
    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, [])
    }
    dirGroups.get(dir)!.push(node.filePath)
  }

  const { snapToGrid } = gridStore.getState()

  for (const [dir, filePaths] of dirGroups) {
    if (filePaths.length < 2) continue

    // Compute bounding box of all sessions in this directory
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let found = 0

    for (const fp of filePaths) {
      const sessionId = fileToSession.get(fp)
      if (!sessionId) continue
      const session = sessionStore.getState().sessions.get(sessionId)
      if (!session) continue

      minX = Math.min(minX, session.position.x)
      minY = Math.min(minY, session.position.y)
      maxX = Math.max(maxX, session.position.x + session.size.width)
      maxY = Math.max(maxY, session.position.y + session.size.height)
      found++
    }

    if (found < 2) continue

    const region = regionStore.getState().createRegion(
      dir,
      {
        x: snapToGrid(minX - REGION_PADDING),
        y: snapToGrid(minY - REGION_PADDING),
      },
      {
        width: snapToGrid(maxX - minX + 2 * REGION_PADDING),
        height: snapToGrid(maxY - minY + 2 * REGION_PADDING),
      },
    )
    graphRegionIds.add(region.id)
  }
}

/**
 * Build and materialize a reverse dependency graph (dependents) from a root file viewer.
 *
 * Shows all files that import the given file, with inward-pointing arrows.
 */
export async function buildDependentsGraph(rootSession: FileViewerSession): Promise<void> {
  const projectRoot = preferencesStore.getState().launchCwd
  if (!projectRoot) return

  clearActiveGraph()
  clearImportCache()
  clearGraphRegions()

  const result: CodeGraphResult = await window.smokeAPI.codegraph.buildDependents(
    rootSession.filePath,
    projectRoot,
  )

  await materializeGraph(result, rootSession)
}

/**
 * Build and materialize a full dependency graph from a root file viewer.
 *
 * Calls codegraph:build via IPC to get the graph + layout, then creates
 * file viewer sessions and arrow connectors on the canvas.
 */
export async function buildDepGraph(rootSession: FileViewerSession): Promise<void> {
  const projectRoot = preferencesStore.getState().launchCwd
  if (!projectRoot) return

  // Reset graph cache and regions for fresh build
  clearActiveGraph()
  clearImportCache()
  clearGraphRegions()

  // Build graph via IPC — returns nodes, edges, and layout positions
  const result: CodeGraphResult = await window.smokeAPI.codegraph.build(
    rootSession.filePath,
    projectRoot,
  )

  markNodeExpanded(rootSession.filePath)
  await materializeGraph(result, rootSession)
}

/**
 * Expand an existing graph by adding dependencies of a new file.
 *
 * Only creates new sessions and repositions existing ones with animation.
 */
export async function expandDepGraph(expandPath: string): Promise<void> {
  const projectRoot = preferencesStore.getState().launchCwd
  if (!projectRoot) return

  // Build existing graph state from GraphCache
  const existingGraph = buildExistingGraphState()
  const existingPositions = buildExistingPositions()

  const result: CodeGraphResult = await window.smokeAPI.codegraph.expand(
    existingGraph,
    existingPositions,
    expandPath,
    projectRoot,
  )

  markNodeExpanded(expandPath)
  await materializeIncrementalGraph(result, existingPositions)
}

/**
 * Materialize a full graph result on the canvas.
 * Creates file sessions for each node, connectors for each edge.
 */
async function materializeGraph(
  result: CodeGraphResult,
  rootSession: FileViewerSession,
): Promise<void> {
  const { positions } = result.layout
  const { nodes, edges } = result.graph

  // Find the layout position for the root to compute offset
  const rootLayoutPos = positions.find((p) => p.filePath === rootSession.filePath)
  const offsetX = rootSession.position.x - (rootLayoutPos?.x ?? 0)
  const offsetY = rootSession.position.y - (rootLayoutPos?.y ?? 0)

  // Map filePath → sessionId for connector creation
  const fileToSession = new Map<string, string>()

  // Register root node
  fileToSession.set(rootSession.filePath, rootSession.id)
  registerGraphNode(rootSession.filePath, rootSession.id)

  // Create file sessions for each node (except root which already exists)
  for (const pos of positions) {
    if (pos.filePath === rootSession.filePath) continue

    const canvasX = pos.x + offsetX
    const canvasY = pos.y + offsetY

    const session = await ensureFileSession(pos.filePath, { x: canvasX, y: canvasY })
    if (!session) continue

    fileToSession.set(pos.filePath, session.id)
    registerGraphNode(pos.filePath, session.id)
  }

  // Populate import cache from graph nodes
  for (const node of nodes) {
    setCachedImports(node.filePath, node.imports)
    window.smokeAPI?.fs.watch(node.filePath)
  }

  // Create connectors for all edges
  createConnectors(edges, fileToSession)

  // Animate newly created sessions — reposition any existing sessions that
  // were reused but need to move to their layout positions
  const repositions: Array<{ sessionId: string; x: number; y: number }> = []
  const { snapToGrid } = gridStore.getState()

  for (const pos of positions) {
    const sessionId = fileToSession.get(pos.filePath)
    if (!sessionId) continue
    if (pos.filePath === rootSession.filePath) continue

    const session = sessionStore.getState().sessions.get(sessionId)
    if (!session) continue

    const targetX = snapToGrid(pos.x + offsetX)
    const targetY = snapToGrid(pos.y + offsetY)

    // Only animate if position differs (reused sessions may be elsewhere)
    if (session.position.x !== targetX || session.position.y !== targetY) {
      repositions.push({ sessionId, x: targetX, y: targetY })
    }
  }

  if (repositions.length > 0) {
    animateSessionPositions(repositions)
  }

  // Auto-group nodes by directory into canvas regions
  createRegionsFromGraph(nodes, fileToSession)
}

/**
 * Materialize incremental graph changes — only create new sessions
 * and reposition existing ones with animation.
 */
async function materializeIncrementalGraph(
  result: CodeGraphResult,
  existingPositions: CodeGraphPosition[],
): Promise<void> {
  const { positions } = result.layout
  const { nodes, edges } = result.graph

  const existingSet = new Set(existingPositions.map((p) => p.filePath))
  const fileToSession = new Map<string, string>()

  // Map existing graph nodes
  for (const entry of getActiveGraphEntries()) {
    fileToSession.set(entry[0], entry[1])
  }

  // Create sessions for new nodes only
  for (const pos of positions) {
    if (existingSet.has(pos.filePath)) continue

    const session = await ensureFileSession(pos.filePath, { x: pos.x, y: pos.y })
    if (!session) continue

    fileToSession.set(pos.filePath, session.id)
    registerGraphNode(pos.filePath, session.id)
  }

  // Update import cache for new nodes
  for (const node of nodes) {
    if (!existingSet.has(node.filePath)) {
      setCachedImports(node.filePath, node.imports)
      window.smokeAPI?.fs.watch(node.filePath)
    }
  }

  // Create connectors for new edges
  createConnectors(edges, fileToSession)

  // Animate all positions — existing nodes may shift, new nodes animate in
  const repositions: Array<{ sessionId: string; x: number; y: number }> = []
  const { snapToGrid } = gridStore.getState()

  for (const pos of positions) {
    const sessionId = fileToSession.get(pos.filePath)
    if (!sessionId) continue

    const session = sessionStore.getState().sessions.get(sessionId)
    if (!session) continue

    const targetX = snapToGrid(pos.x)
    const targetY = snapToGrid(pos.y)

    if (session.position.x !== targetX || session.position.y !== targetY) {
      repositions.push({ sessionId, x: targetX, y: targetY })
    }
  }

  if (repositions.length > 0) {
    animateSessionPositions(repositions)
  }

  // Update regions: clear old graph regions and recreate from updated graph
  clearGraphRegions()
  createRegionsFromGraph(nodes, fileToSession)
}

/**
 * Create arrow connectors for graph edges, skipping duplicates.
 */
function createConnectors(
  edges: CodeGraphEdge[],
  fileToSession: Map<string, string>,
): void {
  for (const edge of edges) {
    const sourceId = fileToSession.get(edge.from)
    const targetId = fileToSession.get(edge.to)
    if (!sourceId || !targetId) continue

    if (connectorExists(sourceId, targetId)) continue

    connectorStore.getState().addConnector(sourceId, targetId, {
      label: edge.type,
      color: CONNECTOR_COLOR,
    })
  }
}

/**
 * Build the existing graph structure from GraphCache for incremental expansion.
 */
function buildExistingGraphState(): CodeGraphResult['graph'] {
  const nodes: CodeGraphNode[] = []
  const edges: CodeGraphEdge[] = []
  const activeEntries = getActiveGraphEntries()

  for (const [filePath] of activeEntries) {
    const session = findFileSessionByPath(filePath)
    if (!session) continue

    // Find connectors from this session to get imports
    const imports: string[] = []
    const importedBy: string[] = []

    for (const c of connectorStore.getState().connectors.values()) {
      if (c.sourceId === session.id) {
        // Find the target file path
        for (const [fp, sid] of activeEntries) {
          if (sid === c.targetId) {
            imports.push(fp)
            edges.push({ from: filePath, to: fp, type: 'import' })
            break
          }
        }
      }
      if (c.targetId === session.id) {
        for (const [fp, sid] of activeEntries) {
          if (sid === c.sourceId) {
            importedBy.push(fp)
            break
          }
        }
      }
    }

    nodes.push({
      filePath,
      imports,
      importedBy,
      depth: 0, // depth will be recalculated by the server
    })
  }

  return { nodes, edges }
}

/**
 * Build existing positions from active graph sessions.
 */
function buildExistingPositions(): CodeGraphPosition[] {
  const positions: CodeGraphPosition[] = []

  for (const [filePath, sessionId] of getActiveGraphEntries()) {
    const session = sessionStore.getState().sessions.get(sessionId)
    if (!session) continue

    positions.push({
      filePath,
      x: session.position.x,
      y: session.position.y,
      depth: 0,
    })
  }

  return positions
}
