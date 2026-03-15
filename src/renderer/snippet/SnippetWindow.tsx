import { useCallback, useRef, useEffect } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { getLanguageExtension } from '../fileviewer/codemirrorLanguages'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  type SnippetSession,
} from '../stores/sessionStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from '../fileviewer/useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import { usePreference } from '../stores/preferencesStore'
import { getTheme } from '../themes/themes'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import '../styles/snippet.css'

const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'python',
  'html',
  'css',
  'json',
  'markdown',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'sql',
  'yaml',
  'xml',
  'php',
  'text',
]

interface SnippetWindowProps {
  session: SnippetSession
  zoom: () => number
  gridSize: number
}

export default function SnippetWindow({
  session,
  zoom,
  gridSize,
}: SnippetWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const contentRef = useRef(session.content)
  const themePref = usePreference('theme')
  const themeConfig = getTheme(themePref || 'dark')

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id

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

  const handlePointerDown = useCallback(() => {
    sessionStore.getState().bringToFront(session.id)
    sessionStore.getState().focusSession(session.id)
  }, [session.id])

  const handleTitleChange = useCallback(
    (title: string) => {
      sessionStore.getState().updateSession(session.id, { title })
    },
    [session.id]
  )

  const handleClose = useCallback(() => {
    closeSession(session.id)
  }, [session.id])

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      sessionStore.getState().updateSession(session.id, { language: e.target.value })
    },
    [session.id]
  )

  // Keep contentRef in sync for the change listener closure
  contentRef.current = session.content

  useEffect(() => {
    if (!containerRef.current) return

    const changeListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString()
        sessionStore.getState().updateSession(session.id, { content: newContent })
      }
    })

    const cmThemeExtensions: Extension[] = themeConfig.isDark ? [oneDark] : []

    const state = EditorState.create({
      doc: session.content,
      extensions: [
        keymap.of([]),
        basicSetup,
        ...cmThemeExtensions,
        ...getLanguageExtension(session.language),
        changeListener,
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: 'var(--font-size-lg)',
          },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono)',
            lineHeight: 'var(--line-height-code)',
          },
          '.cm-content': {
            caretColor: 'var(--text-primary)',
          },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [session.language, themeConfig.id]) // Recreate on language or theme change

  // Focus editor when window is focused
  useEffect(() => {
    if (isFocused && viewRef.current) {
      viewRef.current.focus()
    }
  }, [isFocused])

  const classNames = [
    'terminal-window',
    'snippet-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classNames}
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height,
        zIndex: session.zIndex,
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status="running"
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
      >
        <select
          className="snippet-lang-select"
          value={session.language}
          onChange={handleLanguageChange}
          onClick={(e) => e.stopPropagation()}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </WindowChrome>
      <div
        className="snippet-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <div ref={containerRef} className="snippet-editor-container" />
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
