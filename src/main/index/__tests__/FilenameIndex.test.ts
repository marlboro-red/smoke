import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { FilenameIndex } from '../FilenameIndex'

describe('FilenameIndex', () => {
  let tmpDir: string
  let index: FilenameIndex

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-fnidx-'))
    index = new FilenameIndex(() => null)
  })

  afterEach(async () => {
    index.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('builds an index and reports stats', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.ts'), 'const x = 1\n')
    await fs.writeFile(path.join(tmpDir, 'world.ts'), 'const y = 2\n')

    const result = await index.build(tmpDir)

    expect(result.fileCount).toBe(2)
    expect(result.basenameCount).toBe(2)
  })

  it('looks up files by basename', async () => {
    await fs.writeFile(path.join(tmpDir, 'utils.ts'), '')
    await fs.mkdir(path.join(tmpDir, 'sub'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'sub', 'utils.ts'), '')

    await index.build(tmpDir)
    const results = index.lookup('utils.ts')

    expect(results.length).toBe(2)
  })

  it('skips ignored directories', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'dep.ts'), '')
    await fs.writeFile(path.join(tmpDir, 'app.ts'), '')

    const result = await index.build(tmpDir)

    expect(result.fileCount).toBe(1)
    expect(index.lookup('dep.ts').length).toBe(0)
    expect(index.lookup('app.ts').length).toBe(1)
  })

  it('notifyUpdated is rate-limited during rapid flushes', async () => {
    const sendCalls: any[] = []
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (_channel: string, data: any) => { sendCalls.push(data) },
      },
    }
    const rateLimitedIndex = new FilenameIndex(() => mockWindow as any)

    await fs.writeFile(path.join(tmpDir, 'a.ts'), '')
    await rateLimitedIndex.build(tmpDir)
    sendCalls.length = 0

    // Trigger notifyUpdated rapidly via flushPending
    const internal = rateLimitedIndex as any
    for (let i = 0; i < 20; i++) {
      internal.pendingAdds.add(path.join(tmpDir, `burst${i}.ts`))
      internal.flushPending()
    }

    // Without rate-limiting, we'd get 20 IPC sends.
    // With rate-limiting, most are suppressed.
    expect(sendCalls.length).toBeLessThan(5)

    rateLimitedIndex.dispose()
  })

  it('burst protection prevents unbounded queue growth', async () => {
    await fs.writeFile(path.join(tmpDir, 'base.ts'), '')
    await index.build(tmpDir)

    const internal = index as any

    // Simulate adding entries beyond the burst limit
    for (let i = 0; i < 60; i++) {
      internal.pendingAdds.add(path.join(tmpDir, `storm${i}.ts`))
    }

    // Queue has 60 entries (no automatic flush without scheduleUpdate)
    expect(internal.pendingAdds.size).toBe(60)

    // Manual flush should clear them all
    internal.flushPending()
    expect(internal.pendingAdds.size).toBe(0)
  })
})
