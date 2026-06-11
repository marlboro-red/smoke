import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { getLanguageExtension } from './codemirrorLanguages'
import { usePreference } from '../stores/preferencesStore'
import { getTheme } from '../themes/themes'

interface FileEditorWidgetProps {
  content: string
  language: string
  onSave: (content: string) => void
  onChange?: (content: string) => void
  editorViewRef?: React.MutableRefObject<EditorView | null>
}

export default function FileEditorWidget({
  content,
  language,
  onSave,
  onChange,
  editorViewRef,
}: FileEditorWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const contentRef = useRef(content)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const themePref = usePreference('theme')
  const themeConfig = getTheme(themePref || 'dark')

  // Reconcile external content updates (file changed on disk and the watch
  // manager refreshed session.content) into the live editor — but only when
  // the user hasn't modified the doc, so their edits are never clobbered.
  useEffect(() => {
    const view = viewRef.current
    const previous = contentRef.current
    contentRef.current = content
    if (!view) return // editor not created yet — creation uses contentRef
    const doc = view.state.doc.toString()
    if (doc === content || doc !== previous) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    })
  }, [content])

  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current
    let view: EditorView | null = null

    getLanguageExtension(language).then((langExt) => {
      if (!parent.isConnected) return

      const saveKeymap = keymap.of([
        indentWithTab,
        {
          key: 'Mod-s',
          run: (v) => {
            onSaveRef.current(v.state.doc.toString())
            return true
          },
        },
      ])

      const changeListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString())
        }
      })

      const cmThemeExtensions: Extension[] = themeConfig.isDark ? [oneDark] : []

      const state = EditorState.create({
        doc: contentRef.current,
        extensions: [
          saveKeymap,
          basicSetup,
          ...cmThemeExtensions,
          ...langExt,
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

      view = new EditorView({
        state,
        parent,
      })

      viewRef.current = view
      if (editorViewRef) editorViewRef.current = view
      view.focus()
    })

    return () => {
      viewRef.current = null
      if (editorViewRef) editorViewRef.current = null
      if (view) view.destroy()
    }
  }, [language, themeConfig.id]) // Only recreate on language or theme change, not content

  return <div ref={containerRef} className="file-editor-container" />
}
