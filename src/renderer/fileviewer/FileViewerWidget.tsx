import { useEffect, useRef, useState } from 'react'
import { codeToHtml } from 'shiki'
import { marked } from 'marked'

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

  const isMarkdown = language === 'markdown'

  useEffect(() => {
    let cancelled = false

    if (isMarkdown) {
      const html = marked.parse(content, { async: false, gfm: true, breaks: false }) as string
      if (!cancelled) setRenderedHtml(html)
    } else {
      codeToHtml(content, {
        lang: language === 'text' ? 'text' : language,
        theme: 'github-dark',
      })
        .then((html) => {
          if (!cancelled) setRenderedHtml(html)
        })
        .catch(() => {
          if (!cancelled) {
            codeToHtml(content, { lang: 'text', theme: 'github-dark' })
              .then((html) => {
                if (!cancelled) setRenderedHtml(html)
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
  }, [content, language, isMarkdown])

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
          <code>{content}</code>
        </pre>
      )}
    </div>
  )
}
