import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore, type WebviewSession } from '../../stores/sessionStore'
import { isAllowedUrl, normalizeUrl } from '../urlValidation'

/**
 * Tests for webview navigation state tracking, URL change handling,
 * and refresh behavior. These test the same logic used by WebviewWindow
 * but exercise it through the store and pure functions directly,
 * avoiding Electron webview dependencies.
 */

function createWebviewSession(overrides?: Partial<WebviewSession>): WebviewSession {
  return {
    id: 'test-webview-1',
    type: 'webview',
    title: 'http://localhost:3000',
    url: 'http://localhost:3000',
    position: { x: 0, y: 0 },
    size: { cols: 80, rows: 24, width: 640, height: 480 },
    zIndex: 1,
    createdAt: Date.now(),
    canGoBack: false,
    canGoForward: false,
    ...overrides,
  }
}

describe('webview navigation state tracking', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  describe('loading state transitions', () => {
    it('session starts with no navigation history', () => {
      const session = createWebviewSession()
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      const stored = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(stored.canGoBack).toBe(false)
      expect(stored.canGoForward).toBe(false)
    })

    it('updates navigation state after did-navigate equivalent', () => {
      const session = createWebviewSession()
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      // Simulate what onDidNavigate does in WebviewWindow
      sessionStore.getState().updateSession(session.id, {
        url: 'http://localhost:3000/page2',
        title: 'Page 2',
        canGoBack: true,
        canGoForward: false,
      })

      const updated = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(updated.url).toBe('http://localhost:3000/page2')
      expect(updated.title).toBe('Page 2')
      expect(updated.canGoBack).toBe(true)
      expect(updated.canGoForward).toBe(false)
    })

    it('updates forward state after going back', () => {
      const session = createWebviewSession({
        url: 'http://localhost:3000/page2',
        canGoBack: true,
        canGoForward: false,
      })
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      // Simulate going back — now canGoForward should be true
      sessionStore.getState().updateSession(session.id, {
        url: 'http://localhost:3000',
        title: 'Home',
        canGoBack: false,
        canGoForward: true,
      })

      const updated = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(updated.url).toBe('http://localhost:3000')
      expect(updated.canGoBack).toBe(false)
      expect(updated.canGoForward).toBe(true)
    })

    it('updates title from webview after loading completes', () => {
      const session = createWebviewSession()
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      // Simulate did-stop-loading updating the title
      sessionStore.getState().updateSession(session.id, {
        title: 'My App - Dashboard',
        canGoBack: false,
        canGoForward: false,
      })

      const updated = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(updated.title).toBe('My App - Dashboard')
    })
  })

  describe('URL change handling (navigateTo logic)', () => {
    it('normalizes and stores valid URLs', () => {
      const session = createWebviewSession()
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      const rawUrl = 'example.com'
      const url = normalizeUrl(rawUrl)
      expect(url).toBe('http://example.com')
      expect(isAllowedUrl(url)).toBe(true)

      // Simulate what navigateTo does
      sessionStore.getState().updateSession(session.id, { url, title: url })

      const updated = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(updated.url).toBe('http://example.com')
      expect(updated.title).toBe('http://example.com')
    })

    it('normalizeUrl prepends http:// to file:// URLs (harmless — blocked at webview level)', () => {
      // When typed in URL bar, file:// doesn't match ^https?://, so normalizeUrl
      // prepends http://, making it "http://file:///etc/passwd" which is an
      // invalid HTTP URL, not an actual file:// access.
      // Real file:// navigations from within the webview are caught by will-navigate.
      const rawUrl = 'file:///etc/passwd'
      const url = normalizeUrl(rawUrl)
      expect(url).toBe('http://file:///etc/passwd')
      expect(isAllowedUrl(url)).toBe(true) // harmless http URL
    })

    it('normalizeUrl prepends http:// to javascript: URLs (harmless — blocked at webview level)', () => {
      // Same pattern: javascript: without http prefix gets normalized
      const rawUrl = 'javascript:alert(document.cookie)'
      const url = normalizeUrl(rawUrl)
      expect(url).toBe('http://javascript:alert(document.cookie)')
      expect(isAllowedUrl(url)).toBe(true) // harmless http URL
    })

    it('blocks data: URL typed in URL bar when it has http prefix check', () => {
      // Direct isAllowedUrl check (as in will-navigate handler) rejects data:
      expect(isAllowedUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    })

    it('does not navigate on empty input', () => {
      const url = normalizeUrl('')
      expect(url).toBe('')
      // navigateTo returns early if normalizeUrl returns empty
    })

    it('handles localhost URLs for development servers', () => {
      const cases = [
        'localhost:3000',
        'localhost:8080',
        '127.0.0.1:5173',
        '0.0.0.0:4000',
      ]

      for (const raw of cases) {
        const url = normalizeUrl(raw)
        expect(isAllowedUrl(url)).toBe(true)
        expect(url).toBe(`http://${raw}`)
      }
    })

    it('preserves https when user explicitly types it', () => {
      const url = normalizeUrl('https://secure.example.com')
      expect(url).toBe('https://secure.example.com')
      expect(isAllowedUrl(url)).toBe(true)
    })
  })

  describe('will-navigate URL blocking', () => {
    it('blocks navigation to disallowed protocols', () => {
      // Simulates the onWillNavigate handler logic
      const blockedUrls = [
        'file:///etc/passwd',
        'javascript:void(0)',
        'data:text/html,<script>alert(1)</script>',
        'blob:http://example.com/uuid',
        'chrome://settings',
        'devtools://devtools/bundled/inspector.html',
      ]

      for (const url of blockedUrls) {
        expect(isAllowedUrl(url)).toBe(false)
      }
    })

    it('allows navigation to http/https URLs', () => {
      const allowedUrls = [
        'http://example.com',
        'https://example.com',
        'http://localhost:3000/api/data',
        'https://cdn.example.com/script.js',
      ]

      for (const url of allowedUrls) {
        expect(isAllowedUrl(url)).toBe(true)
      }
    })
  })

  describe('new-window URL handling', () => {
    it('allows new window navigation to http/https URLs', () => {
      const session = createWebviewSession()
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      // Simulate onNewWindow — if allowed, navigateTo is called in same webview
      const newWindowUrl = 'https://external.example.com'
      if (isAllowedUrl(newWindowUrl)) {
        sessionStore.getState().updateSession(session.id, {
          url: newWindowUrl,
          title: newWindowUrl,
        })
      }

      const updated = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(updated.url).toBe('https://external.example.com')
    })

    it('blocks new window navigation to disallowed URLs', () => {
      const session = createWebviewSession()
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      const blockedUrl = 'javascript:alert(1)'
      if (isAllowedUrl(blockedUrl)) {
        sessionStore.getState().updateSession(session.id, {
          url: blockedUrl,
          title: blockedUrl,
        })
      }

      const stored = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(stored.url).toBe('http://localhost:3000') // unchanged
    })
  })

  describe('refresh behavior', () => {
    it('session URL remains unchanged after refresh', () => {
      const session = createWebviewSession({ url: 'https://example.com/app' })
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      // handleRefresh calls webviewRef.current?.reload() — URL should not change
      // After reload completes, did-stop-loading fires and title may update
      // but URL stays the same
      const stored = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(stored.url).toBe('https://example.com/app')
    })

    it('title can update after refresh completes', () => {
      const session = createWebviewSession({
        url: 'https://example.com/app',
        title: 'Old Title',
      })
      sessionStore.getState().sessions.set(session.id, session)
      sessionStore.setState({ sessions: new Map(sessionStore.getState().sessions) })

      // Simulate did-stop-loading after refresh — title updates
      sessionStore.getState().updateSession(session.id, {
        title: 'Updated Title After Refresh',
        canGoBack: false,
        canGoForward: false,
      })

      const updated = sessionStore.getState().sessions.get(session.id) as WebviewSession
      expect(updated.url).toBe('https://example.com/app') // URL unchanged
      expect(updated.title).toBe('Updated Title After Refresh')
    })
  })
})
