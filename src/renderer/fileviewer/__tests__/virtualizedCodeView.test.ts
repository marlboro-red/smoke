// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

/**
 * Tests for the Shiki HTML parser used by FileViewerWidget to feed
 * per-line token HTML into VirtualizedCodeView.
 */

// Inline the parser so we can test it without importing the full component
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

describe('parseShikiOutput', () => {
  it('extracts pre style from Shiki HTML', () => {
    const html =
      '<pre class="shiki one-dark-pro" style="background-color:#282c34;color:#abb2bf" tabindex="0"><code>' +
      '<span class="line"><span style="color:#C678DD">const</span></span>' +
      '</code></pre>'
    const { preStyle } = parseShikiOutput(html)
    expect(preStyle).toBe('background-color:#282c34;color:#abb2bf')
  })

  it('extracts per-line inner HTML from single-token lines', () => {
    const html =
      '<pre class="shiki" style="background-color:#1e1e1e;color:#d4d4d4"><code>' +
      '<span class="line"><span style="color:#C678DD">const</span></span>' +
      '<span class="line"><span style="color:#ABB2BF">x = 1</span></span>' +
      '</code></pre>'
    const { lineHtmls } = parseShikiOutput(html)
    expect(lineHtmls).toHaveLength(2)
    expect(lineHtmls[0]).toBe('<span style="color:#C678DD">const</span>')
    expect(lineHtmls[1]).toBe('<span style="color:#ABB2BF">x = 1</span>')
  })

  it('extracts per-line inner HTML from multi-token lines', () => {
    const html =
      '<pre class="shiki" style="background-color:#000"><code>' +
      '<span class="line"><span style="color:#C678DD">const</span><span style="color:#ABB2BF"> x = </span><span style="color:#D19A66">1</span></span>' +
      '</code></pre>'
    const { lineHtmls } = parseShikiOutput(html)
    expect(lineHtmls).toHaveLength(1)
    expect(lineHtmls[0]).toBe(
      '<span style="color:#C678DD">const</span><span style="color:#ABB2BF"> x = </span><span style="color:#D19A66">1</span>'
    )
  })

  it('handles empty lines', () => {
    const html =
      '<pre class="shiki" style=""><code>' +
      '<span class="line"><span style="color:#C678DD">a</span></span>' +
      '<span class="line"></span>' +
      '<span class="line"><span style="color:#C678DD">b</span></span>' +
      '</code></pre>'
    const { lineHtmls } = parseShikiOutput(html)
    expect(lineHtmls).toHaveLength(3)
    expect(lineHtmls[0]).toBe('<span style="color:#C678DD">a</span>')
    expect(lineHtmls[1]).toBe('')
    expect(lineHtmls[2]).toBe('<span style="color:#C678DD">b</span>')
  })

  it('returns empty preStyle when style attribute is missing', () => {
    const html =
      '<pre class="shiki"><code>' +
      '<span class="line">hello</span>' +
      '</code></pre>'
    const { preStyle } = parseShikiOutput(html)
    expect(preStyle).toBe('')
  })

  it('handles many lines (simulating large files)', () => {
    const lineCount = 2000
    const lineSpans = Array.from(
      { length: lineCount },
      (_, i) => `<span class="line"><span style="color:#fff">line ${i}</span></span>`
    ).join('')
    const html = `<pre class="shiki" style="background-color:#000"><code>${lineSpans}</code></pre>`
    const { lineHtmls } = parseShikiOutput(html)
    expect(lineHtmls).toHaveLength(lineCount)
    expect(lineHtmls[0]).toBe('<span style="color:#fff">line 0</span>')
    expect(lineHtmls[lineCount - 1]).toBe(`<span style="color:#fff">line ${lineCount - 1}</span>`)
  })
})

describe('VirtualizedCodeView rendering logic', () => {
  // Test the core virtual scrolling math used by VirtualizedCodeView
  const OVERSCAN = 30
  const PAD_Y = 8

  function computeVisibleRange(
    scrollTop: number,
    viewportHeight: number,
    lineHeight: number,
    lineCount: number
  ): { startLine: number; endLine: number } {
    const startLine = Math.max(0, Math.floor((scrollTop - PAD_Y) / lineHeight) - OVERSCAN)
    const endLine = Math.min(lineCount, Math.ceil((scrollTop - PAD_Y + viewportHeight) / lineHeight) + OVERSCAN)
    return { startLine, endLine }
  }

  it('renders first visible lines when scrolled to top', () => {
    const { startLine, endLine } = computeVisibleRange(0, 600, 15.6, 15000)
    expect(startLine).toBe(0)
    // Should show viewport lines + overscan, much less than total
    expect(endLine).toBeLessThan(100)
    expect(endLine).toBeGreaterThan(30)
  })

  it('renders middle section when scrolled to middle', () => {
    const lineHeight = 15.6
    const lineCount = 15000
    const scrollTop = 7500 * lineHeight // scroll to line 7500
    const { startLine, endLine } = computeVisibleRange(scrollTop, 600, lineHeight, lineCount)
    // Should be centered around line 7500 with overscan
    expect(startLine).toBeGreaterThan(7400)
    expect(startLine).toBeLessThan(7500)
    expect(endLine).toBeGreaterThan(7500)
    expect(endLine).toBeLessThan(7600)
    // Should render far fewer lines than total
    expect(endLine - startLine).toBeLessThan(200)
  })

  it('clamps to line count at the bottom', () => {
    const lineHeight = 15.6
    const lineCount = 15000
    const scrollTop = lineCount * lineHeight // scrolled past the bottom
    const { endLine } = computeVisibleRange(scrollTop, 600, lineHeight, lineCount)
    expect(endLine).toBe(lineCount)
  })

  it('never returns negative startLine', () => {
    const { startLine } = computeVisibleRange(0, 600, 15.6, 50)
    expect(startLine).toBeGreaterThanOrEqual(0)
  })

  it('handles small files below total viewport', () => {
    const { startLine, endLine } = computeVisibleRange(0, 600, 15.6, 10)
    expect(startLine).toBe(0)
    expect(endLine).toBe(10)
  })
})
