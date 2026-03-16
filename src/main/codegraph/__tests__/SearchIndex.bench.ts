import { bench, describe, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SearchIndex } from '../SearchIndex'

// --- Fixture helpers ---

let tmpDir: string

function generateSourceFile(index: number): string {
  const imports = Array.from({ length: 5 }, (_, i) =>
    `import { util${i} } from './module${i}'`
  ).join('\n')
  const body = Array.from({ length: 20 }, (_, i) =>
    `function handler${index}_${i}(request: Request) { return response${i} }`
  ).join('\n')
  return `${imports}\n\n${body}\n`
}

function createFixtureFiles(dir: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const subdir = path.join(dir, `pkg${Math.floor(i / 100)}`)
    fs.mkdirSync(subdir, { recursive: true })
    fs.writeFileSync(
      path.join(subdir, `file${i}.ts`),
      generateSourceFile(i)
    )
  }
}

// --- Setup / teardown ---

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-bench-search-'))
  createFixtureFiles(path.join(tmpDir, 'build100'), 100)
  createFixtureFiles(path.join(tmpDir, 'build500'), 500)
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// --- Index build benchmarks ---

describe('SearchIndex build', () => {
  bench('build index — 100 files', async () => {
    const idx = new SearchIndex(() => null)
    await idx.build(path.join(tmpDir, 'build100'))
    idx.dispose()
  }, { iterations: 3, warmupIterations: 1 })

  bench('build index — 500 files', async () => {
    const idx = new SearchIndex(() => null)
    await idx.build(path.join(tmpDir, 'build500'))
    idx.dispose()
  }, { iterations: 3, warmupIterations: 1 })
})

// --- Search query benchmarks ---

describe('SearchIndex query', () => {
  let index: SearchIndex

  beforeAll(async () => {
    index = new SearchIndex(() => null)
    await index.build(path.join(tmpDir, 'build500'))
  })

  afterAll(() => {
    index?.dispose()
  })

  bench('search single token — "handler"', () => {
    index.search('handler')
  })

  bench('search multi-token — "handler request"', () => {
    index.search('handler request')
  })

  bench('search with low hit rate — "nonexistent"', () => {
    index.search('nonexistent')
  })

  bench('search with filename match — "file42"', () => {
    index.search('file42')
  })
})
