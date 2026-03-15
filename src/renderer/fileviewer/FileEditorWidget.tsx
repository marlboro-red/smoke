import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
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
}

export default function FileEditorWidget({
  content,
  language,
  onSave,
  onChange,
}: FileEditorWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const themePref = usePreference('theme')
  const themeConfig = getTheme(themePref || 'dark')

  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          onSaveRef.current(view.state.doc.toString())
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
      doc: content,
      extensions: [
        saveKeymap,
        basicSetup,
        ...cmThemeExtensions,
        ...getLanguageExtension(language),
        changeListener,
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: 'var(--font-size-lg)',
          },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono)',
            lineHeight: '1.5',
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

    view.focus()

    return () => {
      view.destroy()
    }
  }, [language, themeConfig.id]) // Only recreate on language or theme change, not content

  return <div ref={containerRef} className="file-editor-container" />
}
