import { describe, it, expect } from 'vitest'
import { parseTaskHeuristic } from '../TaskParser'

describe('TaskParser', () => {
  describe('parseTaskHeuristic', () => {
    // ── Intent detection ─────────────────────────────────────────────

    it('detects fix intent', () => {
      const result = parseTaskHeuristic('fix the payment retry logic that drops failed charges')
      expect(result.intent).toBe('fix')
      expect(result.usedAi).toBe(false)
    })

    it('detects fix intent from bug-related words', () => {
      const result = parseTaskHeuristic('there is a bug in the login flow')
      expect(result.intent).toBe('fix')
    })

    it('detects add intent', () => {
      const result = parseTaskHeuristic('add a new notification system for user alerts')
      expect(result.intent).toBe('add')
    })

    it('detects add intent from create', () => {
      const result = parseTaskHeuristic('create a dashboard component')
      expect(result.intent).toBe('add')
    })

    it('detects refactor intent', () => {
      const result = parseTaskHeuristic('refactor the authentication middleware')
      expect(result.intent).toBe('refactor')
    })

    it('detects investigate intent', () => {
      const result = parseTaskHeuristic('investigate why the cache is invalidating too often')
      expect(result.intent).toBe('investigate')
    })

    it('detects test intent', () => {
      const result = parseTaskHeuristic('write unit tests for the PaymentService')
      expect(result.intent).toBe('test')
    })

    it('detects document intent', () => {
      const result = parseTaskHeuristic('document the API endpoints')
      expect(result.intent).toBe('document')
    })

    it('detects configure intent', () => {
      const result = parseTaskHeuristic('configure the CI pipeline for staging')
      expect(result.intent).toBe('configure')
    })

    it('detects style intent', () => {
      const result = parseTaskHeuristic('update the CSS theme for dark mode')
      expect(result.intent).toBe('style')
    })

    it('defaults to investigate for ambiguous input', () => {
      const result = parseTaskHeuristic('payment processing logic')
      expect(result.intent).toBe('investigate')
    })

    // ── Keyword extraction ───────────────────────────────────────────

    it('extracts domain keywords, filtering out intent words', () => {
      const result = parseTaskHeuristic('fix the payment retry logic that drops failed charges')
      expect(result.keywords).toContain('payment')
      expect(result.keywords).toContain('retry')
      expect(result.keywords).toContain('logic')
      expect(result.keywords).toContain('drops')
      expect(result.keywords).toContain('failed')
      expect(result.keywords).toContain('charges')
      // Intent and stop words filtered out
      expect(result.keywords).not.toContain('fix')
      expect(result.keywords).not.toContain('the')
      expect(result.keywords).not.toContain('that')
    })

    it('splits camelCase tokens into keywords', () => {
      const result = parseTaskHeuristic('refactor useWindowDrag hook')
      expect(result.keywords).toContain('window')
      expect(result.keywords).toContain('drag')
      expect(result.keywords).toContain('hook')
    })

    it('returns empty keywords for empty input', () => {
      const result = parseTaskHeuristic('')
      expect(result.keywords).toEqual([])
    })

    // ── File patterns ────────────────────────────────────────────────

    it('derives file patterns from keywords', () => {
      const result = parseTaskHeuristic('fix the payment retry logic')
      expect(result.filePatterns).toContain('payment')
      expect(result.filePatterns).toContain('retry')
      expect(result.filePatterns).toContain('logic')
    })

    it('generates plural/singular variants', () => {
      const result = parseTaskHeuristic('investigate charges')
      expect(result.filePatterns).toContain('charges')
      expect(result.filePatterns).toContain('charge')
    })

    // ── File type inclusion ──────────────────────────────────────────

    it('includes source + test for fix intent', () => {
      const result = parseTaskHeuristic('fix the login bug')
      expect(result.includeFileTypes).toContain('source')
      expect(result.includeFileTypes).toContain('test')
    })

    it('includes source + test + types for add intent', () => {
      const result = parseTaskHeuristic('add a new feature')
      expect(result.includeFileTypes).toContain('source')
      expect(result.includeFileTypes).toContain('test')
      expect(result.includeFileTypes).toContain('types')
    })

    it('includes only source for investigate intent', () => {
      const result = parseTaskHeuristic('where is the cache invalidation logic')
      expect(result.includeFileTypes).toEqual(['source'])
    })

    it('includes test + source for test intent', () => {
      const result = parseTaskHeuristic('write tests for authentication')
      expect(result.includeFileTypes).toContain('test')
      expect(result.includeFileTypes).toContain('source')
    })

    it('includes config for configure intent', () => {
      const result = parseTaskHeuristic('configure the webpack setup')
      expect(result.includeFileTypes).toContain('config')
    })

    it('includes style for style intent', () => {
      const result = parseTaskHeuristic('update the CSS theme')
      expect(result.includeFileTypes).toContain('style')
      expect(result.includeFileTypes).toContain('source')
    })

    it('includes docs for document intent', () => {
      const result = parseTaskHeuristic('document the API')
      expect(result.includeFileTypes).toContain('docs')
      expect(result.includeFileTypes).toContain('source')
    })

    // ── Edge cases ───────────────────────────────────────────────────

    it('handles very short descriptions', () => {
      const result = parseTaskHeuristic('bug')
      expect(result.intent).toBe('fix')
      expect(result.keywords).toEqual([])  // "bug" is an intent word
    })

    it('handles descriptions with file paths', () => {
      const result = parseTaskHeuristic('fix src/main/codegraph/SearchIndex.ts')
      expect(result.intent).toBe('fix')
      expect(result.keywords).toContain('src')
      expect(result.keywords).toContain('main')
      expect(result.keywords).toContain('codegraph')
    })

    it('handles descriptions with code identifiers', () => {
      const result = parseTaskHeuristic('refactor PtyManager spawn to handle errors')
      expect(result.intent).toBe('refactor')
      expect(result.keywords).toContain('pty')
      expect(result.keywords).toContain('manager')
      expect(result.keywords).toContain('spawn')
      expect(result.keywords).toContain('errors')
    })

    it('always sets usedAi to false for heuristic parsing', () => {
      const result = parseTaskHeuristic('anything')
      expect(result.usedAi).toBe(false)
    })
  })
})
