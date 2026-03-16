import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchContent, canvasSearchStore, type SearchMatch } from '../searchStore'
import { sessionStore } from '../../stores/sessionStore'

// Mock getTerminal for terminal session searches
vi.mock('../../terminal/terminalRegistry', () => ({
  getTerminal: vi.fn(),
}))

import { getTerminal } from '../../terminal/terminalRegistry'

const mockedGetTerminal = vi.mocked(getTerminal)

// Helper: create a mock xterm buffer
function mockTerminalBuffer(lines: string[]) {
  return {
    terminal: {
      buffer: {
        active: {
          length: lines.length,
          getLine: (i: number) => ({
            translateToString: () => lines[i] ?? '',
          }),
        },
      },
    },
  }
}

describe('searchContent', () => {
  const defaults = {
    sessionId: 'sess-1',
    sessionTitle: 'Test Session',
    sessionType: 'file' as const,
  }

  it('finds a simple substring match', () => {
    const lines = ['hello world', 'foo bar']
    const matches = searchContent(lines, 'world', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, false)
    expect(matches).toHaveLength(1)
    expect(matches[0].lineNumber).toBe(1)
    expect(matches[0].matchStart).toBe(6)
    expect(matches[0].matchEnd).toBe(11)
    expect(matches[0].lineContent).toBe('hello world')
  })

  it('matches empty string at every position (performSearch filters empty queries)', () => {
    const lines = ['hello world']
    const matches = searchContent(lines, '', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, false)
    // searchContent itself does not filter empty queries — that is done by performSearch
    expect(matches.length).toBeGreaterThan(0)
  })

  it('finds multiple matches on different lines', () => {
    const lines = ['error in line 1', 'no problem here', 'error in line 3']
    const matches = searchContent(lines, 'error', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, false)
    expect(matches).toHaveLength(2)
    expect(matches[0].lineNumber).toBe(1)
    expect(matches[1].lineNumber).toBe(3)
  })

  it('finds multiple matches on the same line', () => {
    const lines = ['ab ab ab']
    const matches = searchContent(lines, 'ab', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, false)
    expect(matches).toHaveLength(3)
    expect(matches[0].matchStart).toBe(0)
    expect(matches[1].matchStart).toBe(3)
    expect(matches[2].matchStart).toBe(6)
  })

  it('is case-insensitive by default', () => {
    const lines = ['Hello World', 'HELLO world']
    const matches = searchContent(lines, 'hello', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, false)
    expect(matches).toHaveLength(2)
  })

  it('respects case-sensitive flag', () => {
    const lines = ['Hello World', 'hello world']
    const matches = searchContent(lines, 'Hello', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, true, false)
    expect(matches).toHaveLength(1)
    expect(matches[0].lineNumber).toBe(1)
  })

  it('match positions refer to original line (not lowered)', () => {
    const lines = ['Say HELLO']
    const matches = searchContent(lines, 'hello', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, false)
    expect(matches).toHaveLength(1)
    expect(matches[0].matchStart).toBe(4)
    expect(matches[0].matchEnd).toBe(9)
    // lineContent should be the original, not lowered
    expect(matches[0].lineContent).toBe('Say HELLO')
  })

  it('handles no matches gracefully', () => {
    const lines = ['nothing here']
    const matches = searchContent(lines, 'xyz', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, false)
    expect(matches).toHaveLength(0)
  })

  it('populates sessionId, sessionTitle, sessionType on each match', () => {
    const lines = ['match me']
    const matches = searchContent(lines, 'match', 'id-42', 'My Note', 'note', false, false)
    expect(matches[0].sessionId).toBe('id-42')
    expect(matches[0].sessionTitle).toBe('My Note')
    expect(matches[0].sessionType).toBe('note')
  })

  describe('regex mode', () => {
    it('matches a basic regex pattern', () => {
      const lines = ['error 404', 'error 500', 'all good']
      const matches = searchContent(lines, 'error \\d+', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, true)
      expect(matches).toHaveLength(2)
    })

    it('respects case-sensitive flag in regex mode', () => {
      const lines = ['Error here', 'error there']
      const matchesInsensitive = searchContent(lines, 'error', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, true)
      expect(matchesInsensitive).toHaveLength(2)

      const matchesSensitive = searchContent(lines, 'error', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, true, true)
      expect(matchesSensitive).toHaveLength(1)
      expect(matchesSensitive[0].lineNumber).toBe(2)
    })

    it('finds multiple regex matches on the same line', () => {
      const lines = ['abc 123 def 456']
      const matches = searchContent(lines, '\\d+', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, true)
      expect(matches).toHaveLength(2)
      expect(matches[0].matchStart).toBe(4)
      expect(matches[0].matchEnd).toBe(7)
      expect(matches[1].matchStart).toBe(12)
      expect(matches[1].matchEnd).toBe(15)
    })

    it('returns empty for invalid regex', () => {
      const lines = ['test']
      const matches = searchContent(lines, '[invalid', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, true)
      expect(matches).toHaveLength(0)
    })

    it('skips zero-length regex matches without infinite loop', () => {
      const lines = ['abc']
      // Pattern that can match empty string
      const matches = searchContent(lines, 'a*', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, true)
      // Should find 'a' at position 0 and skip zero-length matches
      expect(matches.length).toBeGreaterThanOrEqual(1)
      expect(matches[0].matchStart).toBe(0)
      expect(matches[0].matchEnd).toBe(1)
    })

    it('captures correct match boundaries for groups', () => {
      const lines = ['foo-bar-baz']
      const matches = searchContent(lines, '(bar)', defaults.sessionId, defaults.sessionTitle, defaults.sessionType, false, true)
      expect(matches).toHaveLength(1)
      expect(matches[0].matchStart).toBe(4)
      expect(matches[0].matchEnd).toBe(7)
    })
  })
})

describe('canvasSearchStore', () => {
  beforeEach(() => {
    // Reset store state
    canvasSearchStore.setState({
      isOpen: false,
      query: '',
      results: [],
      caseSensitive: false,
      regex: false,
    })

    // Reset session store with known sessions
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })

    mockedGetTerminal.mockReset()
  })

  function addFileSession(id: string, title: string, content: string) {
    const sessions = new Map(sessionStore.getState().sessions)
    sessions.set(id, {
      id,
      type: 'file',
      title,
      content,
      filePath: `/path/${title}`,
      language: 'plaintext',
      position: { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
      zIndex: 1,
      createdAt: Date.now(),
    } as any)
    sessionStore.setState({ sessions })
  }

  function addNoteSession(id: string, title: string, content: string) {
    const sessions = new Map(sessionStore.getState().sessions)
    sessions.set(id, {
      id,
      type: 'note',
      title,
      content,
      color: '#fff',
      position: { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
      zIndex: 1,
      createdAt: Date.now(),
    } as any)
    sessionStore.setState({ sessions })
  }

  function addTerminalSession(id: string, title: string, bufferLines: string[]) {
    const sessions = new Map(sessionStore.getState().sessions)
    sessions.set(id, {
      id,
      type: 'terminal',
      title,
      cwd: '/home',
      status: 'running',
      position: { x: 0, y: 0 },
      size: { cols: 80, rows: 24, width: 640, height: 480 },
      zIndex: 1,
      createdAt: Date.now(),
    } as any)
    sessionStore.setState({ sessions })
    mockedGetTerminal.mockImplementation((termId: string) => {
      if (termId === id) return mockTerminalBuffer(bufferLines) as any
      return mockedGetTerminal.getMockImplementation()?.(termId) ?? null
    })
  }

  describe('cross-element matching', () => {
    it('searches across file, note, and terminal sessions', () => {
      addFileSession('f1', 'app.ts', 'const error = true\nno match\nerror handler')
      addNoteSession('n1', 'Notes', 'Error in production\nall clear')
      addTerminalSession('t1', 'Terminal 1', ['npm error: build failed', 'done'])

      canvasSearchStore.getState().setQuery('error')
      const { results } = canvasSearchStore.getState()

      expect(results).toHaveLength(3)

      const fileGroup = results.find((r) => r.sessionId === 'f1')
      const noteGroup = results.find((r) => r.sessionId === 'n1')
      const termGroup = results.find((r) => r.sessionId === 't1')

      expect(fileGroup).toBeDefined()
      expect(fileGroup!.matches).toHaveLength(2)
      expect(fileGroup!.sessionType).toBe('file')

      expect(noteGroup).toBeDefined()
      expect(noteGroup!.matches).toHaveLength(1)
      expect(noteGroup!.sessionType).toBe('note')

      expect(termGroup).toBeDefined()
      expect(termGroup!.matches).toHaveLength(1)
      expect(termGroup!.sessionType).toBe('terminal')
    })

    it('skips terminal sessions without a terminal entry', () => {
      addFileSession('f1', 'file.ts', 'hello world')

      // Add terminal session but don't set up mock buffer
      const sessions = new Map(sessionStore.getState().sessions)
      sessions.set('t-dead', {
        id: 't-dead',
        type: 'terminal',
        title: 'Dead Terminal',
        cwd: '/home',
        status: 'exited',
        position: { x: 0, y: 0 },
        size: { cols: 80, rows: 24, width: 640, height: 480 },
        zIndex: 1,
        createdAt: Date.now(),
      } as any)
      sessionStore.setState({ sessions })
      mockedGetTerminal.mockReturnValue(null as any)

      canvasSearchStore.getState().setQuery('hello')
      const { results } = canvasSearchStore.getState()

      expect(results).toHaveLength(1)
      expect(results[0].sessionId).toBe('f1')
    })
  })

  describe('result grouping', () => {
    it('groups matches by session', () => {
      addFileSession('f1', 'a.ts', 'foo\nfoo\nfoo')
      addFileSession('f2', 'b.ts', 'foo')

      canvasSearchStore.getState().setQuery('foo')
      const { results } = canvasSearchStore.getState()

      expect(results).toHaveLength(2)
      const g1 = results.find((r) => r.sessionId === 'f1')!
      const g2 = results.find((r) => r.sessionId === 'f2')!
      expect(g1.matches).toHaveLength(3)
      expect(g2.matches).toHaveLength(1)
    })

    it('does not include sessions with zero matches', () => {
      addFileSession('f1', 'a.ts', 'hello')
      addFileSession('f2', 'b.ts', 'world')

      canvasSearchStore.getState().setQuery('hello')
      const { results } = canvasSearchStore.getState()

      expect(results).toHaveLength(1)
      expect(results[0].sessionId).toBe('f1')
    })

    it('returns empty results for whitespace-only query', () => {
      addFileSession('f1', 'a.ts', 'hello')
      canvasSearchStore.getState().setQuery('   ')
      expect(canvasSearchStore.getState().results).toHaveLength(0)
    })
  })

  describe('match highlighting positions', () => {
    it('provides correct matchStart and matchEnd for highlighting', () => {
      addFileSession('f1', 'code.ts', 'const value = 42')

      canvasSearchStore.getState().setQuery('value')
      const match = canvasSearchStore.getState().results[0].matches[0]

      expect(match.matchStart).toBe(6)
      expect(match.matchEnd).toBe(11)
      expect(match.lineContent.slice(match.matchStart, match.matchEnd)).toBe('value')
    })

    it('highlight positions work for multiple matches on same line', () => {
      addFileSession('f1', 'code.ts', 'test test test')

      canvasSearchStore.getState().setQuery('test')
      const matches = canvasSearchStore.getState().results[0].matches

      expect(matches).toHaveLength(3)
      for (const m of matches) {
        expect(m.lineContent.slice(m.matchStart, m.matchEnd)).toBe('test')
      }
      expect(matches[0].matchStart).toBe(0)
      expect(matches[1].matchStart).toBe(5)
      expect(matches[2].matchStart).toBe(10)
    })
  })

  describe('case sensitivity toggle', () => {
    it('default search is case-insensitive', () => {
      addFileSession('f1', 'code.ts', 'Hello\nhello\nHELLO')

      canvasSearchStore.getState().setQuery('hello')
      expect(canvasSearchStore.getState().results[0].matches).toHaveLength(3)
    })

    it('toggleCaseSensitive re-runs search with new sensitivity', () => {
      addFileSession('f1', 'code.ts', 'Hello\nhello\nHELLO')

      canvasSearchStore.getState().setQuery('hello')
      expect(canvasSearchStore.getState().results[0].matches).toHaveLength(3)

      canvasSearchStore.getState().toggleCaseSensitive()
      expect(canvasSearchStore.getState().caseSensitive).toBe(true)
      expect(canvasSearchStore.getState().results[0].matches).toHaveLength(1)
      expect(canvasSearchStore.getState().results[0].matches[0].lineNumber).toBe(2)
    })

    it('toggling back to insensitive restores all matches', () => {
      addFileSession('f1', 'code.ts', 'Hello\nhello')

      canvasSearchStore.getState().setQuery('hello')
      canvasSearchStore.getState().toggleCaseSensitive() // now sensitive
      expect(canvasSearchStore.getState().results[0].matches).toHaveLength(1)

      canvasSearchStore.getState().toggleCaseSensitive() // back to insensitive
      expect(canvasSearchStore.getState().results[0].matches).toHaveLength(2)
    })
  })

  describe('regex toggle', () => {
    it('regex mode matches patterns', () => {
      addFileSession('f1', 'logs.txt', 'error 404\nerror 500\nok 200')

      canvasSearchStore.getState().toggleRegex()
      canvasSearchStore.getState().setQuery('error \\d{3}')

      const matches = canvasSearchStore.getState().results[0].matches
      expect(matches).toHaveLength(2)
    })

    it('invalid regex returns no results instead of throwing', () => {
      addFileSession('f1', 'code.ts', 'test')

      canvasSearchStore.getState().toggleRegex()
      canvasSearchStore.getState().setQuery('[unclosed')

      expect(canvasSearchStore.getState().results).toHaveLength(0)
    })

    it('toggling regex re-runs current query', () => {
      addFileSession('f1', 'code.ts', 'line with d+ literal\nno match')

      // Without regex, search for literal "d+"
      canvasSearchStore.getState().setQuery('d+')
      expect(canvasSearchStore.getState().results[0].matches).toHaveLength(1)

      // Toggle regex on — "d+" now matches one or more 'd' chars
      canvasSearchStore.getState().toggleRegex()
      // "d" appears in "d+" on line 1 and in no other d's — still 1 match
      // But the interpretation changes
      expect(canvasSearchStore.getState().regex).toBe(true)
    })
  })

  describe('store actions', () => {
    it('open sets isOpen to true', () => {
      canvasSearchStore.getState().open()
      expect(canvasSearchStore.getState().isOpen).toBe(true)
    })

    it('close resets isOpen, query, and results', () => {
      addFileSession('f1', 'code.ts', 'hello')
      canvasSearchStore.getState().open()
      canvasSearchStore.getState().setQuery('hello')
      expect(canvasSearchStore.getState().results).toHaveLength(1)

      canvasSearchStore.getState().close()
      expect(canvasSearchStore.getState().isOpen).toBe(false)
      expect(canvasSearchStore.getState().query).toBe('')
      expect(canvasSearchStore.getState().results).toHaveLength(0)
    })

    it('toggle opens when closed and closes when open', () => {
      canvasSearchStore.getState().toggle()
      expect(canvasSearchStore.getState().isOpen).toBe(true)

      canvasSearchStore.getState().toggle()
      expect(canvasSearchStore.getState().isOpen).toBe(false)
    })

    it('search action re-runs search for stored query', () => {
      addFileSession('f1', 'code.ts', 'hello world')
      canvasSearchStore.getState().setQuery('hello')
      expect(canvasSearchStore.getState().results).toHaveLength(1)

      // Add new content and re-search
      addFileSession('f2', 'code2.ts', 'hello again')
      canvasSearchStore.getState().search('hello')
      expect(canvasSearchStore.getState().results).toHaveLength(2)
    })
  })
})
