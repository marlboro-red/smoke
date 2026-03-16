import { useEffect, useRef, useState } from 'react'
import { codeToHtml } from 'shiki'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { usePreference } from '../stores/preferencesStore'
import { getTheme } from '../themes/themes'

interface FileViewerWidgetProps {
  content: string
  language: string
}

export default function FileViewerWidget({
  content,
  language,
}: FileViewerWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null)
  const themePref = usePreference('theme')
  const shikiTheme = getTheme(themePref || 'dark').shikiTheme

  const isMarkdown = language === 'markdown'

  useEffect(() => {
    let cancelled = false

    if (isMarkdown) {
      const raw = marked.parse(content, { async: false, gfm: true, breaks: false }) as string
      const html = DOMPurify.sanitize(raw)
      if (!cancelled) setRenderedHtml(html)
    } else {
      codeToHtml(content, {
        lang: language === 'text' ? 'text' : language,
        theme: shikiTheme,
      })
        .then((html) => {
          if (!cancelled) {
            // Strip newlines between .line spans to prevent double-spacing with display:block
            setRenderedHtml(html.replace(/\n(?=<span class="line">)/g, ''))
          }
        })
        .catch(() => {
          // Fallback: if the language isn't supported, try plain text
          if (!cancelled) {
            codeToHtml(content, { lang: 'text', theme: shikiTheme })
              .then((html) => {
                if (!cancelled) setRenderedHtml(html.replace(/\n(?=<span class="line">)/g, ''))
              })
              .catch(() => {
                if (!cancelled) setRenderedHtml(null)
              })
          }
        })
    }

    return () => {
      cancelled = true
    }
  }, [content, language, isMarkdown, shikiTheme])

  const lines = content.split('\n')

  return (
    <div ref={containerRef} className="file-viewer-content">
      {isMarkdown && renderedHtml ? (
        <div
          className="file-viewer-markdown"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : renderedHtml ? (
        <div
          className="file-viewer-highlighted"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <pre className="file-viewer-plaintext">
          <code>
            {lines.map((line, i) => (
              <span key={i} className="line">
                {line}
                {i < lines.length - 1 ? '\n' : ''}
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  )
}
