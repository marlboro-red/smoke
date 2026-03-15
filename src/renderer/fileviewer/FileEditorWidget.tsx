import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { getLanguageExtension } from './codemirrorLanguages'

interface FileEditorWidgetProps {
  content: string
  language: string
  onSave: (content: string) => void
}

export default function FileEditorWidget({
  content,
  language,
  onSave,
}: FileEditorWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

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

    const state = EditorState.create({
      doc: content,
      extensions: [
        saveKeymap,
        basicSetup,
        oneDark,
        ...getLanguageExtension(language),
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
  }, [language]) // Only recreate on language change, not content

  return <div ref={containerRef} className="file-editor-container" />
}
