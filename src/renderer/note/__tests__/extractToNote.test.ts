import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sessionStore, type NoteSession } from '../../stores/sessionStore'
import { connectorStore } from '../../stores/connectorStore'
import { preferencesStore } from '../../stores/preferencesStore'
import { formatSourceLabel } from '../extractToNote'

// Set up minimal window/document stubs before importing extractToNote
const mockRemoveAllRanges = vi.fn()
let mockSelectionText = ''

vi.stubGlobal('window', {
  getSelection: () => ({
    toString: () => mockSelectionText,
    isCollapsed: mockSelectionText === '',
    rangeCount: mockSelectionText ? 1 : 0,
    getRangeAt: () => ({
      intersectsNode: () => true,
    }),
    removeAllRanges: mockRemoveAllRanges,
  }),
})

vi.stubGlobal('document', {
  querySelector: () => null,
})

// Mock addToast
vi.mock('../../stores/toastStore', () => ({
  addToast: vi.fn(),
}))

// Import after stubs are set up
const { extractSelectionToNote } = await import('../extractToNote')

function setMockSelection(text: string) {
  mockSelectionText = text
}

function resetStores() {
  sessionStore.setState({
    sessions: new Map(),
    focusedId: null,
    highlightedId: null,
    selectedIds: new Set<string>(),
    nextZIndex: 1,
  })
  connectorStore.setState({
    connectors: new Map(),
  })
}

describe('extractSelectionToNote', () => {
  beforeEach(() => {
    resetStores()
    mockRemoveAllRanges.mockClear()
    mockSelectionText = ''
  })

  it('does nothing when no session is focused', () => {
    setMockSelection('some text')
    extractSelectionToNote()
    expect(sessionStore.getState().sessions.size).toBe(0)
  })

  it('does nothing when no text is selected', () => {
    const file = sessionStore.getState().createFileSession('/tmp/foo.ts', 'content', 'typescript')
    sessionStore.getState().focusSession(file.id)
    setMockSelection('')
    extractSelectionToNote()
    // Only the original file session should exist
    expect(sessionStore.getState().sessions.size).toBe(1)
  })

  it('creates a note from selected text in a file viewer session', () => {
    const file = sessionStore.getState().createFileSession(
      '/tmp/project/src/index.ts',
      'const x = 1\nconst y = 2',
      'typescript'
    )
    sessionStore.getState().focusSession(file.id)
    setMockSelection('const x = 1')

    extractSelectionToNote()

    // Should have 2 sessions now (file + note)
    expect(sessionStore.getState().sessions.size).toBe(2)

    // Find the note
    const sessions = Array.from(sessionStore.getState().sessions.values())
    const note = sessions.find((s) => s.type === 'note') as NoteSession
    expect(note).toBeDefined()
    expect(note.content).toContain('const x = 1')
    expect(note.color).toBe('blue')
    expect(note.sourceRef).toBeDefined()
    expect(note.sourceRef?.sourceSessionId).toBe(file.id)
    expect(note.sourceRef?.filePath).toBe('/tmp/project/src/index.ts')

    // Selection should be cleared
    expect(mockRemoveAllRanges).toHaveBeenCalled()
  })

  it('positions the note to the right of the source session', () => {
    const file = sessionStore.getState().createFileSession(
      '/tmp/foo.ts',
      'code',
      'typescript',
      { x: 100, y: 200 }
    )
    sessionStore.getState().focusSession(file.id)
    setMockSelection('code')

    extractSelectionToNote()

    const sessions = Array.from(sessionStore.getState().sessions.values())
    const note = sessions.find((s) => s.type === 'note') as NoteSession
    expect(note).toBeDefined()
    // Note should be to the right of the file viewer
    expect(note.position.x).toBeGreaterThan(file.position.x + file.size.width)
    expect(note.position.y).toBe(200)
  })

  it('creates a connector between source and note', () => {
    const file = sessionStore.getState().createFileSession(
      '/tmp/foo.ts',
      'code',
      'typescript'
    )
    sessionStore.getState().focusSession(file.id)
    setMockSelection('code')

    extractSelectionToNote()

    const connectors = Array.from(connectorStore.getState().connectors.values())
    expect(connectors).toHaveLength(1)
    expect(connectors[0].sourceId).toBe(file.id)

    const sessions = Array.from(sessionStore.getState().sessions.values())
    const note = sessions.find((s) => s.type === 'note')!
    expect(connectors[0].targetId).toBe(note.id)
    expect(connectors[0].label).toBe('extract')
  })

  it('focuses the new note after creation', () => {
    const file = sessionStore.getState().createFileSession(
      '/tmp/foo.ts',
      'code',
      'typescript'
    )
    sessionStore.getState().focusSession(file.id)
    setMockSelection('code')

    extractSelectionToNote()

    const sessions = Array.from(sessionStore.getState().sessions.values())
    const note = sessions.find((s) => s.type === 'note')!
    expect(sessionStore.getState().focusedId).toBe(note.id)
  })

  it('sets note title to source file reference', () => {
    const file = sessionStore.getState().createFileSession(
      '/tmp/foo.ts',
      'code',
      'typescript'
    )
    sessionStore.getState().focusSession(file.id)
    setMockSelection('code')

    extractSelectionToNote()

    const sessions = Array.from(sessionStore.getState().sessions.values())
    const note = sessions.find((s) => s.type === 'note') as NoteSession
    expect(note.title).toContain('foo.ts')
  })

  it('works with non-file sessions (uses session title)', () => {
    const sourceNote = sessionStore.getState().createNoteSession({ x: 0, y: 0 }, 'yellow')
    sessionStore.getState().updateSession(sourceNote.id, { title: 'My Notes', content: 'some output' })
    sessionStore.getState().focusSession(sourceNote.id)
    setMockSelection('some output')

    extractSelectionToNote()

    expect(sessionStore.getState().sessions.size).toBe(2)
    const sessions = Array.from(sessionStore.getState().sessions.values())
    const extractedNote = sessions.find((s) => s.type === 'note' && s.id !== sourceNote.id) as NoteSession
    expect(extractedNote).toBeDefined()
    expect(extractedNote.content).toContain('some output')
    expect(extractedNote.sourceRef?.sourceSessionId).toBe(sourceNote.id)
    expect(extractedNote.sourceRef?.filePath).toBeUndefined()
  })

  it('includes source label in the note content', () => {
    const file = sessionStore.getState().createFileSession(
      '/tmp/src/app.ts',
      'function main() {}',
      'typescript'
    )
    sessionStore.getState().focusSession(file.id)
    setMockSelection('function main() {}')

    extractSelectionToNote()

    const sessions = Array.from(sessionStore.getState().sessions.values())
    const note = sessions.find((s) => s.type === 'note') as NoteSession
    // Content should start with the source reference in brackets
    expect(note.content).toMatch(/^\[.*app\.ts.*\]/)
  })
})

describe('formatSourceLabel', () => {
  beforeEach(() => {
    preferencesStore.setState({ launchCwd: '' })
  })

  it('returns full path when no launchCwd is set', () => {
    expect(formatSourceLabel('/tmp/src/index.ts')).toBe('/tmp/src/index.ts')
  })

  it('strips launchCwd prefix', () => {
    preferencesStore.setState({ launchCwd: '/tmp' })
    expect(formatSourceLabel('/tmp/src/index.ts')).toBe('src/index.ts')
  })

  it('appends single line number', () => {
    expect(formatSourceLabel('/tmp/foo.ts', 42, 42)).toBe('/tmp/foo.ts:42')
  })

  it('appends line range', () => {
    expect(formatSourceLabel('/tmp/foo.ts', 10, 25)).toBe('/tmp/foo.ts:10-25')
  })

  it('strips launchCwd and appends line range', () => {
    preferencesStore.setState({ launchCwd: '/project' })
    expect(formatSourceLabel('/project/src/main.ts', 5, 15)).toBe('src/main.ts:5-15')
  })
})
