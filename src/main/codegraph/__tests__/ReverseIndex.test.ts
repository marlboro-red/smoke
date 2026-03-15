import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReverseIndex } from '../ReverseIndex'
import { FilenameIndex } from '../FilenameIndex'
import * as fs from 'fs/promises'
import type { PathAliases } from '../importResolver'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  open: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
}))

/**
 * Create a mock FilenameIndex with the given file→content pairs.
 * The index will report all keys as indexed files and support lookup.
 */
function createMockIndex(files: Record<string, string>): FilenameIndex {
  const paths = new Set(Object.keys(files))
  const index = {
    has: (p: string) => paths.has(p),
    lookup: (basename: string) => {
      const matches: string[] = []
      for (const p of paths) {
        if (p.endsWith('/' + basename) || p === basename) matches.push(p)
      }
      return matches
    },
    get paths() {
      return paths
    },
    get size() {
      return paths.size
    },
    get root() {
      return '/project'
    },
  } as unknown as FilenameIndex
  return index
}

function mockFileRead(files: Record<string, string>): void {
  const mockedOpen = vi.mocked(fs.open)
  mockedOpen.mockImplementation(async (filePath: fs.PathLike) => {
    const p = String(filePath)
    const content = files[p]
    if (content === undefined) {
      throw new Error(`ENOENT: no such file: ${p}`)
    }
    const buf = Buffer.from(content, 'utf-8')
    return {
      read: async (target: Buffer, offset: number, length: number) => {
        const bytesToCopy = Math.min(length, buf.length)
        buf.copy(target, offset, 0, bytesToCopy)
        return { bytesRead: bytesToCopy, buffer: target }
      },
      close: async () => {},
    } as unknown as fs.FileHandle
  })
}

describe('ReverseIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds reverse index from project files', async () => {
    const files: Record<string, string> = {
      '/project/src/a.ts': 'import { foo } from "./b"\n',
      '/project/src/b.ts': 'export const foo = 1\n',
      '/project/src/c.ts': 'import { foo } from "./b"\nimport { bar } from "./a"\n',
    }

    const index = createMockIndex(files)
    mockFileRead(files)

    const ri = new ReverseIndex()
    await ri.build(index, {} as PathAliases)

    expect(ri.isBuilt).toBe(true)

    // b.ts is imported by a.ts and c.ts
    const bDeps = ri.getDependents('/project/src/b.ts')
    expect(bDeps).toHaveLength(2)
    expect(new Set(bDeps)).toEqual(new Set(['/project/src/a.ts', '/project/src/c.ts']))

    // a.ts is imported by c.ts
    const aDeps = ri.getDependents('/project/src/a.ts')
    expect(aDeps).toEqual(['/project/src/c.ts'])

    // c.ts is not imported by anyone
    expect(ri.getDependents('/project/src/c.ts')).toEqual([])
  })

  it('returns empty array for unknown files', async () => {
    const files: Record<string, string> = {
      '/project/src/a.ts': 'export const x = 1\n',
    }

    const index = createMockIndex(files)
    mockFileRead(files)

    const ri = new ReverseIndex()
    await ri.build(index, {} as PathAliases)

    expect(ri.getDependents('/project/src/unknown.ts')).toEqual([])
  })

  it('handles incremental file update', async () => {
    const files: Record<string, string> = {
      '/project/src/a.ts': 'import { foo } from "./b"\n',
      '/project/src/b.ts': 'export const foo = 1\n',
    }

    const index = createMockIndex(files)
    mockFileRead(files)

    const ri = new ReverseIndex()
    await ri.build(index, {} as PathAliases)

    // a.ts imports b.ts
    expect(ri.getDependents('/project/src/b.ts')).toEqual(['/project/src/a.ts'])

    // Now a.ts no longer imports b.ts
    files['/project/src/a.ts'] = 'export const bar = 2\n'
    mockFileRead(files)

    await ri.updateFile('/project/src/a.ts', index, {} as PathAliases)

    expect(ri.getDependents('/project/src/b.ts')).toEqual([])
  })

  it('handles file removal', async () => {
    const files: Record<string, string> = {
      '/project/src/a.ts': 'import { foo } from "./b"\n',
      '/project/src/b.ts': 'export const foo = 1\n',
    }

    const index = createMockIndex(files)
    mockFileRead(files)

    const ri = new ReverseIndex()
    await ri.build(index, {} as PathAliases)

    expect(ri.getDependents('/project/src/b.ts')).toEqual(['/project/src/a.ts'])

    ri.removeFile('/project/src/a.ts')

    expect(ri.getDependents('/project/src/b.ts')).toEqual([])
  })

  it('invalidate resets the index', async () => {
    const files: Record<string, string> = {
      '/project/src/a.ts': 'import { foo } from "./b"\n',
      '/project/src/b.ts': 'export const foo = 1\n',
    }

    const index = createMockIndex(files)
    mockFileRead(files)

    const ri = new ReverseIndex()
    await ri.build(index, {} as PathAliases)

    expect(ri.isBuilt).toBe(true)
    ri.invalidate()
    expect(ri.isBuilt).toBe(false)
    expect(ri.getDependents('/project/src/b.ts')).toEqual([])
  })

  it('deduplicates concurrent build calls', async () => {
    const files: Record<string, string> = {
      '/project/src/a.ts': 'export const x = 1\n',
    }

    const index = createMockIndex(files)
    mockFileRead(files)

    const ri = new ReverseIndex()

    // Call build twice concurrently
    const p1 = ri.build(index, {} as PathAliases)
    const p2 = ri.build(index, {} as PathAliases)

    // Both should resolve to the same build
    await Promise.all([p1, p2])
    expect(ri.isBuilt).toBe(true)
  })
})
