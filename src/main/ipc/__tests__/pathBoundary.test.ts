import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { isWithinBoundary, resolveNearestReal, assertWithinHome } from '../pathBoundary'

describe('isWithinBoundary', () => {
  it('allows a path directly inside the boundary', () => {
    expect(isWithinBoundary('/home/alice/file.txt', '/home/alice')).toBe(true)
  })

  it('allows a deeply nested path inside the boundary', () => {
    expect(isWithinBoundary('/home/alice/projects/app/src/index.ts', '/home/alice')).toBe(true)
  })

  it('allows the boundary root itself', () => {
    expect(isWithinBoundary('/home/alice', '/home/alice')).toBe(true)
  })

  it('rejects path with matching prefix but different directory (alice-malicious)', () => {
    // This is the core bug: startsWith("/home/alice") passes for "/home/alice-malicious"
    expect(isWithinBoundary('/home/alice-malicious/file.txt', '/home/alice')).toBe(false)
  })

  it('rejects path outside the boundary entirely', () => {
    expect(isWithinBoundary('/etc/passwd', '/home/alice')).toBe(false)
  })

  it('rejects path traversal with ..', () => {
    expect(isWithinBoundary('/home/alice/../bob/secrets', '/home/alice')).toBe(false)
  })

  it('rejects path traversal deep inside then escaping', () => {
    expect(isWithinBoundary('/home/alice/projects/../../bob/file.txt', '/home/alice')).toBe(false)
  })

  it('allows path with .. that stays within boundary', () => {
    // /home/alice/a/../b → /home/alice/b (still inside)
    expect(isWithinBoundary('/home/alice/a/../b/file.txt', '/home/alice')).toBe(true)
  })

  it('rejects sibling directory', () => {
    expect(isWithinBoundary('/home/bob/file.txt', '/home/alice')).toBe(false)
  })

  it('handles trailing slashes on boundary', () => {
    expect(isWithinBoundary('/home/alice/file.txt', '/home/alice/')).toBe(true)
    expect(isWithinBoundary('/home/alice-malicious/file.txt', '/home/alice/')).toBe(false)
  })
})

describe('resolveNearestReal', () => {
  let tmpDir: string
  let symlinkDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-boundary-'))
    // Create a real subdirectory
    await fs.mkdir(path.join(tmpDir, 'real-dir'))
    await fs.writeFile(path.join(tmpDir, 'real-dir', 'file.txt'), 'hello')

    // Create a symlink pointing outside tmpDir
    symlinkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-escape-'))
    await fs.mkdir(path.join(symlinkDir, 'escaped'))
    await fs.symlink(
      path.join(symlinkDir, 'escaped'),
      path.join(tmpDir, 'sneaky-link')
    )
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.rm(symlinkDir, { recursive: true, force: true })
  })

  it('resolves an existing path through symlinks', async () => {
    const result = await resolveNearestReal(path.join(tmpDir, 'sneaky-link'))
    // Should resolve to the real target, not the symlink
    expect(result).toContain('smoke-escape-')
    expect(result).toContain('escaped')
  })

  it('resolves a non-existent file under an existing directory', async () => {
    const result = await resolveNearestReal(path.join(tmpDir, 'real-dir', 'new-file.txt'))
    expect(result).toContain('real-dir')
    expect(result).toContain('new-file.txt')
  })

  it('resolves a non-existent file under a symlink', async () => {
    const result = await resolveNearestReal(
      path.join(tmpDir, 'sneaky-link', 'new-file.txt')
    )
    // Should resolve the symlink, revealing the path is outside tmpDir
    expect(result).toContain('smoke-escape-')
    expect(result).toContain('new-file.txt')
  })
})

describe('assertWithinHome', () => {
  let tmpHome: string
  let outsideDir: string

  beforeAll(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-home-'))
    await fs.mkdir(path.join(tmpHome, 'projects'))

    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-outside-'))
    await fs.mkdir(path.join(outsideDir, 'evil'))

    // Create symlink inside tmpHome that points outside
    await fs.symlink(
      path.join(outsideDir, 'evil'),
      path.join(tmpHome, 'escape-link')
    )
  })

  afterAll(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true })
    await fs.rm(outsideDir, { recursive: true, force: true })
  })

  it('allows writing to a path inside home', async () => {
    await expect(
      assertWithinHome(path.join(tmpHome, 'projects', 'file.txt'), tmpHome)
    ).resolves.toBeUndefined()
  })

  it('rejects prefix-matching attack (home-malicious)', async () => {
    await expect(
      assertWithinHome(tmpHome + '-malicious/file.txt', tmpHome)
    ).rejects.toThrow('Access denied')
  })

  it('rejects .. traversal escaping home', async () => {
    await expect(
      assertWithinHome(path.join(tmpHome, '..', 'etc', 'passwd'), tmpHome)
    ).rejects.toThrow('Access denied')
  })

  it('rejects symlink escape from home', async () => {
    await expect(
      assertWithinHome(
        path.join(tmpHome, 'escape-link', 'payload.sh'),
        tmpHome
      )
    ).rejects.toThrow('Access denied')
  })

  it('rejects absolute path completely outside home', async () => {
    await expect(
      assertWithinHome('/etc/shadow', tmpHome)
    ).rejects.toThrow('Access denied')
  })
})
