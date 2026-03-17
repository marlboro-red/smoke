import { useEffect, useMemo, useRef, useState } from 'react'
import { codeToHtml } from 'shiki'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { usePreference } from '../stores/preferencesStore'
import { getTheme } from '../themes/themes'
import VirtualizedCodeView from './VirtualizedCodeView'

/** Files with more lines than this use virtualized rendering */
const VIRTUALIZATION_THRESHOLD = 1000

interface FileViewerWidgetProps {
  content: string
  language: string
  /** Ref for parent to call scrollToLine(lineNum) on the virtualized view */
  scrollToLineRef?: React.MutableRefObject<((line: number) => void) | null>
}

/**
 * Parse Shiki's HTML output into per-line token HTML strings.
 * Returns the <pre> inline style and an array of inner HTML for each .line span.
 */
function parseShikiOutput(html: string): { preStyle: string; lineHtmls: string[] } {
  const styleMatch = html.match(/<pre[^>]*\sstyle="([^"]*)"/)
  const preStyle = styleMatch?.[1] ?? ''

  const parts = html.split('<span class="line">')
  const lineHtmls: string[] = []
  for (let i = 1; i < parts.length; i++) {
    const lastClose = parts[i].lastIndexOf('</span>')
    lineHtmls.push(lastClose >= 0 ? parts[i].substring(0, lastClose) : parts[i])
  }
  return { preStyle, lineHtmls }
}

export default function FileViewerWidget({
  content,
  language,
  scrollToLineRef,
}: FileViewerWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null)
  const themePref = usePreference('theme')
  const shikiTheme = getTheme(themePref || 'dark').shikiTheme

  const isMarkdown = language === 'markdown'
  const lines = useMemo(() => content.split('\n'), [content])
  const isLargeFile = lines.length > VIRTUALIZATION_THRESHOLD

  // Parsed Shiki output for virtualized rendering of large files
  const [parsedShiki, setParsedShiki] = useState<{
    preStyle: string
    lineHtmls: string[]
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    if (isMarkdown) {
      const raw = marked.parse(content, { async: false, gfm: true, breaks: false }) as string
      const html = DOMPurify.sanitize(raw)
      if (!cancelled) {
        setRenderedHtml(html)
        setParsedShiki(null)
      }
    } else {
      // Reset parsed state when content/language changes
      setParsedShiki(null)

      codeToHtml(content, {
        lang: language === 'text' ? 'text' : language,
        theme: shikiTheme,
      })
        .then((html) => {
          if (cancelled) return
          const cleaned = html.replace(/\n(?=<span class="line">)/g, '')
          if (isLargeFile) {
            setParsedShiki(parseShikiOutput(cleaned))
          } else {
            setRenderedHtml(cleaned)
          }
        })
        .catch(() => {
          if (cancelled) return
          codeToHtml(content, { lang: 'text', theme: shikiTheme })
            .then((html) => {
              if (cancelled) return
              const cleaned = html.replace(/\n(?=<span class="line">)/g, '')
              if (isLargeFile) {
                setParsedShiki(parseShikiOutput(cleaned))
              } else {
                setRenderedHtml(cleaned)
              }
            })
            .catch(() => {
              if (!cancelled) {
                setRenderedHtml(null)
                setParsedShiki(null)
              }
            })
        })
    }

    return () => {
      cancelled = true
    }
  }, [content, language, isMarkdown, shikiTheme, isLargeFile])

  // Large file: virtualized rendering
  if (isLargeFile && !isMarkdown) {
    return (
      <div ref={containerRef} className="file-viewer-content">
        <VirtualizedCodeView
          lines={lines}
          lineHtmls={parsedShiki?.lineHtmls ?? null}
          preStyle={parsedShiki?.preStyle ?? ''}
          scrollToLineRef={scrollToLineRef}
        />
      </div>
    )
  }

  // Small file / markdown: existing rendering
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
