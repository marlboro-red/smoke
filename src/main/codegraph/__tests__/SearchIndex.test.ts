import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { SearchIndex } from '../SearchIndex'

describe('SearchIndex', () => {
  let tmpDir: string
  let index: SearchIndex

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-search-'))
    index = new SearchIndex(() => null) // no main window for tests
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('builds an index and reports stats', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.ts'), 'const greeting = "hello world"\n')
    await fs.writeFile(path.join(tmpDir, 'math.ts'), 'function add(a: number, b: number) { return a + b }\n')

    const result = await index.build(tmpDir)

    expect(result.fileCount).toBe(2)
    expect(result.tokenCount).toBeGreaterThan(0)

    const stats = index.getStats()
    expect(stats.fileCount).toBe(2)
    expect(stats.rootPath).toBe(tmpDir)
    expect(stats.indexing).toBe(false)
  })

  it('finds exact keyword matches', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'app.ts'),
      'function processPayment(amount: number) {\n  return charge(amount)\n}\n'
    )

    await index.build(tmpDir)
    const response = index.search('processPayment')

    expect(response.results.length).toBeGreaterThan(0)
    expect(response.results[0].filePath).toBe(path.join(tmpDir, 'app.ts'))
    expect(response.results[0].lineNumber).toBe(1)
    expect(response.results[0].lineContent).toContain('processPayment')
  })

  it('finds case-insensitive matches', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'service.ts'),
      'class UserService {\n  getUser(id: string) { return id }\n}\n'
    )

    await index.build(tmpDir)
    const response = index.search('userservice')

    expect(response.results.length).toBeGreaterThan(0)
    expect(response.results[0].lineContent).toContain('UserService')
  })

  it('returns multiple results across files', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'), 'import { logger } from "./logger"\n')
    await fs.writeFile(path.join(tmpDir, 'b.ts'), 'const logger = console.log\n')
    await fs.writeFile(path.join(tmpDir, 'c.ts'), 'function noMatch() {}\n')

    await index.build(tmpDir)
    const response = index.search('logger')

    // a.ts has "logger" twice on one line, b.ts has it once
    expect(response.totalMatches).toBe(3)
    const files = new Set(response.results.map(r => path.basename(r.filePath)))
    expect(files.has('a.ts')).toBe(true)
    expect(files.has('b.ts')).toBe(true)
    expect(files.has('c.ts')).toBe(false)
  })

  it('respects maxResults limit', async () => {
    // Create many files with the same keyword
    for (let i = 0; i < 10; i++) {
      await fs.writeFile(path.join(tmpDir, `file${i}.ts`), `const value = ${i}\n`)
    }

    await index.build(tmpDir)
    const response = index.search('const', 3)

    expect(response.results.length).toBe(3)
    expect(response.totalMatches).toBe(10)
  })

  it('reports match position within line', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'pos.ts'),
      '  const result = calculate()\n'
    )

    await index.build(tmpDir)
    const response = index.search('calculate')

    expect(response.results.length).toBe(1)
    const r = response.results[0]
    expect(r.matchStart).toBe(17)
    expect(r.matchEnd).toBe(26)
  })

  it('returns empty results for non-matching query', async () => {
    await fs.writeFile(path.join(tmpDir, 'empty.ts'), 'const x = 1\n')

    await index.build(tmpDir)
    const response = index.search('nonexistent_xyz_123')

    expect(response.results.length).toBe(0)
    expect(response.totalMatches).toBe(0)
  })

  it('skips node_modules and hidden directories', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'node_modules/secret.ts'), 'const secret = true\n')
    await fs.mkdir(path.join(tmpDir, '.hidden'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, '.hidden/hidden.ts'), 'const secret = true\n')
    await fs.writeFile(path.join(tmpDir, 'public.ts'), 'const secret = true\n')

    await index.build(tmpDir)

    expect(index.getStats().fileCount).toBe(1)
    const response = index.search('secret')
    expect(response.results.length).toBe(1)
    expect(path.basename(response.results[0].filePath)).toBe('public.ts')
  })

  it('supports incremental addFile', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'), 'const original = true\n')
    await index.build(tmpDir)

    expect(index.getStats().fileCount).toBe(1)

    // Add a new file
    const newFile = path.join(tmpDir, 'b.ts')
    await fs.writeFile(newFile, 'const added = true\n')
    await index.addFile(newFile)

    expect(index.getStats().fileCount).toBe(2)
    const response = index.search('added')
    expect(response.results.length).toBe(1)
  })

  it('supports removeFile', async () => {
    await fs.writeFile(path.join(tmpDir, 'keep.ts'), 'const keep = true\n')
    await fs.writeFile(path.join(tmpDir, 'remove.ts'), 'const remove = true\n')

    await index.build(tmpDir)
    expect(index.getStats().fileCount).toBe(2)

    index.removeFile(path.join(tmpDir, 'remove.ts'))
    expect(index.getStats().fileCount).toBe(1)

    const response = index.search('remove')
    expect(response.results.length).toBe(0)
  })

  it('reports duration in search response', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'), 'const x = 1\n')
    await index.build(tmpDir)

    const response = index.search('const')
    expect(response.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('boosts score for word boundary matches', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'boundary.ts'),
      'const processPayment = true\nconst preprocessPayment = true\n'
    )

    await index.build(tmpDir)
    const response = index.search('processPayment')

    // Both lines contain "processPayment" as substring
    expect(response.results.length).toBe(2)
    // Word boundary match (line 1) should score higher than mid-word match (line 2)
    expect(response.results[0].lineNumber).toBe(1)
    expect(response.results[0].score).toBeGreaterThan(response.results[1].score)
  })
})
