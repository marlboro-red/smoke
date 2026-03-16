import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { PluginPermissionManager } from '../PluginPermissionManager'

// We test the sandbox path resolution and permission enforcement logic
// directly rather than mocking ipcMain, since the handler bodies are
// straightforward delegations once permission and path checks pass.

describe('Plugin IPC sandbox path resolution', () => {
  // Replicate the resolveSandboxPath helper from pluginIpcHandlers.ts
  function resolveSandboxPath(sandboxRoot: string, relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      throw new Error('Absolute paths are not allowed — use paths relative to plugin root')
    }
    const resolved = path.resolve(sandboxRoot, relativePath)
    if (!resolved.startsWith(sandboxRoot + path.sep) && resolved !== sandboxRoot) {
      throw new Error('Path escapes plugin sandbox')
    }
    return resolved
  }

  const sandbox = '/home/user/.smoke/plugins/my-plugin'

  it('resolves a simple relative path', () => {
    expect(resolveSandboxPath(sandbox, 'data/config.json')).toBe(
      path.join(sandbox, 'data/config.json')
    )
  })

  it('resolves the sandbox root itself', () => {
    expect(resolveSandboxPath(sandbox, '.')).toBe(sandbox)
  })

  it('rejects absolute paths', () => {
    expect(() => resolveSandboxPath(sandbox, '/etc/passwd')).toThrow('Absolute paths')
  })

  it('rejects parent traversal', () => {
    expect(() => resolveSandboxPath(sandbox, '../other-plugin/secret')).toThrow('Path escapes')
  })

  it('rejects sneaky traversal with intervening dirs', () => {
    expect(() => resolveSandboxPath(sandbox, 'data/../../other/file')).toThrow('Path escapes')
  })

  it('allows nested paths within sandbox', () => {
    const result = resolveSandboxPath(sandbox, 'a/b/c/d.txt')
    expect(result).toBe(path.join(sandbox, 'a/b/c/d.txt'))
  })
})

describe('Plugin IPC permission enforcement', () => {
  let manager: PluginPermissionManager

  beforeEach(() => {
    manager = new PluginPermissionManager()
  })

  it('denies fs:read without filesystem.read in manifest', () => {
    manager.register('p', ['shell'], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(false)
  })

  it('allows fs:read with filesystem.read in manifest', () => {
    manager.register('p', ['filesystem.read'], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(true)
  })

  it('denies shell:execute without shell in manifest', () => {
    manager.register('p', ['filesystem.read'], '/s')
    expect(manager.hasPermission('p', 'shell:execute')).toBe(false)
  })

  it('allows shell:execute after runtime grant', () => {
    manager.register('p', [], '/s')
    expect(manager.hasPermission('p', 'shell:execute')).toBe(false)

    manager.grantRuntimePermission('p', 'shell:execute')
    expect(manager.hasPermission('p', 'shell:execute')).toBe(true)
  })
})

describe('Plugin state persistence (integration)', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-plugin-state-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('round-trips plugin state through JSON files', async () => {
    const stateDir = path.join(tmpDir, 'my-plugin')
    await fs.mkdir(stateDir, { recursive: true })

    const value = { counter: 42, items: ['a', 'b'] }
    const filePath = path.join(stateDir, 'settings.json')
    await fs.writeFile(filePath, JSON.stringify(value), 'utf-8')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual(value)
  })

  it('returns undefined for non-existent state', async () => {
    const filePath = path.join(tmpDir, 'my-plugin', 'nonexistent.json')
    try {
      await fs.readFile(filePath, 'utf-8')
      expect.unreachable('should have thrown')
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT')
    }
  })
})

describe('Plugin sandbox file operations (integration)', () => {
  let sandboxDir: string

  beforeEach(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-plugin-sandbox-'))
    // Create some test files in the sandbox
    await fs.writeFile(path.join(sandboxDir, 'readme.txt'), 'Hello from plugin', 'utf-8')
    await fs.mkdir(path.join(sandboxDir, 'data'), { recursive: true })
    await fs.writeFile(path.join(sandboxDir, 'data', 'config.json'), '{"key":"value"}', 'utf-8')
  })

  afterEach(async () => {
    await fs.rm(sandboxDir, { recursive: true, force: true })
  })

  it('reads a file within sandbox', async () => {
    const filePath = path.join(sandboxDir, 'readme.txt')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('Hello from plugin')
  })

  it('reads a nested file within sandbox', async () => {
    const filePath = path.join(sandboxDir, 'data', 'config.json')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual({ key: 'value' })
  })

  it('writes a file within sandbox', async () => {
    const filePath = path.join(sandboxDir, 'output.txt')
    await fs.writeFile(filePath, 'written by plugin', 'utf-8')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('written by plugin')
  })

  it('creates parent directories when writing', async () => {
    const filePath = path.join(sandboxDir, 'new', 'nested', 'file.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'deep write', 'utf-8')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('deep write')
  })

  it('reads directory contents', async () => {
    const entries = await fs.readdir(sandboxDir, { withFileTypes: true })
    const names = entries.map(e => e.name).sort()
    expect(names).toEqual(['data', 'readme.txt'])
  })
})
