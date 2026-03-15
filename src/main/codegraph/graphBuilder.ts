/**
 * Graph builder: BFS import crawl from a focus file (smoke-mib.6).
 *
 * Given a starting file and depth limit, builds a CodeGraph by:
 * 1. Parsing imports (first 4KB)
 * 2. Resolving to absolute paths via FilenameIndex
 * 3. Adding nodes and edges
 * 4. Recursively processing each imported file (BFS)
 *
 * Caches parsed results per file. Runs in main process.
 */

import * as fs from 'fs/promises'
import { CodeGraph } from './CodeGraph'
import { parseImports, detectLanguage } from './importParser'
import { resolveAllImports, loadPathAliases, type PathAliases } from './importResolver'
import { FilenameIndex } from './FilenameIndex'

const DEFAULT_MAX_DEPTH = 3
const FILE_READ_LIMIT = 4096 // Only read first 4KB for import extraction

/** Singleton index — built once per project, reused across requests. */
let filenameIndex: FilenameIndex | null = null
let cachedAliases: PathAliases = {}
let indexedRoot: string = ''

/** Parse cache: filePath → parsed content (avoids re-reading files). */
const parseCache = new Map<string, string>()

/**
 * Ensure the filename index is built for the given project root.
 * Reuses cached index if the root hasn't changed.
 */
export async function ensureIndex(projectRoot: string): Promise<FilenameIndex> {
  if (filenameIndex && indexedRoot === projectRoot) {
    return filenameIndex
  }

  filenameIndex = new FilenameIndex()
  await filenameIndex.build(projectRoot)
  cachedAliases = await loadPathAliases(projectRoot)
  indexedRoot = projectRoot
  parseCache.clear()

  return filenameIndex
}

/** Get current index stats (for debugging/UI). */
export function getIndexStats(): { root: string; fileCount: number } | null {
  if (!filenameIndex) return null
  return { root: indexedRoot, fileCount: filenameIndex.size }
}

/** Invalidate the index (e.g., on project switch). */
export function invalidateIndex(): void {
  filenameIndex = null
  indexedRoot = ''
  cachedAliases = {}
  parseCache.clear()
}

export interface GraphBuildRequest {
  filePath: string
  projectRoot: string
  maxDepth?: number
}

export interface GraphBuildResult {
  graph: ReturnType<CodeGraph['toJSON']>
  rootPath: string
  fileCount: number
  edgeCount: number
}

/**
 * Build a code graph starting from a focus file.
 * BFS traversal ensures breadth-first expansion.
 */
export async function buildCodeGraph(request: GraphBuildRequest): Promise<GraphBuildResult> {
  const { filePath, projectRoot, maxDepth = DEFAULT_MAX_DEPTH } = request

  const index = await ensureIndex(projectRoot)
  const graph = new CodeGraph()

  // BFS queue
  const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }]

  // Add root node
  graph.addNode(filePath, 0)

  while (queue.length > 0) {
    const { path: currentPath, depth } = queue.shift()!

    if (depth >= maxDepth) continue

    // Read file content (cached)
    const content = await readFileContent(currentPath)
    if (!content) continue

    const language = detectLanguage(currentPath)
    const parsed = parseImports(content, language)
    const resolved = resolveAllImports(parsed, currentPath, language, index, cachedAliases)

    for (const imp of resolved) {
      if (!imp.resolvedPath) continue

      const childDepth = depth + 1

      // Add node if new
      const isNew = !graph.nodes.has(imp.resolvedPath)
      if (isNew) {
        graph.addNode(imp.resolvedPath, childDepth)
      }

      // Add edge (always, even if node existed — may have new edge)
      const edgeType = parsed.find((p) => p.specifier === imp.specifier)?.type ?? 'import'
      graph.addEdge(currentPath, imp.resolvedPath, edgeType)

      // Only traverse new nodes
      if (isNew && childDepth < maxDepth) {
        queue.push({ path: imp.resolvedPath, depth: childDepth })
      }
    }
  }

  return {
    graph: graph.toJSON(),
    rootPath: filePath,
    fileCount: graph.nodes.size,
    edgeCount: graph.edges.length,
  }
}

/**
 * Expand an existing graph from a new focus node.
 * Used when the user clicks "expand" on a leaf node.
 */
export async function expandCodeGraph(
  existingGraph: ReturnType<CodeGraph['toJSON']>,
  expandPath: string,
  projectRoot: string,
  maxDepth = 2
): Promise<GraphBuildResult> {
  const index = await ensureIndex(projectRoot)
  const graph = CodeGraph.fromJSON(existingGraph)

  const queue: Array<{ path: string; depth: number }> = [{ path: expandPath, depth: 0 }]

  while (queue.length > 0) {
    const { path: currentPath, depth } = queue.shift()!
    if (depth >= maxDepth) continue

    const content = await readFileContent(currentPath)
    if (!content) continue

    const language = detectLanguage(currentPath)
    const parsed = parseImports(content, language)
    const resolved = resolveAllImports(parsed, currentPath, language, index, cachedAliases)

    for (const imp of resolved) {
      if (!imp.resolvedPath) continue

      const childDepth = depth + 1
      const isNew = !graph.nodes.has(imp.resolvedPath)

      if (isNew) {
        const existingNode = graph.nodes.get(expandPath)
        const baseDepth = existingNode?.depth ?? 0
        graph.addNode(imp.resolvedPath, baseDepth + childDepth)
      }

      const edgeType = parsed.find((p) => p.specifier === imp.specifier)?.type ?? 'import'
      graph.addEdge(currentPath, imp.resolvedPath, edgeType)

      if (isNew && childDepth < maxDepth) {
        queue.push({ path: imp.resolvedPath, depth: childDepth })
      }
    }
  }

  return {
    graph: graph.toJSON(),
    rootPath: expandPath,
    fileCount: graph.nodes.size,
    edgeCount: graph.edges.length,
  }
}

/** Read file content with caching, limited to IMPORT_SCAN_LIMIT bytes. */
async function readFileContent(filePath: string): Promise<string | null> {
  const cached = parseCache.get(filePath)
  if (cached !== undefined) return cached

  try {
    const fd = await fs.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(FILE_READ_LIMIT)
      const { bytesRead } = await fd.read(buf, 0, FILE_READ_LIMIT, 0)
      const content = buf.toString('utf-8', 0, bytesRead)
      parseCache.set(filePath, content)
      return content
    } finally {
      await fd.close()
    }
  } catch {
    parseCache.set(filePath, '')
    return null
  }
}
