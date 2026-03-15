import { describe, it, expect, beforeEach } from 'vitest'
import { suggestionStore, type FileSuggestion } from '../suggestionStore'

function makeSuggestion(overrides: Partial<FileSuggestion> = {}): FileSuggestion {
  return {
    id: 'ghost-test-file-ts',
    filePath: '/project/src/test/file.ts',
    displayName: 'src/test/file.ts',
    relevanceScore: 0.8,
    reason: 'import',
    position: { x: 100, y: 200 },
    ...overrides,
  }
}

describe('suggestionStore', () => {
  beforeEach(() => {
    suggestionStore.getState().clearSuggestions()
    suggestionStore.getState().setEnabled(true)
    suggestionStore.getState().setLoading(false)
  })

  it('starts with empty suggestions', () => {
    const state = suggestionStore.getState()
    expect(state.suggestions).toEqual([])
    expect(state.sourceFilePath).toBeNull()
    expect(state.loading).toBe(false)
    expect(state.enabled).toBe(true)
  })

  it('sets suggestions with source file path', () => {
    const suggestions = [
      makeSuggestion({ id: 'ghost-a' }),
      makeSuggestion({ id: 'ghost-b', filePath: '/project/src/b.ts' }),
    ]
    suggestionStore.getState().setSuggestions(suggestions, '/project/src/main.ts')

    const state = suggestionStore.getState()
    expect(state.suggestions).toHaveLength(2)
    expect(state.sourceFilePath).toBe('/project/src/main.ts')
  })

  it('clears suggestions', () => {
    suggestionStore.getState().setSuggestions(
      [makeSuggestion()],
      '/project/src/main.ts'
    )
    suggestionStore.getState().clearSuggestions()

    const state = suggestionStore.getState()
    expect(state.suggestions).toEqual([])
    expect(state.sourceFilePath).toBeNull()
  })

  it('removes a single suggestion by id', () => {
    const suggestions = [
      makeSuggestion({ id: 'ghost-a' }),
      makeSuggestion({ id: 'ghost-b' }),
      makeSuggestion({ id: 'ghost-c' }),
    ]
    suggestionStore.getState().setSuggestions(suggestions, '/project/src/main.ts')

    suggestionStore.getState().removeSuggestion('ghost-b')

    const remaining = suggestionStore.getState().suggestions
    expect(remaining).toHaveLength(2)
    expect(remaining.map((s) => s.id)).toEqual(['ghost-a', 'ghost-c'])
  })

  it('tracks loading state', () => {
    expect(suggestionStore.getState().loading).toBe(false)
    suggestionStore.getState().setLoading(true)
    expect(suggestionStore.getState().loading).toBe(true)
    suggestionStore.getState().setLoading(false)
    expect(suggestionStore.getState().loading).toBe(false)
  })

  it('disabling clears existing suggestions', () => {
    suggestionStore.getState().setSuggestions(
      [makeSuggestion()],
      '/project/src/main.ts'
    )
    expect(suggestionStore.getState().suggestions).toHaveLength(1)

    suggestionStore.getState().setEnabled(false)

    expect(suggestionStore.getState().enabled).toBe(false)
    expect(suggestionStore.getState().suggestions).toEqual([])
    expect(suggestionStore.getState().sourceFilePath).toBeNull()
  })

  it('re-enabling does not restore previous suggestions', () => {
    suggestionStore.getState().setSuggestions(
      [makeSuggestion()],
      '/project/src/main.ts'
    )
    suggestionStore.getState().setEnabled(false)
    suggestionStore.getState().setEnabled(true)

    expect(suggestionStore.getState().enabled).toBe(true)
    expect(suggestionStore.getState().suggestions).toEqual([])
  })

  it('removing non-existent id is a no-op', () => {
    const suggestions = [makeSuggestion({ id: 'ghost-a' })]
    suggestionStore.getState().setSuggestions(suggestions, '/project/src/main.ts')

    suggestionStore.getState().removeSuggestion('ghost-nonexistent')

    expect(suggestionStore.getState().suggestions).toHaveLength(1)
  })
})
