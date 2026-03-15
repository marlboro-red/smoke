import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore, findFileSessionByPath } from '../../stores/sessionStore'
import type { FileViewerSession } from '../../stores/sessionStore'
import { canvasStore } from '../../stores/canvasStore'
import { gridStore } from '../../stores/gridStore'
import { serializeCurrentLayout } from '../../layout/useLayoutPersistence'

describe('FileViewerSession', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  it('creates a file session with correct type and fields', () => {
    const session = sessionStore.getState().createFileSession(
      '/home/user/project/src/index.ts',
      'const x = 1;',
      'typescript'
    )
    expect(session.type).toBe('file')
    expect(session.filePath).toBe('/home/user/project/src/index.ts')
    expect(session.content).toBe('const x = 1;')
    expect(session.language).toBe('typescript')
    expect(session.title).toBe('index.ts')
    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('creates a file session with custom position', () => {
    const session = sessionStore.getState().createFileSession(
      '/tmp/test.py',
      'print("hello")',
      'python',
      { x: 200, y: 300 }
    )
    expect(session.position).toEqual({ x: 200, y: 300 })
  })

  it('creates a file session with default position', () => {
    const session = sessionStore.getState().createFileSession(
      '/tmp/test.py',
      'print("hello")',
      'python'
    )
    expect(session.position).toEqual({ x: 0, y: 0 })
  })

  it('creates a file session with default size', () => {
    const session = sessionStore.getState().createFileSession(
      '/tmp/test.py',
      '',
      'python'
    )
    expect(session.size).toEqual({ cols: 80, rows: 24, width: 640, height: 480 })
  })

  it('derives title from filename', () => {
    const session = sessionStore.getState().createFileSession(
      '/a/b/c/MyComponent.tsx',
      '',
      'tsx'
    )
    expect(session.title).toBe('MyComponent.tsx')
  })

  it('stores file sessions in the same sessions Map', () => {
    const terminal = sessionStore.getState().createSession('/tmp')
    const file = sessionStore.getState().createFileSession('/tmp/a.ts', '', 'typescript')
    const { sessions } = sessionStore.getState()
    expect(sessions.size).toBe(2)
    expect(sessions.get(terminal.id)?.type).toBe('terminal')
    expect(sessions.get(file.id)?.type).toBe('file')
  })

  it('increments zIndex across mixed session types', () => {
    const terminal = sessionStore.getState().createSession('/tmp')
    const file = sessionStore.getState().createFileSession('/tmp/a.ts', '', 'typescript')
    expect(file.zIndex).toBeGreaterThan(terminal.zIndex)
  })

  it('can remove a file session', () => {
    const session = sessionStore.getState().createFileSession('/tmp/a.ts', '', 'typescript')
    sessionStore.getState().removeSession(session.id)
    expect(sessionStore.getState().sessions.size).toBe(0)
  })

  it('can update a file session', () => {
    const session = sessionStore.getState().createFileSession('/tmp/a.ts', 'old', 'typescript')
    sessionStore.getState().updateSession(session.id, { title: 'Renamed' })
    expect(sessionStore.getState().sessions.get(session.id)!.title).toBe('Renamed')
  })

  it('can focus a file session', () => {
    const session = sessionStore.getState().createFileSession('/tmp/a.ts', '', 'typescript')
    sessionStore.getState().focusSession(session.id)
    expect(sessionStore.getState().focusedId).toBe(session.id)
  })

  it('can bring a file session to front', () => {
    const s1 = sessionStore.getState().createSession('/tmp')
    const s2 = sessionStore.getState().createFileSession('/tmp/a.ts', '', 'typescript')
    sessionStore.getState().bringToFront(s1.id)
    const updated = sessionStore.getState().sessions.get(s1.id)!
    expect(updated.zIndex).toBeGreaterThan(s2.zIndex)
  })
})

describe('findFileSessionByPath', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  it('returns undefined when no file sessions exist', () => {
    expect(findFileSessionByPath('/tmp/a.ts')).toBeUndefined()
  })

  it('returns undefined when path does not match any file session', () => {
    sessionStore.getState().createFileSession('/tmp/a.ts', 'code', 'typescript')
    expect(findFileSessionByPath('/tmp/b.ts')).toBeUndefined()
  })

  it('finds a file session by its path', () => {
    const session = sessionStore.getState().createFileSession('/tmp/a.ts', 'code', 'typescript')
    const found = findFileSessionByPath('/tmp/a.ts')
    expect(found).toBeDefined()
    expect(found!.id).toBe(session.id)
    expect(found!.filePath).toBe('/tmp/a.ts')
  })

  it('does not match terminal sessions', () => {
    sessionStore.getState().createSession('/tmp/a.ts')
    expect(findFileSessionByPath('/tmp/a.ts')).toBeUndefined()
  })

  it('finds the correct session among multiple file sessions', () => {
    sessionStore.getState().createFileSession('/tmp/a.ts', 'a', 'typescript')
    const target = sessionStore.getState().createFileSession('/tmp/b.ts', 'b', 'typescript')
    sessionStore.getState().createFileSession('/tmp/c.ts', 'c', 'typescript')

    const found = findFileSessionByPath('/tmp/b.ts')
    expect(found).toBeDefined()
    expect(found!.id).toBe(target.id)
  })
})

describe('layout serialization with file sessions', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
    canvasStore.setState({ panX: 0, panY: 0, zoom: 1.0, gridSize: 20 })
    gridStore.setState({ gridSize: 20, snapEnabled: true, showGrid: true })
  })

  it('serializes file sessions with filePath and language', () => {
    const session = sessionStore.getState().createFileSession(
      '/home/user/main.rs',
      'fn main() {}',
      'rust',
      { x: 100, y: 200 }
    )
    sessionStore.getState().updateSession(session.id, {
      title: 'main.rs',
      size: { cols: 80, rows: 24, width: 800, height: 600 },
    })

    const layout = serializeCurrentLayout('file-test')
    expect(layout.sessions).toHaveLength(1)
    expect(layout.sessions[0]).toEqual({
      type: 'file',
      title: 'main.rs',
      cwd: '',
      filePath: '/home/user/main.rs',
      language: 'rust',
      position: { x: 100, y: 200 },
      size: { width: 800, height: 600, cols: 80, rows: 24 },
    })
  })

  it('serializes mixed terminal and file sessions', () => {
    sessionStore.getState().createSession('/tmp', { x: 0, y: 0 })
    sessionStore.getState().createFileSession('/tmp/a.ts', 'code', 'typescript', { x: 700, y: 0 })

    const layout = serializeCurrentLayout('mixed')
    expect(layout.sessions).toHaveLength(2)
    expect(layout.sessions[0].type).toBe('terminal')
    expect(layout.sessions[0].cwd).toBe('/tmp')
    expect(layout.sessions[0]).not.toHaveProperty('filePath')
    expect(layout.sessions[1].type).toBe('file')
    expect(layout.sessions[1].filePath).toBe('/tmp/a.ts')
    expect(layout.sessions[1].language).toBe('typescript')
  })

  it('file sessions have correct serialized keys', () => {
    sessionStore.getState().createFileSession('/tmp/a.ts', 'code', 'typescript')

    const layout = serializeCurrentLayout('keys-test')
    const session = layout.sessions[0]
    const keys = Object.keys(session)
    expect(keys).toEqual(['type', 'title', 'cwd', 'position', 'size', 'filePath', 'language'])
    expect(session).not.toHaveProperty('id')
    expect(session).not.toHaveProperty('zIndex')
    expect(session).not.toHaveProperty('content')
    expect(session).not.toHaveProperty('createdAt')
  })
})
