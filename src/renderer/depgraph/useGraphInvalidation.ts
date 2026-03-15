/**
 * Hook that watches for file changes and incrementally updates
 * the dependency graph cache and connectors.
 *
 * When a file in the active graph changes on disk:
 * 1. Invalidate its cache entry
 * 2. Re-parse and resolve its imports
 * 3. Diff against old imports
 * 4. Update connectors (remove stale, add new)
 * 5. If visible → re-layout affected nodes with animation
 * 6. If not visible → silently update cache
 */

import { useEffect } from 'react'
import {
  isInActiveGraph,
  getGraphSessionId,
  invalidateCachedImports,
  setCachedImports,
  diffImports,
  getActiveGraphEntries,
  registerGraphNode,
} from './GraphCache'
import { parseImports } from './importParser'
import { resolveAllImports } from './importResolver'
import { sessionStore, findFileSessionByPath, type FileViewerSession } from '../stores/sessionStore'
import { connectorStore } from '../stores/connectorStore'
import { gridStore } from '../stores/gridStore'

const CONNECTOR_COLOR = '#4A90D9'
const HORIZONTAL_SPACING = 720
const FILE_VIEWER_HEIGHT = 480

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
 * Find the connector between two sessions (by source/target session IDs).
 */
function findConnector(sourceSessionId: string, targetSessionId: string): string | undefined {
  for (const [id, c] of connectorStore.getState().connectors) {
    if (c.sourceId === sourceSessionId && c.targetId === targetSessionId) {
      return id
    }
  }
  return undefined
}

/**
 * Create a file session for a newly discovered import,
 * positioned relative to the parent node.
 */
async function createNodeSession(
  filePath: string,
  parentSessionId: string,
): Promise<FileViewerSession | null> {
  const existing = findFileSessionByPath(filePath)
  if (existing) return existing

  try {
    const result = await window.smokeAPI.fs.readfile(filePath)
    const language = detectLanguage(filePath)
    const parentSession = sessionStore.getState().sessions.get(parentSessionId)
    if (!parentSession) return null

    const { snapToGrid } = gridStore.getState()
    // Place to the right of parent, offset vertically to avoid overlap
    const siblings = countSiblingsAtDepth(parentSession.position.x + HORIZONTAL_SPACING)
    const posX = snapToGrid(parentSession.position.x + HORIZONTAL_SPACING)
    const posY = snapToGrid(parentSession.position.y + siblings * (FILE_VIEWER_HEIGHT + 60))

    const session = sessionStore.getState().createFileSession(
      filePath,
      result.content,
      language,
      { x: posX, y: posY },
    )
    return session
  } catch {
    return null
  }
}

/**
 * Count how many active graph sessions exist at a given x position
 * (used to stack new nodes vertically without overlap).
 */
function countSiblingsAtDepth(x: number): number {
  let count = 0
  const sessions = sessionStore.getState().sessions
  for (const [, entry] of getActiveGraphEntries()) {
    const session = sessions.get(entry)
    if (session && Math.abs(session.position.x - x) < HORIZONTAL_SPACING / 2) {
      count++
    }
  }
  return count
}

/**
 * Process a single file change: invalidate cache, re-parse, diff, update graph.
 */
async function handleFileChanged(
  filePath: string,
  visibleIds: Set<string>,
): Promise<void> {
  if (!isInActiveGraph(filePath)) return

  const sourceSessionId = getGraphSessionId(filePath)
  if (!sourceSessionId) return

  // 1. Invalidate and get old imports
  const oldEntry = invalidateCachedImports(filePath)
  const oldPaths = oldEntry?.resolvedPaths ?? []

  // 2. Re-read, re-parse, re-resolve
  let newContent: string
  try {
    const result = await window.smokeAPI.fs.readfile(filePath)
    newContent = result.content
  } catch {
    // File deleted or unreadable — remove from graph silently
    setCachedImports(filePath, [])
    return
  }

  const language = detectLanguage(filePath)
  const importerDir = getImporterDir(filePath)
  const parsed = parseImports(newContent, language)
  const newPaths = await resolveAllImports(parsed, importerDir, language)

  // 3. Cache new imports
  setCachedImports(filePath, newPaths)

  // 4. Diff
  const { added, removed } = diffImports(oldPaths, newPaths)
  if (added.length === 0 && removed.length === 0) return

  // 5. Remove connectors for removed imports
  for (const removedPath of removed) {
    const targetSessionId = getGraphSessionId(removedPath)
    if (!targetSessionId) continue

    const connectorId = findConnector(sourceSessionId, targetSessionId)
    if (connectorId) {
      connectorStore.getState().removeConnector(connectorId)
    }
  }

  // 6. Add sessions + connectors for new imports
  for (const addedPath of added) {
    let targetSessionId = getGraphSessionId(addedPath)

    if (!targetSessionId) {
      // Create a new file session for the newly imported file
      const newSession = await createNodeSession(addedPath, sourceSessionId)
      if (!newSession) continue
      targetSessionId = newSession.id
      registerGraphNode(addedPath, targetSessionId)

      // Start watching the new file
      window.smokeAPI?.fs.watch(addedPath)
    }

    // Add connector if it doesn't already exist
    if (!findConnector(sourceSessionId, targetSessionId)) {
      connectorStore.getState().addConnector(sourceSessionId, targetSessionId, {
        label: 'imports',
        color: CONNECTOR_COLOR,
      })
    }
  }

  // 7. If source file is visible, animate position adjustments
  if (visibleIds.has(sourceSessionId)) {
    animateLayoutUpdate(sourceSessionId)
  }
}

/**
 * Trigger a smooth position update for nodes connected to the changed file.
 * Applies CSS transition class, adjusts positions, then removes the class.
 */
function animateLayoutUpdate(sessionId: string): void {
  const session = sessionStore.getState().sessions.get(sessionId)
  if (!session) return

  // Find all child nodes (files this session imports) and re-stack them
  const childEntries: Array<{ sessionId: string; filePath: string }> = []
  for (const [filePath, sid] of getActiveGraphEntries()) {
    if (sid === sessionId) continue
    // Check if there's a connector from sessionId to sid
    if (findConnector(sessionId, sid)) {
      childEntries.push({ sessionId: sid, filePath })
    }
  }

  if (childEntries.length === 0) return

  const { snapToGrid } = gridStore.getState()
  const baseX = session.position.x + HORIZONTAL_SPACING
  const centerY = session.position.y + FILE_VIEWER_HEIGHT / 2
  const totalHeight = (childEntries.length - 1) * (FILE_VIEWER_HEIGHT + 60) + FILE_VIEWER_HEIGHT
  const startY = centerY - totalHeight / 2

  childEntries.forEach((entry, idx) => {
    const newY = snapToGrid(startY + idx * (FILE_VIEWER_HEIGHT + 60))
    const newX = snapToGrid(baseX)
    const existing = sessionStore.getState().sessions.get(entry.sessionId)
    if (existing && (existing.position.x !== newX || existing.position.y !== newY)) {
      // Add transition class to the DOM element
      const el = document.querySelector(`[data-session-id="${entry.sessionId}"]`)
      if (el) {
        ;(el as HTMLElement).style.transition = 'transform 300ms ease-out'
        setTimeout(() => {
          ;(el as HTMLElement).style.transition = ''
        }, 350)
      }
      sessionStore.getState().updateSession(entry.sessionId, {
        position: { x: newX, y: newY },
      })
    }
  })
}

/**
 * Hook: subscribe to file-changed events and update the dep graph cache.
 * Call once in Canvas.tsx alongside useFileWatchManager.
 */
export function useGraphInvalidation(visibleIds: Set<string>): void {
  useEffect(() => {
    const unsub = window.smokeAPI?.fs.onFileChanged((event) => {
      handleFileChanged(event.path, visibleIds)
    })
    return unsub
  }, [visibleIds])
}
