import React, { useCallback, useRef, useEffect, useState } from 'react'
import { codeToHtml } from '../shiki/highlighter'
import { getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  useSelectedIds,
  type NoteSession,
} from '../stores/sessionStore'
import { useFocusModeActiveIds } from '../stores/focusModeStore'
import { usePreference } from '../stores/preferencesStore'
import { getTheme } from '../themes/themes'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from '../fileviewer/useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import NoteColorPicker, { resolveNoteColors } from './NoteColorPicker'
import SourceRefLink from './SourceRefLink'
import '../styles/note.css'

interface NoteWindowProps {
  session: NoteSession
  zoom: () => number
  gridSize: number
}

/**
 * Extract the code portion from note content by stripping the source label header.
 * Note content format is: "[source/label]\n\n<code>"
 */
function extractCodeContent(content: string): string {
  const match = content.match(/^\[.*\]\n\n/)
  return match ? content.slice(match[0].length) : content
}

export default React.memo(function NoteWindow({
  session,
  zoom,
  gridSize,
}: NoteWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const selectedIds = useSelectedIds()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  const focusModeActiveIds = useFocusModeActiveIds()
  const themePref = usePreference('theme')
  const shikiTheme = getTheme(themePref || 'dark').shikiTheme

  const hasHighlighting = !!session.language && session.language !== 'text' && session.language !== 'markdown'

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id
  const isSelected = selectedIds.has(session.id)
  const isDimmedByFocusMode = focusModeActiveIds !== null && !focusModeActiveIds.has(session.id)

  const { onDragStart } = useWindowDrag({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const { onResizeStart } = useFileViewerResize({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const isMod = e.metaKey || e.ctrlKey || e.shiftKey
    if (isMod) {
      e.stopPropagation()
      sessionStore.getState().toggleSelectSession(session.id)
      return
    }
    if (selectedIds.has(session.id) && selectedIds.size > 1) {
      sessionStore.getState().bringToFront(session.id)
      sessionStore.getState().focusSession(session.id)
      return
    }
    sessionStore.getState().clearSelection()
    sessionStore.getState().bringToFront(session.id)
    sessionStore.getState().focusSession(session.id)
  }, [session.id, selectedIds])

  const handleTitleChange = useCallback(
    (title: string) => {
      sessionStore.getState().updateSession(session.id, { title })
    },
    [session.id]
  )

  const handleClose = useCallback(() => {
    closeSession(session.id)
  }, [session.id])

  const handleToggleLock = useCallback(() => {
    sessionStore.getState().toggleLock(session.id)
  }, [session.id])

  const handleTogglePin = useCallback(() => {
    if (!session.isPinned) {
      const pan = getCurrentPan()
      const z = getCurrentZoom()
      sessionStore.getState().togglePin(session.id, {
        x: session.position.x * z + pan.x,
        y: session.position.y * z + pan.y,
      })
    } else {
      sessionStore.getState().togglePin(session.id)
    }
  }, [session.id, session.isPinned, session.position.x, session.position.y])

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      sessionStore.getState().updateSession(session.id, { content: e.target.value })
    },
    [session.id]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const textarea = e.currentTarget
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const value = textarea.value
        const newValue = value.substring(0, start) + '\t' + value.substring(end)
        // Update via store (source of truth) and restore cursor
        sessionStore.getState().updateSession(session.id, { content: newValue })
        // Must defer cursor restore since React will re-render the textarea
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1
        })
      }
    },
    [session.id]
  )

  const handleColorChange = useCallback(
    (color: string) => {
      sessionStore.getState().updateSession(session.id, { color })
    },
    [session.id]
  )

  // Focus textarea when window is focused (only when editing or no highlighting)
  useEffect(() => {
    if (isFocused && textareaRef.current && (!hasHighlighting || editing)) {
      textareaRef.current.focus()
    }
  }, [isFocused, editing, hasHighlighting])

  // Generate syntax-highlighted HTML when language is present
  useEffect(() => {
    if (!hasHighlighting) {
      setHighlightedHtml(null)
      return
    }
    let cancelled = false
    const code = extractCodeContent(session.content)
    codeToHtml(code, {
      lang: session.language!,
      theme: shikiTheme,
    })
      .then((html) => {
        if (!cancelled) setHighlightedHtml(html)
      })
      .catch(() => {
        // Fallback to plain text if language not supported
        codeToHtml(code, { lang: 'text', theme: shikiTheme })
          .then((html) => {
            if (!cancelled) setHighlightedHtml(html)
          })
          .catch(() => {
            if (!cancelled) setHighlightedHtml(null)
          })
      })
    return () => { cancelled = true }
  }, [session.content, session.language, hasHighlighting, shikiTheme])

  // Exit edit mode when note loses focus
  useEffect(() => {
    if (!isFocused && editing) setEditing(false)
  }, [isFocused, editing])

  const handleToggleEdit = useCallback(() => {
    setEditing((prev) => !prev)
  }, [])

  const colors = resolveNoteColors(session.color)

  const classNames = [
    'terminal-window',
    'note-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
    isSelected && 'multi-selected',
    isDimmedByFocusMode && 'focus-mode-dimmed',
    session.locked && 'locked',
    session.isPinned && 'pinned',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classNames}
      data-session-id={session.id}
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height,
        zIndex: session.zIndex,
        background: colors.bg,
        borderColor: isFocused ? undefined : colors.border,
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status="running"
        isLocked={session.locked}
        isPinned={session.isPinned}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
        onToggleLock={handleToggleLock}
        onTogglePin={handleTogglePin}
      >
        <NoteColorPicker color={session.color} onChange={handleColorChange} />
      </WindowChrome>
      <div
        className="note-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        {session.sourceRef && (
          <div className="note-source-bar">
            <SourceRefLink sourceRef={session.sourceRef} />
            {hasHighlighting && (
              <button
                className="note-edit-toggle"
                onClick={handleToggleEdit}
                title={editing ? 'View highlighted' : 'Edit'}
              >
                {editing ? '✓' : '✎'}
              </button>
            )}
          </div>
        )}
        {hasHighlighting && !editing && highlightedHtml ? (
          <div
            className="note-highlighted"
            onDoubleClick={handleToggleEdit}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={session.content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a note..."
            spellCheck={false}
          />
        )}
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
})
