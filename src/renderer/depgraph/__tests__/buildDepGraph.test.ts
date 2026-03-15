import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sessionStore, findFileSessionByPath } from '../../stores/sessionStore'
import { connectorStore } from '../../stores/connectorStore'
import { preferencesStore } from '../../stores/preferencesStore'
import {
  clearActiveGraph,
  clearImportCache,
  getGraphSessionId,
  isInActiveGraph,
  getActiveGraphEntries,
} from '../GraphCache'
import type { CodeGraphResult } from '../../../preload/types'

// Mock smokeAPI
const mockBuild = vi.fn()
const mockExpand = vi.fn()
const mockReadfile = vi.fn()
const mockWatch = vi.fn()

Object.defineProperty(globalThis, 'window', {
  value: {
    smokeAPI: {
      codegraph: {
        build: mockBuild,
        expand: mockExpand,
      },
      fs: {
        readfile: mockReadfile,
        watch: mockWatch,
      },
    },
  },
  writable: true,
})

// Import after mocks are set up
const { buildDepGraph, expandDepGraph } = await import('../buildDepGraph')

function makeCodeGraphResult(opts: {
  rootPath: string
  nodes: Array<{ filePath: string; imports?: string[]; depth?: number }>
  edges: Array<{ from: string; to: string; type?: string }>
  positions: Array<{ filePath: string; x: number; y: number; depth?: number }>
}): CodeGraphResult {
  return {
    graph: {
      nodes: opts.nodes.map((n) => ({
        filePath: n.filePath,
        imports: n.imports ?? [],
        importedBy: [],
        depth: n.depth ?? 0,
      })),
      edges: opts.edges.map((e) => ({
        from: e.from,
        to: e.to,
        type: (e.type ?? 'import') as 'import' | 'require' | 'use',
      })),
    },
    rootPath: opts.rootPath,
    fileCount: opts.nodes.length,
    edgeCount: opts.edges.length,
    layout: {
      positions: opts.positions.map((p) => ({
        filePath: p.filePath,
        x: p.x,
        y: p.y,
        depth: p.depth ?? 0,
      })),
      bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    },
  }
}

describe('buildDepGraph', () => {
  beforeEach(() => {
    // Reset stores
    const sessions = sessionStore.getState().sessions
    for (const id of sessions.keys()) {
      sessionStore.getState().removeSession(id)
    }
    const connectors = connectorStore.getState().connectors
    for (const id of connectors.keys()) {
      connectorStore.getState().removeConnector(id)
    }
    clearActiveGraph()
    clearImportCache()
    preferencesStore.getState().setLaunchCwd('/project')

    // Reset mocks
    mockBuild.mockReset()
    mockExpand.mockReset()
    mockReadfile.mockReset()
    mockWatch.mockReset()

    // Default readfile mock
    mockReadfile.mockResolvedValue({ content: '// file content', size: 15 })
  })

  it('calls codegraph:build IPC and creates file sessions for each node', async () => {
    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'import { b } from "./b"',
      'typescript',
      { x: 100, y: 200 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/b.ts'], depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [{ from: '/project/src/a.ts', to: '/project/src/b.ts' }],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    // Should call IPC build
    expect(mockBuild).toHaveBeenCalledWith('/project/src/a.ts', '/project')

    // Should have created a session for b.ts
    const bSession = findFileSessionByPath('/project/src/b.ts')
    expect(bSession).toBeDefined()
    expect(bSession!.type).toBe('file')

    // b.ts should be positioned at layout offset from root
    // root is at (100,200), layout root is at (0,0), so offset = (100,200)
    // b.ts layout position is (720,0), so canvas position = (820, 200)
    expect(bSession!.position.x).toBe(820)
    expect(bSession!.position.y).toBe(200)
  })

  it('creates connectors for graph edges', async () => {
    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'source code',
      'typescript',
      { x: 0, y: 0 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/b.ts'], depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [{ from: '/project/src/a.ts', to: '/project/src/b.ts', type: 'import' }],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    const connectors = Array.from(connectorStore.getState().connectors.values())
    expect(connectors.length).toBe(1)
    expect(connectors[0].sourceId).toBe(rootSession.id)

    const bSession = findFileSessionByPath('/project/src/b.ts')
    expect(connectors[0].targetId).toBe(bSession!.id)
    expect(connectors[0].label).toBe('import')
    expect(connectors[0].color).toBe('#4A90D9')
  })

  it('registers nodes in GraphCache', async () => {
    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'code',
      'typescript',
      { x: 0, y: 0 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    expect(isInActiveGraph('/project/src/a.ts')).toBe(true)
    expect(isInActiveGraph('/project/src/b.ts')).toBe(true)
    expect(getGraphSessionId('/project/src/a.ts')).toBe(rootSession.id)
  })

  it('watches files for changes after materialization', async () => {
    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'code',
      'typescript',
      { x: 0, y: 0 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    expect(mockWatch).toHaveBeenCalledWith('/project/src/a.ts')
    expect(mockWatch).toHaveBeenCalledWith('/project/src/b.ts')
  })

  it('reuses existing file sessions instead of creating duplicates', async () => {
    // Create a session for b.ts first
    const existingB = sessionStore.getState().createFileSession(
      '/project/src/b.ts',
      'existing content',
      'typescript',
      { x: 500, y: 500 },
    )

    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'code',
      'typescript',
      { x: 0, y: 0 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/b.ts'], depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [{ from: '/project/src/a.ts', to: '/project/src/b.ts' }],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    // Should not have created a new session — reused existingB
    const bSessions = Array.from(sessionStore.getState().sessions.values())
      .filter((s) => s.type === 'file' && s.filePath === '/project/src/b.ts')
    expect(bSessions.length).toBe(1)
    expect(bSessions[0].id).toBe(existingB.id)
  })

  it('skips unreadable files without crashing', async () => {
    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'code',
      'typescript',
      { x: 0, y: 0 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/missing.ts'], depth: 0 },
        { filePath: '/project/src/missing.ts', depth: 1 },
      ],
      edges: [{ from: '/project/src/a.ts', to: '/project/src/missing.ts' }],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/missing.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockBuild.mockResolvedValue(result)
    mockReadfile.mockRejectedValue(new Error('ENOENT'))

    await buildDepGraph(rootSession)

    // Should not have created a session for missing.ts
    expect(findFileSessionByPath('/project/src/missing.ts')).toBeUndefined()

    // Should not crash — no connectors for missing node
    const connectors = Array.from(connectorStore.getState().connectors.values())
    expect(connectors.length).toBe(0)
  })

  it('clears previous graph cache before building', async () => {
    // Pre-populate cache
    const { registerGraphNode, setCachedImports } = await import('../GraphCache')
    registerGraphNode('/old/file.ts', 'old-session')
    setCachedImports('/old/file.ts', ['/old/dep.ts'])

    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'code',
      'typescript',
      { x: 0, y: 0 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [{ filePath: '/project/src/a.ts', depth: 0 }],
      edges: [],
      positions: [{ filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 }],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    // Old entries should be cleared
    expect(isInActiveGraph('/old/file.ts')).toBe(false)
  })

  it('handles multi-level dependency trees', async () => {
    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'code',
      'typescript',
      { x: 100, y: 100 },
    )

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/b.ts'], depth: 0 },
        { filePath: '/project/src/b.ts', imports: ['/project/src/c.ts'], depth: 1 },
        { filePath: '/project/src/c.ts', depth: 2 },
      ],
      edges: [
        { from: '/project/src/a.ts', to: '/project/src/b.ts' },
        { from: '/project/src/b.ts', to: '/project/src/c.ts' },
      ],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
        { filePath: '/project/src/c.ts', x: 1440, y: 0, depth: 2 },
      ],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    expect(findFileSessionByPath('/project/src/b.ts')).toBeDefined()
    expect(findFileSessionByPath('/project/src/c.ts')).toBeDefined()

    const connectors = Array.from(connectorStore.getState().connectors.values())
    expect(connectors.length).toBe(2)

    expect(getActiveGraphEntries().size).toBe(3)
  })

  it('does not create duplicate connectors', async () => {
    const rootSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts',
      'code',
      'typescript',
      { x: 0, y: 0 },
    )

    const bSession = sessionStore.getState().createFileSession(
      '/project/src/b.ts',
      'code',
      'typescript',
      { x: 720, y: 0 },
    )

    // Pre-create a connector
    connectorStore.getState().addConnector(rootSession.id, bSession.id, {
      label: 'import',
      color: '#4A90D9',
    })

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/b.ts'], depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [{ from: '/project/src/a.ts', to: '/project/src/b.ts' }],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockBuild.mockResolvedValue(result)

    await buildDepGraph(rootSession)

    const connectors = Array.from(connectorStore.getState().connectors.values())
    expect(connectors.length).toBe(1)
  })
})

describe('expandDepGraph', () => {
  beforeEach(() => {
    const sessions = sessionStore.getState().sessions
    for (const id of sessions.keys()) {
      sessionStore.getState().removeSession(id)
    }
    const connectors = connectorStore.getState().connectors
    for (const id of connectors.keys()) {
      connectorStore.getState().removeConnector(id)
    }
    clearActiveGraph()
    clearImportCache()
    preferencesStore.getState().setLaunchCwd('/project')

    mockBuild.mockReset()
    mockExpand.mockReset()
    mockReadfile.mockReset()
    mockWatch.mockReset()
    mockReadfile.mockResolvedValue({ content: '// content', size: 10 })
  })

  it('calls codegraph:expand IPC with existing graph state', async () => {
    // Set up existing graph state
    const { registerGraphNode } = await import('../GraphCache')
    const aSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts', 'code', 'typescript', { x: 0, y: 0 },
    )
    registerGraphNode('/project/src/a.ts', aSession.id)

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/b.ts'], depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [{ from: '/project/src/a.ts', to: '/project/src/b.ts' }],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockExpand.mockResolvedValue(result)

    await expandDepGraph('/project/src/a.ts')

    expect(mockExpand).toHaveBeenCalled()
    const callArgs = mockExpand.mock.calls[0]
    expect(callArgs[2]).toBe('/project/src/a.ts') // expandPath
    expect(callArgs[3]).toBe('/project') // projectRoot
  })

  it('only creates sessions for new nodes', async () => {
    const { registerGraphNode } = await import('../GraphCache')
    const aSession = sessionStore.getState().createFileSession(
      '/project/src/a.ts', 'code', 'typescript', { x: 0, y: 0 },
    )
    registerGraphNode('/project/src/a.ts', aSession.id)

    const result = makeCodeGraphResult({
      rootPath: '/project/src/a.ts',
      nodes: [
        { filePath: '/project/src/a.ts', imports: ['/project/src/b.ts'], depth: 0 },
        { filePath: '/project/src/b.ts', depth: 1 },
      ],
      edges: [{ from: '/project/src/a.ts', to: '/project/src/b.ts' }],
      positions: [
        { filePath: '/project/src/a.ts', x: 0, y: 0, depth: 0 },
        { filePath: '/project/src/b.ts', x: 720, y: 0, depth: 1 },
      ],
    })

    mockExpand.mockResolvedValue(result)

    await expandDepGraph('/project/src/a.ts')

    // b.ts should be created as new
    expect(findFileSessionByPath('/project/src/b.ts')).toBeDefined()

    // a.ts should still be the original session (not recreated)
    const aSessions = Array.from(sessionStore.getState().sessions.values())
      .filter((s) => s.type === 'file' && s.filePath === '/project/src/a.ts')
    expect(aSessions.length).toBe(1)
    expect(aSessions[0].id).toBe(aSession.id)
  })
})
