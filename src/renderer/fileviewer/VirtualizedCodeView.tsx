import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Extra lines rendered above/below the visible viewport for smooth scrolling */
const OVERSCAN = 30

/** Padding values matching fileviewer.css (--space-md, --space-lg) */
const PAD_Y = 8
const PAD_X = 12

interface VirtualizedCodeViewProps {
  /** Raw source lines (split by \n) */
  lines: string[]
  /** Per-line inner HTML from Shiki (tokens only). null = not yet highlighted */
  lineHtmls: string[] | null
  /** Inline style string from Shiki <pre> (background-color, color) */
  preStyle: string
  /** Parent can set this ref to scroll+highlight a 1-based line number */
  scrollToLineRef?: React.MutableRefObject<((line: number) => void) | null>
}

export default function VirtualizedCodeView({
  lines,
  lineHtmls,
  preStyle,
  scrollToLineRef,
}: VirtualizedCodeViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const lineHeightRef = useRef(15.6) // 13px * 1.2 — remeasured after first paint
  const measuredRef = useRef(false)

  const lineCount = lines.length
  const lh = lineHeightRef.current
  const totalHeight = lineCount * lh + PAD_Y * 2

  // Visible range (in 0-based line indices) with overscan
  const startLine = Math.max(0, Math.floor((scrollTop - PAD_Y) / lh) - OVERSCAN)
  const endLine = Math.min(lineCount, Math.ceil((scrollTop - PAD_Y + viewportHeight) / lh) + OVERSCAN)

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop)
  }, [])

  // Track viewport height via ResizeObserver
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const ro = new ResizeObserver((entries) => {
      setViewportHeight(entries[0].contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Measure actual line height from a rendered line
  useEffect(() => {
    if (measuredRef.current) return
    const el = scrollRef.current
    if (!el) return
    const lineEl = el.querySelector('.line') as HTMLElement | null
    if (lineEl) {
      const h = lineEl.getBoundingClientRect().height
      if (h > 0) {
        lineHeightRef.current = h
        measuredRef.current = true
        // Re-render with the correct measured height
        setScrollTop(el.scrollTop)
      }
    }
  })

  // Expose scrollToLine for Go-to-Line feature
  useEffect(() => {
    if (!scrollToLineRef) return
    scrollToLineRef.current = (lineNum: number) => {
      const el = scrollRef.current
      if (!el) return
      const target = Math.max(1, Math.min(lineNum, lineCount))
      const targetTop = PAD_Y + (target - 1) * lineHeightRef.current
      el.scrollTo({
        top: targetTop - viewportHeight / 2 + lineHeightRef.current / 2,
        behavior: 'smooth',
      })
      // After scroll animation settles, highlight the target line
      setTimeout(() => {
        const lineEl = el.querySelector(`[data-line="${target}"]`) as HTMLElement | null
        if (lineEl) {
          lineEl.classList.add('go-to-line-highlight')
          setTimeout(() => lineEl.classList.remove('go-to-line-highlight'), 1500)
        }
      }, 350)
    }
    return () => {
      if (scrollToLineRef) scrollToLineRef.current = null
    }
  }, [scrollToLineRef, viewportHeight, lineCount])

  // Build the visible line elements
  const visibleContent = useMemo(() => {
    const spans: JSX.Element[] = []
    for (let i = startLine; i < endLine; i++) {
      if (lineHtmls && lineHtmls[i] !== undefined) {
        spans.push(
          <span
            key={i}
            className="line"
            data-line={i + 1}
            dangerouslySetInnerHTML={{ __html: lineHtmls[i] }}
          />,
        )
      } else {
        spans.push(
          <span key={i} className="line" data-line={i + 1}>
            {lines[i]}
          </span>,
        )
      }
    }
    return spans
  }, [startLine, endLine, lines, lineHtmls])

  // Parse the Shiki pre style string into a React style object
  const containerStyle = useMemo(() => {
    const style: Record<string, string> = {}
    if (preStyle) {
      preStyle.split(';').forEach((pair) => {
        const [key, val] = pair.split(':').map((s) => s.trim())
        if (key && val) {
          // Convert CSS property to camelCase
          const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          style[camelKey] = val
        }
      })
    }
    return style
  }, [preStyle])

  return (
    <div
      ref={scrollRef}
      className="file-viewer-highlighted file-viewer-virtualized"
      style={containerStyle}
      onScroll={handleScroll}
    >
      <div
        className="file-viewer-virtual-spacer"
        style={{ height: totalHeight }}
      >
        <pre
          className="file-viewer-virtual-pre"
          style={{ top: PAD_Y + startLine * lh }}
        >
          <code style={{ counterReset: `line ${startLine}` }}>
            {visibleContent}
          </code>
        </pre>
      </div>
    </div>
  )
}
