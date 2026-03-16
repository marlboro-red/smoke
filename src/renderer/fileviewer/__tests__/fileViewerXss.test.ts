// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Regression tests for smoke-e1s: XSS via markdown content in FileViewerWidget.
 * The widget passes marked.parse() output through DOMPurify.sanitize() before
 * injecting it via dangerouslySetInnerHTML.
 */

function renderMarkdown(content: string): string {
  const raw = marked.parse(content, { async: false, gfm: true, breaks: false }) as string
  return DOMPurify.sanitize(raw)
}

describe('FileViewerWidget markdown XSS sanitization', () => {
  it('strips inline script tags from markdown', () => {
    const html = renderMarkdown('Hello <script>alert("xss")</script> world')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert')
    expect(html).toContain('Hello')
    expect(html).toContain('world')
  })

  it('strips onerror event handlers from img tags', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('strips javascript: protocol from links', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('strips event handlers from HTML in markdown', () => {
    const html = renderMarkdown('<div onmouseover="alert(1)">hover me</div>')
    expect(html).not.toContain('onmouseover')
    expect(html).toContain('hover me')
  })

  it('strips iframe tags', () => {
    const html = renderMarkdown('<iframe src="https://evil.com"></iframe>')
    expect(html).not.toContain('<iframe')
  })

  it('preserves safe markdown content', () => {
    const html = renderMarkdown('# Hello\n\nThis is **bold** and *italic*.')
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })
})
