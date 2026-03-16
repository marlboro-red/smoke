import { sessionStore, type FileViewerSession, type SourceRef } from '../stores/sessionStore'
import { connectorStore } from '../stores/connectorStore'
import { gridStore } from '../stores/gridStore'
import { snap } from '../window/useSnapping'
import { preferencesStore } from '../stores/preferencesStore'
import { addToast } from '../stores/toastStore'

const NOTE_GAP = 40
const NOTE_WIDTH = 320
const NOTE_HEIGHT = 240

/**
 * Detect which .line elements in the file viewer body intersect with the
 * current selection, returning 1-based line numbers.
 */
function getLineRange(sessionElement: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const viewerBody = sessionElement.querySelector('.file-viewer-body')
  if (!viewerBody) return null

  const lineElements = viewerBody.querySelectorAll('.line')
  if (lineElements.length === 0) return null

  let startLine = -1
  let endLine = -1

  for (let i = 0; i < lineElements.length; i++) {
    if (range.intersectsNode(lineElements[i])) {
      if (startLine === -1) startLine = i + 1
      endLine = i + 1
    }
  }

  return startLine > 0 ? { start: startLine, end: endLine } : null
}

/**
 * Build a display string for the source reference, e.g. "src/main/index.ts:42-58"
 */
function formatSourceLabel(filePath: string, lineStart?: number, lineEnd?: number): string {
  const { launchCwd } = preferencesStore.getState()
  let display = filePath
  if (launchCwd && filePath.startsWith(launchCwd + '/')) {
    display = filePath.slice(launchCwd.length + 1)
  }
  if (lineStart != null && lineEnd != null) {
    display += lineStart === lineEnd ? `:${lineStart}` : `:${lineStart}-${lineEnd}`
  }
  return display
}

/**
 * Extract selected text from the focused session and create a linked note on the canvas.
 */
export function extractSelectionToNote(): void {
  const state = sessionStore.getState()
  const { focusedId } = state
  if (!focusedId) {
    addToast('No session focused', 'error')
    return
  }

  const sourceSession = state.sessions.get(focusedId)
  if (!sourceSession) return

  const selectedText = window.getSelection()?.toString()?.trim()
  if (!selectedText) {
    addToast('No text selected', 'error')
    return
  }

  // Detect line range for file viewer sessions
  let lineRange: { start: number; end: number } | null = null
  let filePath: string | undefined

  if (sourceSession.type === 'file') {
    const fileSession = sourceSession as FileViewerSession
    filePath = fileSession.filePath

    const sessionEl = document.querySelector(`[data-session-id="${focusedId}"]`)
    if (sessionEl) {
      lineRange = getLineRange(sessionEl as HTMLElement)
    }
  }

  // Build source reference
  const sourceRef: SourceRef = {
    sourceSessionId: focusedId,
    filePath,
    lineStart: lineRange?.start,
    lineEnd: lineRange?.end,
  }

  // Build note content: source link label + newline + selected text
  const sourceLabel = filePath
    ? formatSourceLabel(filePath, lineRange?.start, lineRange?.end)
    : sourceSession.title
  const noteContent = `[${sourceLabel}]\n\n${selectedText}`

  // Position the note to the right of the source session
  const gs = gridStore.getState().gridSize
  const noteX = snap(sourceSession.position.x + sourceSession.size.width + NOTE_GAP, gs)
  const noteY = snap(sourceSession.position.y, gs)

  // Create the note
  const note = state.createNoteSession(
    { x: noteX, y: noteY },
    'blue'
  )

  // Update with content and source ref
  sessionStore.getState().updateSession(note.id, {
    content: noteContent,
    sourceRef,
    title: sourceLabel,
    size: { ...note.size, width: NOTE_WIDTH, height: NOTE_HEIGHT },
  })

  // Add a connector from source to note
  connectorStore.getState().addConnector(focusedId, note.id, {
    label: 'extract',
    color: 'var(--accent-muted, #546a90)',
  })

  // Focus the new note
  sessionStore.getState().focusSession(note.id)
  sessionStore.getState().bringToFront(note.id)

  // Clear the selection
  window.getSelection()?.removeAllRanges()

  addToast(`Extracted to note: ${sourceLabel}`, 'success')
}

export { formatSourceLabel }
