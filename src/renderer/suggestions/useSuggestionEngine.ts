import { useEffect, useRef } from 'react'
import { sessionStore, useFocusedId } from '../stores/sessionStore'
import type { FileViewerSession } from '../stores/sessionStore'
import { suggestionStore, type FileSuggestion } from '../stores/suggestionStore'
import { preferencesStore } from '../stores/preferencesStore'

const DEBOUNCE_MS = 800
const MAX_SUGGESTIONS = 5

/** Generate a stable ID for a suggestion based on file path */
function suggestionId(filePath: string): string {
  return `ghost-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`
}

/**
 * Compute positions for ghost suggestions around the source session.
 * Places them in a fan pattern to the right of the focused session.
 */
function computeGhostPositions(
  sourcePosition: { x: number; y: number },
  sourceSize: { width: number; height: number },
  count: number
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  const GAP_X = 80
  const START_X = sourcePosition.x + sourceSize.width + GAP_X
  const CENTER_Y = sourcePosition.y + sourceSize.height / 2
  const SPACING_Y = 100

  // Center the suggestions vertically around the source
  const totalHeight = (count - 1) * SPACING_Y
  const startY = CENTER_Y - totalHeight / 2

  for (let i = 0; i < count; i++) {
    positions.push({
      x: START_X + (i % 2 === 0 ? 0 : 40), // slight stagger
      y: startY + i * SPACING_Y,
    })
  }
  return positions
}

/**
 * Get all file paths currently open on the canvas.
 */
function getOpenFilePaths(): Set<string> {
  const sessions = sessionStore.getState().sessions
  const paths = new Set<string>()
  for (const session of sessions.values()) {
    if (session.type === 'file') {
      paths.add((session as FileViewerSession).filePath)
    }
  }
  return paths
}

/**
 * Fetches related files for a given file path using the import graph
 * and relevance scorer, then returns suggestion candidates.
 */
async function fetchRelatedFiles(filePath: string): Promise<FileSuggestion[]> {
  const { launchCwd } = preferencesStore.getState()
  const projectRoot = launchCwd
  if (!projectRoot) return []

  const openPaths = getOpenFilePaths()
  const candidates: Array<{
    filePath: string
    score: number
    reason: FileSuggestion['reason']
  }> = []
  const seen = new Set<string>()

  // 1. Get direct imports
  try {
    const imports = await window.smokeAPI.codegraph.getImports(filePath)
    for (const imp of imports) {
      if (imp.specifier.startsWith('/') || imp.specifier.startsWith('.')) {
        // Resolve relative import
        const resolved = await window.smokeAPI.codegraph.resolveImport(
          imp.specifier,
          filePath,
          projectRoot
        )
        if (resolved && !openPaths.has(resolved) && !seen.has(resolved)) {
          seen.add(resolved)
          candidates.push({ filePath: resolved, score: 0.9, reason: 'import' })
        }
      }
    }
  } catch {
    // Import parsing may fail for non-JS files — that's okay
  }

  // 2. Get reverse dependents
  try {
    const dependents = await window.smokeAPI.codegraph.getDependents(filePath, projectRoot)
    for (const dep of dependents) {
      if (!openPaths.has(dep) && !seen.has(dep)) {
        seen.add(dep)
        candidates.push({ filePath: dep, score: 0.7, reason: 'dependent' })
      }
    }
  } catch {
    // May fail — that's okay
  }

  // 3. If we don't have enough from the graph, use relevance scoring
  if (candidates.length < MAX_SUGGESTIONS) {
    try {
      const baseName = filePath.split('/').pop() || filePath
      const result = await window.smokeAPI.relevance.score(
        `Files related to ${baseName}`,
        [], // empty means it will use the search index
        projectRoot,
        [filePath],
        MAX_SUGGESTIONS * 2
      )
      if (result?.rankedFiles) {
        for (const scored of result.rankedFiles) {
          if (!openPaths.has(scored.filePath) && !seen.has(scored.filePath)) {
            seen.add(scored.filePath)
            // Normalize score to 0-1 range (max raw score ~25)
            const normalizedScore = Math.min(scored.score / 15, 1)
            candidates.push({
              filePath: scored.filePath,
              score: normalizedScore * 0.6, // weight down vs graph-based
              reason: 'keyword',
            })
          }
        }
      }
    } catch {
      // Scoring may fail — that's okay
    }
  }

  // Sort by score descending, take top N
  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, MAX_SUGGESTIONS)

  // Build display names
  return top.map((c) => {
    let displayName: string
    const pRoot = projectRoot
    if (pRoot && c.filePath.startsWith(pRoot + '/')) {
      displayName = c.filePath.slice(pRoot.length + 1)
    } else {
      displayName = c.filePath.split('/').pop() || c.filePath
    }
    return {
      id: suggestionId(c.filePath),
      filePath: c.filePath,
      displayName,
      relevanceScore: c.score,
      reason: c.reason,
      position: { x: 0, y: 0 }, // will be set by position computation
    }
  })
}

/**
 * Hook that monitors the focused session and provides related file
 * suggestions as ghost elements on the canvas.
 */
export function useSuggestionEngine(): void {
  const focusedId = useFocusedId()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFilePath = useRef<string | null>(null)

  useEffect(() => {
    // Clean up any pending fetch
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    const { enabled } = suggestionStore.getState()
    if (!enabled) return

    // If nothing is focused or non-file focused, clear suggestions
    if (!focusedId) {
      // Don't clear immediately — let suggestions linger briefly
      debounceRef.current = setTimeout(() => {
        suggestionStore.getState().clearSuggestions()
        lastFilePath.current = null
      }, 2000)
      return
    }

    const session = sessionStore.getState().sessions.get(focusedId)
    if (!session || session.type !== 'file') {
      debounceRef.current = setTimeout(() => {
        suggestionStore.getState().clearSuggestions()
        lastFilePath.current = null
      }, 2000)
      return
    }

    const fileSession = session as FileViewerSession
    const filePath = fileSession.filePath

    // Don't re-fetch if same file
    if (filePath === lastFilePath.current) return
    lastFilePath.current = filePath

    // Debounce the fetch
    debounceRef.current = setTimeout(async () => {
      suggestionStore.getState().setLoading(true)

      try {
        const suggestions = await fetchRelatedFiles(filePath)

        // Compute positions relative to the source session
        const positions = computeGhostPositions(
          fileSession.position,
          { width: fileSession.size.width, height: fileSession.size.height },
          suggestions.length
        )

        const positioned = suggestions.map((s, i) => ({
          ...s,
          position: positions[i] || { x: 0, y: 0 },
        }))

        // Only update if the focused file hasn't changed since we started
        if (lastFilePath.current === filePath) {
          suggestionStore.getState().setSuggestions(positioned, filePath)
        }
      } catch {
        // Silently fail — suggestions are non-critical
      } finally {
        suggestionStore.getState().setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [focusedId])
}
