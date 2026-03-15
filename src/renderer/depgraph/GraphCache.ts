/**
 * Cache for parsed + resolved imports per file, with active graph tracking.
 *
 * Stores resolved import paths keyed by file path. When the file watcher
 * detects a change, only that file's cache entry is invalidated.
 * The active graph maps file paths to session IDs so we know which
 * files are currently visualized as dependency nodes.
 */

export interface CachedImports {
  resolvedPaths: string[]
}

/** filePath → cached resolved imports */
const importCache = new Map<string, CachedImports>()

/** filePath → sessionId for files in the active dep graph */
const activeGraph = new Map<string, string>()

/** Files whose imports have been expanded (shown on canvas) */
const expandedNodes = new Set<string>()

// ── Cache operations ──

export function getCachedImports(filePath: string): CachedImports | undefined {
  return importCache.get(filePath)
}

export function setCachedImports(filePath: string, resolvedPaths: string[]): void {
  importCache.set(filePath, { resolvedPaths })
}

export function invalidateCachedImports(filePath: string): CachedImports | undefined {
  const old = importCache.get(filePath)
  importCache.delete(filePath)
  return old
}

export function clearImportCache(): void {
  importCache.clear()
}

// ── Active graph operations ──

export function registerGraphNode(filePath: string, sessionId: string): void {
  activeGraph.set(filePath, sessionId)
}

export function unregisterGraphNode(filePath: string): void {
  activeGraph.delete(filePath)
}

export function getGraphSessionId(filePath: string): string | undefined {
  return activeGraph.get(filePath)
}

export function isInActiveGraph(filePath: string): boolean {
  return activeGraph.has(filePath)
}

export function getActiveGraphEntries(): ReadonlyMap<string, string> {
  return activeGraph
}

export function clearActiveGraph(): void {
  activeGraph.clear()
  expandedNodes.clear()
}

// ── Expanded node operations ──

export function markNodeExpanded(filePath: string): void {
  expandedNodes.add(filePath)
}

export function isNodeExpanded(filePath: string): boolean {
  return expandedNodes.has(filePath)
}

// ── Diff utility ──

export interface ImportDiff {
  added: string[]
  removed: string[]
}

export function diffImports(oldPaths: string[], newPaths: string[]): ImportDiff {
  const oldSet = new Set(oldPaths)
  const newSet = new Set(newPaths)

  const added: string[] = []
  const removed: string[] = []

  for (const p of newPaths) {
    if (!oldSet.has(p)) added.push(p)
  }
  for (const p of oldPaths) {
    if (!newSet.has(p)) removed.push(p)
  }

  return { added, removed }
}
