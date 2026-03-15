import { describe, it, expect, beforeEach } from 'vitest'
import {
  assemblyPreviewStore,
  groupFilesByModule,
  type PreviewFile,
} from '../assemblyPreviewStore'
import type { ContextCollectResult, ContextFile } from '../../../preload/types'

function makeCollectResult(files: ContextFile[]): ContextCollectResult {
  return {
    files,
    parsedTask: {
      intent: 'fix',
      keywords: ['auth', 'login'],
      filePatterns: [],
      includeFileTypes: ['source'],
      usedAi: false,
    },
    structureMap: null,
    timing: { parse: 1, search: 2, structure: 3, graph: 4, scoring: 5, total: 15 },
  }
}

function makeFile(overrides: Partial<ContextFile> = {}): ContextFile {
  return {
    filePath: '/project/src/auth.ts',
    relevance: 0.85,
    imports: [],
    importedBy: [],
    source: 'search',
    ...overrides,
  }
}

describe('assemblyPreviewStore', () => {
  beforeEach(() => {
    assemblyPreviewStore.getState().close()
  })

  it('starts closed with empty state', () => {
    const state = assemblyPreviewStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.files).toEqual([])
    expect(state.parsedTask).toBeNull()
  })

  it('showPreview opens the store and populates files', () => {
    const result = makeCollectResult([
      makeFile({ filePath: '/project/src/auth.ts', relevance: 0.85 }),
      makeFile({ filePath: '/project/src/login.ts', relevance: 0.6 }),
    ])

    assemblyPreviewStore.getState().showPreview(result, '/project', 'fix auth bug')

    const state = assemblyPreviewStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.files).toHaveLength(2)
    expect(state.files[0].selected).toBe(true)
    expect(state.files[0].basename).toBe('auth.ts')
    expect(state.files[0].relativePath).toBe('src/auth.ts')
    expect(state.parsedTask?.intent).toBe('fix')
    expect(state.taskDescription).toBe('fix auth bug')
    expect(state.projectRoot).toBe('/project')
  })

  it('close resets all state', () => {
    const result = makeCollectResult([makeFile()])
    assemblyPreviewStore.getState().showPreview(result, '/project', 'test')
    assemblyPreviewStore.getState().close()

    const state = assemblyPreviewStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.files).toEqual([])
    expect(state.parsedTask).toBeNull()
    expect(state.projectRoot).toBe('')
    expect(state.taskDescription).toBe('')
  })

  it('toggleFile flips selected state', () => {
    const result = makeCollectResult([makeFile({ filePath: '/project/src/a.ts' })])
    assemblyPreviewStore.getState().showPreview(result, '/project', 'test')

    expect(assemblyPreviewStore.getState().files[0].selected).toBe(true)
    assemblyPreviewStore.getState().toggleFile('/project/src/a.ts')
    expect(assemblyPreviewStore.getState().files[0].selected).toBe(false)
    assemblyPreviewStore.getState().toggleFile('/project/src/a.ts')
    expect(assemblyPreviewStore.getState().files[0].selected).toBe(true)
  })

  it('selectAll and deselectAll affect all files', () => {
    const result = makeCollectResult([
      makeFile({ filePath: '/project/src/a.ts' }),
      makeFile({ filePath: '/project/src/b.ts' }),
    ])
    assemblyPreviewStore.getState().showPreview(result, '/project', 'test')

    assemblyPreviewStore.getState().deselectAll()
    expect(assemblyPreviewStore.getState().files.every((f) => !f.selected)).toBe(true)

    assemblyPreviewStore.getState().selectAll()
    expect(assemblyPreviewStore.getState().files.every((f) => f.selected)).toBe(true)
  })

  it('addFile adds a new file with selected=true', () => {
    const result = makeCollectResult([makeFile({ filePath: '/project/src/a.ts' })])
    assemblyPreviewStore.getState().showPreview(result, '/project', 'test')

    assemblyPreviewStore.getState().addFile('/project/src/new.ts')

    const state = assemblyPreviewStore.getState()
    expect(state.files).toHaveLength(2)
    const added = state.files.find((f) => f.filePath === '/project/src/new.ts')
    expect(added).toBeDefined()
    expect(added!.selected).toBe(true)
    expect(added!.basename).toBe('new.ts')
    expect(added!.relativePath).toBe('src/new.ts')
    expect(added!.source).toBe('search')
    expect(added!.relevance).toBe(0)
  })

  it('addFile does not add duplicates', () => {
    const result = makeCollectResult([makeFile({ filePath: '/project/src/a.ts' })])
    assemblyPreviewStore.getState().showPreview(result, '/project', 'test')

    assemblyPreviewStore.getState().addFile('/project/src/a.ts')
    expect(assemblyPreviewStore.getState().files).toHaveLength(1)
  })

  it('removeFile removes a file', () => {
    const result = makeCollectResult([
      makeFile({ filePath: '/project/src/a.ts' }),
      makeFile({ filePath: '/project/src/b.ts' }),
    ])
    assemblyPreviewStore.getState().showPreview(result, '/project', 'test')

    assemblyPreviewStore.getState().removeFile('/project/src/a.ts')
    expect(assemblyPreviewStore.getState().files).toHaveLength(1)
    expect(assemblyPreviewStore.getState().files[0].filePath).toBe('/project/src/b.ts')
  })

  it('getSelectedFiles returns only selected files without preview-only fields', () => {
    const result = makeCollectResult([
      makeFile({ filePath: '/project/src/a.ts', relevance: 0.9 }),
      makeFile({ filePath: '/project/src/b.ts', relevance: 0.5 }),
    ])
    assemblyPreviewStore.getState().showPreview(result, '/project', 'test')
    assemblyPreviewStore.getState().toggleFile('/project/src/b.ts')

    const selected = assemblyPreviewStore.getState().getSelectedFiles()
    expect(selected).toHaveLength(1)
    expect(selected[0].filePath).toBe('/project/src/a.ts')
    // Should not have preview-only fields
    expect((selected[0] as Record<string, unknown>)['selected']).toBeUndefined()
    expect((selected[0] as Record<string, unknown>)['basename']).toBeUndefined()
    expect((selected[0] as Record<string, unknown>)['relativePath']).toBeUndefined()
  })
})

describe('groupFilesByModule', () => {
  function makePreviewFile(overrides: Partial<PreviewFile> = {}): PreviewFile {
    return {
      filePath: '/project/src/file.ts',
      relevance: 0.5,
      imports: [],
      importedBy: [],
      source: 'search',
      selected: true,
      basename: 'file.ts',
      relativePath: 'src/file.ts',
      ...overrides,
    }
  }

  it('groups files by moduleId', () => {
    const files: PreviewFile[] = [
      makePreviewFile({ filePath: '/a', basename: 'a', moduleId: 'renderer', relevance: 0.8 }),
      makePreviewFile({ filePath: '/b', basename: 'b', moduleId: 'main', relevance: 0.6 }),
      makePreviewFile({ filePath: '/c', basename: 'c', moduleId: 'renderer', relevance: 0.9 }),
    ]

    const groups = groupFilesByModule(files)
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('main')
    expect(groups[1].label).toBe('renderer')
    expect(groups[1].files).toHaveLength(2)
  })

  it('puts files without moduleId into "Other" group at the end', () => {
    const files: PreviewFile[] = [
      makePreviewFile({ filePath: '/a', basename: 'a', moduleId: undefined }),
      makePreviewFile({ filePath: '/b', basename: 'b', moduleId: 'main' }),
    ]

    const groups = groupFilesByModule(files)
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('main')
    expect(groups[1].label).toBe('Other')
  })

  it('sorts files within groups by relevance (descending)', () => {
    const files: PreviewFile[] = [
      makePreviewFile({ filePath: '/a', basename: 'a', moduleId: 'src', relevance: 0.3 }),
      makePreviewFile({ filePath: '/b', basename: 'b', moduleId: 'src', relevance: 0.9 }),
      makePreviewFile({ filePath: '/c', basename: 'c', moduleId: 'src', relevance: 0.6 }),
    ]

    const groups = groupFilesByModule(files)
    expect(groups[0].files.map((f) => f.basename)).toEqual(['b', 'c', 'a'])
  })

  it('returns empty array for empty input', () => {
    expect(groupFilesByModule([])).toEqual([])
  })
})
