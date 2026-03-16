import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import type { SnippetSession } from '../../stores/sessionStore'
import { detectLanguage } from '../../fileviewer/useFileViewerCreation'
import { getLanguageExtension } from '../../fileviewer/codemirrorLanguages'

describe('SnippetSession store', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  describe('snippet creation', () => {
    it('creates a snippet session with default values', () => {
      const session = sessionStore.getState().createSnippetSession()
      expect(session.type).toBe('snippet')
      expect(session.title).toBe('Snippet')
      expect(session.content).toBe('')
      expect(session.language).toBe('javascript')
      expect(session.position).toEqual({ x: 0, y: 0 })
      expect(session.size).toEqual({ cols: 0, rows: 0, width: 480, height: 360 })
    })

    it('creates a snippet session with a UUID id', () => {
      const session = sessionStore.getState().createSnippetSession()
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it('creates a snippet session with custom language', () => {
      const session = sessionStore.getState().createSnippetSession('python')
      expect(session.language).toBe('python')
    })

    it('creates a snippet session with custom content', () => {
      const session = sessionStore.getState().createSnippetSession('rust', 'fn main() {}')
      expect(session.content).toBe('fn main() {}')
      expect(session.language).toBe('rust')
    })

    it('creates a snippet session with custom position', () => {
      const session = sessionStore.getState().createSnippetSession('typescript', '', { x: 300, y: 400 })
      expect(session.position).toEqual({ x: 300, y: 400 })
    })

    it('stores snippet in the sessions Map', () => {
      const session = sessionStore.getState().createSnippetSession()
      const { sessions } = sessionStore.getState()
      expect(sessions.size).toBe(1)
      expect(sessions.get(session.id)).toBeDefined()
      expect(sessions.get(session.id)!.type).toBe('snippet')
    })

    it('increments zIndex for each new snippet', () => {
      const s1 = sessionStore.getState().createSnippetSession()
      const s2 = sessionStore.getState().createSnippetSession()
      expect(s2.zIndex).toBeGreaterThan(s1.zIndex)
    })

    it('sets createdAt timestamp', () => {
      const before = Date.now()
      const session = sessionStore.getState().createSnippetSession()
      const after = Date.now()
      expect(session.createdAt).toBeGreaterThanOrEqual(before)
      expect(session.createdAt).toBeLessThanOrEqual(after)
    })

    it('coexists with other session types in the Map', () => {
      const terminal = sessionStore.getState().createSession('/tmp')
      const snippet = sessionStore.getState().createSnippetSession('python', 'x = 1')
      const { sessions } = sessionStore.getState()
      expect(sessions.size).toBe(2)
      expect(sessions.get(terminal.id)?.type).toBe('terminal')
      expect(sessions.get(snippet.id)?.type).toBe('snippet')
    })
  })

  describe('language selection', () => {
    it('updates snippet language via updateSession', () => {
      const session = sessionStore.getState().createSnippetSession('javascript')
      sessionStore.getState().updateSession(session.id, { language: 'python' })
      const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
      expect(updated.language).toBe('python')
    })

    it('preserves other fields when changing language', () => {
      const session = sessionStore.getState().createSnippetSession('javascript', 'const x = 1;')
      sessionStore.getState().updateSession(session.id, { language: 'typescript' })
      const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
      expect(updated.language).toBe('typescript')
      expect(updated.content).toBe('const x = 1;')
      expect(updated.title).toBe('Snippet')
      expect(updated.type).toBe('snippet')
    })

    it('can cycle through multiple languages', () => {
      const session = sessionStore.getState().createSnippetSession('javascript')
      const languages = ['python', 'rust', 'go', 'typescript']
      for (const lang of languages) {
        sessionStore.getState().updateSession(session.id, { language: lang })
        const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
        expect(updated.language).toBe(lang)
      }
    })
  })

  describe('content editing', () => {
    it('updates snippet content via updateSession', () => {
      const session = sessionStore.getState().createSnippetSession('python')
      sessionStore.getState().updateSession(session.id, { content: 'print("hello")' })
      const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
      expect(updated.content).toBe('print("hello")')
    })

    it('preserves language when editing content', () => {
      const session = sessionStore.getState().createSnippetSession('rust', 'fn main() {}')
      sessionStore.getState().updateSession(session.id, { content: 'fn foo() -> i32 { 42 }' })
      const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
      expect(updated.content).toBe('fn foo() -> i32 { 42 }')
      expect(updated.language).toBe('rust')
    })

    it('handles multiline content', () => {
      const session = sessionStore.getState().createSnippetSession('python')
      const multiline = 'def hello():\n    print("hello")\n\nhello()'
      sessionStore.getState().updateSession(session.id, { content: multiline })
      const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
      expect(updated.content).toBe(multiline)
    })

    it('handles empty content', () => {
      const session = sessionStore.getState().createSnippetSession('javascript', 'initial content')
      sessionStore.getState().updateSession(session.id, { content: '' })
      const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
      expect(updated.content).toBe('')
    })

    it('can update both content and language simultaneously', () => {
      const session = sessionStore.getState().createSnippetSession('javascript', 'const x = 1;')
      sessionStore.getState().updateSession(session.id, { content: 'x = 1', language: 'python' })
      const updated = sessionStore.getState().sessions.get(session.id) as SnippetSession
      expect(updated.content).toBe('x = 1')
      expect(updated.language).toBe('python')
    })
  })

  describe('snippet removal', () => {
    it('removes a snippet session', () => {
      const session = sessionStore.getState().createSnippetSession()
      sessionStore.getState().removeSession(session.id)
      expect(sessionStore.getState().sessions.size).toBe(0)
    })

    it('clears focusedId when focused snippet is removed', () => {
      const session = sessionStore.getState().createSnippetSession()
      sessionStore.getState().focusSession(session.id)
      sessionStore.getState().removeSession(session.id)
      expect(sessionStore.getState().focusedId).toBeNull()
    })
  })
})

describe('detectLanguage', () => {
  it('detects TypeScript from .ts extension', () => {
    expect(detectLanguage('/src/index.ts')).toBe('typescript')
  })

  it('detects TSX from .tsx extension', () => {
    expect(detectLanguage('/src/App.tsx')).toBe('tsx')
  })

  it('detects JavaScript from .js extension', () => {
    expect(detectLanguage('/src/index.js')).toBe('javascript')
  })

  it('detects JSX from .jsx extension', () => {
    expect(detectLanguage('/src/Component.jsx')).toBe('jsx')
  })

  it('detects Python from .py extension', () => {
    expect(detectLanguage('/src/main.py')).toBe('python')
  })

  it('detects Rust from .rs extension', () => {
    expect(detectLanguage('/src/main.rs')).toBe('rust')
  })

  it('detects Go from .go extension', () => {
    expect(detectLanguage('/src/main.go')).toBe('go')
  })

  it('detects Java from .java extension', () => {
    expect(detectLanguage('/src/Main.java')).toBe('java')
  })

  it('detects C from .c extension', () => {
    expect(detectLanguage('/src/main.c')).toBe('c')
  })

  it('detects C from .h header extension', () => {
    expect(detectLanguage('/src/main.h')).toBe('c')
  })

  it('detects C++ from .cpp extension', () => {
    expect(detectLanguage('/src/main.cpp')).toBe('cpp')
  })

  it('detects C++ from .hpp extension', () => {
    expect(detectLanguage('/include/types.hpp')).toBe('cpp')
  })

  it('detects C# from .cs extension', () => {
    expect(detectLanguage('/src/Program.cs')).toBe('csharp')
  })

  it('detects CSS from .css extension', () => {
    expect(detectLanguage('/styles/app.css')).toBe('css')
  })

  it('detects HTML from .html extension', () => {
    expect(detectLanguage('/public/index.html')).toBe('html')
  })

  it('detects HTML from .htm extension', () => {
    expect(detectLanguage('/public/page.htm')).toBe('html')
  })

  it('detects JSON from .json extension', () => {
    expect(detectLanguage('/package.json')).toBe('json')
  })

  it('detects YAML from .yaml extension', () => {
    expect(detectLanguage('/config.yaml')).toBe('yaml')
  })

  it('detects YAML from .yml extension', () => {
    expect(detectLanguage('/config.yml')).toBe('yaml')
  })

  it('detects Markdown from .md extension', () => {
    expect(detectLanguage('/README.md')).toBe('markdown')
  })

  it('detects Bash from .sh extension', () => {
    expect(detectLanguage('/scripts/build.sh')).toBe('bash')
  })

  it('detects SQL from .sql extension', () => {
    expect(detectLanguage('/migrations/001.sql')).toBe('sql')
  })

  it('detects PHP from .php extension', () => {
    expect(detectLanguage('/src/index.php')).toBe('php')
  })

  it('falls back to text for unknown extensions', () => {
    expect(detectLanguage('/file.xyz')).toBe('text')
  })

  it('falls back to text for files without extensions', () => {
    expect(detectLanguage('/Makefile')).toBe('text')
  })

  it('handles case insensitivity via lowercase', () => {
    // The function lowercases the extension
    expect(detectLanguage('/file.PY')).toBe('python')
    expect(detectLanguage('/file.TS')).toBe('typescript')
  })
})

describe('getLanguageExtension', () => {
  it('returns non-empty extensions for typescript', () => {
    const exts = getLanguageExtension('typescript')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for tsx', () => {
    const exts = getLanguageExtension('tsx')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for javascript', () => {
    const exts = getLanguageExtension('javascript')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for jsx', () => {
    const exts = getLanguageExtension('jsx')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for python', () => {
    const exts = getLanguageExtension('python')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for html', () => {
    const exts = getLanguageExtension('html')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for css', () => {
    const exts = getLanguageExtension('css')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for json', () => {
    const exts = getLanguageExtension('json')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for markdown', () => {
    const exts = getLanguageExtension('markdown')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for rust', () => {
    const exts = getLanguageExtension('rust')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for c and cpp', () => {
    const cExts = getLanguageExtension('c')
    const cppExts = getLanguageExtension('cpp')
    expect(cExts.length).toBeGreaterThan(0)
    expect(cppExts.length).toBeGreaterThan(0)
  })

  it('returns same extensions for c and cpp', () => {
    const cExts = getLanguageExtension('c')
    const cppExts = getLanguageExtension('cpp')
    expect(cExts).toEqual(cppExts)
  })

  it('returns non-empty extensions for java', () => {
    const exts = getLanguageExtension('java')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for go', () => {
    const exts = getLanguageExtension('go')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for yaml', () => {
    const exts = getLanguageExtension('yaml')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for xml', () => {
    const exts = getLanguageExtension('xml')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for sql', () => {
    const exts = getLanguageExtension('sql')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for php', () => {
    const exts = getLanguageExtension('php')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns non-empty extensions for csharp', () => {
    const exts = getLanguageExtension('csharp')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns empty array for unsupported language', () => {
    expect(getLanguageExtension('brainfuck')).toEqual([])
  })

  it('returns empty array for text', () => {
    expect(getLanguageExtension('text')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(getLanguageExtension('')).toEqual([])
  })
})
