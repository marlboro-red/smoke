import { describe, it, expect } from 'vitest'
import { extractKeywords } from '../RelevanceScorer'

describe('RelevanceScorer', () => {
  describe('extractKeywords', () => {
    it('extracts meaningful words from task description', () => {
      const keywords = extractKeywords('Fix the login authentication bug')
      expect(keywords).toContain('login')
      expect(keywords).toContain('authentication')
      expect(keywords).toContain('bug')
      // Stop words should be filtered
      expect(keywords).not.toContain('the')
    })

    it('splits camelCase identifiers', () => {
      const keywords = extractKeywords('Refactor useWindowDrag hook')
      expect(keywords).toContain('window')
      expect(keywords).toContain('drag')
      expect(keywords).toContain('hook')
      expect(keywords).toContain('refactor')
    })

    it('handles path-like strings', () => {
      const keywords = extractKeywords('Update src/renderer/canvas/Canvas.tsx')
      expect(keywords).toContain('src')
      expect(keywords).toContain('renderer')
      expect(keywords).toContain('canvas')
    })

    it('removes short tokens (< 2 chars)', () => {
      const keywords = extractKeywords('a b c foo bar')
      expect(keywords).not.toContain('a')
      expect(keywords).not.toContain('b')
      expect(keywords).not.toContain('c')
      expect(keywords).toContain('foo')
      expect(keywords).toContain('bar')
    })

    it('handles empty input', () => {
      const keywords = extractKeywords('')
      expect(keywords).toEqual([])
    })

    it('deduplicates keywords', () => {
      const keywords = extractKeywords('canvas Canvas CANVAS')
      const canvasCount = keywords.filter(k => k === 'canvas').length
      expect(canvasCount).toBe(1)
    })

    it('preserves technical terms', () => {
      const keywords = extractKeywords('Add IPC handler for PTY resize')
      expect(keywords).toContain('ipc')
      expect(keywords).toContain('handler')
      expect(keywords).toContain('pty')
      expect(keywords).toContain('resize')
    })
  })
})
