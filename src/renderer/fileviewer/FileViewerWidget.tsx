import { useEffect, useRef, useState } from 'react'
import { codeToHtml } from 'shiki'

interface FileViewerWidgetProps {
  content: string
  language: string
}

export default function FileViewerWidget({
  content,
  language,
}: FileViewerWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    codeToHtml(content, {
      lang: language === 'text' ? 'text' : language,
      theme: 'github-dark',
    })
      .then((html) => {
        if (!cancelled) {
          // Strip newlines between .line spans to prevent double-spacing with display:block
          setHighlightedHtml(html.replace(/\n(?=<span class="line">)/g, ''))
        }
      })
      .catch(() => {
        // Fallback: if the language isn't supported, try plain text
        if (!cancelled) {
          codeToHtml(content, { lang: 'text', theme: 'github-dark' })
            .then((html) => {
              if (!cancelled) setHighlightedHtml(html.replace(/\n(?=<span class="line">)/g, ''))
            })
            .catch(() => {
              if (!cancelled) setHighlightedHtml(null)
            })
        }
      })

    return () => {
      cancelled = true
    }
  }, [content, language])

  const lines = content.split('\n')

  return (
    <div ref={containerRef} className="file-viewer-content">
      {highlightedHtml ? (
        <div
          className="file-viewer-highlighted"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
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
