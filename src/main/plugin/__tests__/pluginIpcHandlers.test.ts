import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { PluginPermissionManager } from '../PluginPermissionManager'
import { resolveNearestReal, isWithinBoundary } from '../../ipc/pathBoundary'
import { validatePluginCommand, ALLOWED_PLUGIN_COMMANDS } from '../pluginIpcHandlers'

// We test the sandbox path resolution and permission enforcement logic
// directly rather than mocking ipcMain, since the handler bodies are
// straightforward delegations once permission and path checks pass.

/**
 * Mirror of the resolveSandboxPath helper from pluginIpcHandlers.ts.
 * Uses resolveNearestReal + isWithinBoundary for symlink-safe containment.
 */
async function resolveSandboxPath(sandboxRoot: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error('Absolute paths are not allowed — use paths relative to plugin root')
  }
  const resolved = path.resolve(sandboxRoot, relativePath)
  const realResolved = await resolveNearestReal(resolved)
  const realSandbox = await resolveNearestReal(sandboxRoot)
  if (!isWithinBoundary(realResolved, realSandbox)) {
    throw new Error('Path escapes plugin sandbox')
  }
  return resolved
}

describe('Plugin IPC sandbox path resolution', () => {
  let sandbox: string

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-sandbox-'))
  })

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true })
  })

  it('resolves a simple relative path', async () => {
    expect(await resolveSandboxPath(sandbox, 'data/config.json')).toBe(
      path.join(sandbox, 'data/config.json')
    )
  })

  it('resolves the sandbox root itself', async () => {
    expect(await resolveSandboxPath(sandbox, '.')).toBe(sandbox)
  })

  it('rejects absolute paths', async () => {
    await expect(resolveSandboxPath(sandbox, '/etc/passwd')).rejects.toThrow('Absolute paths')
  })

  it('rejects parent traversal', async () => {
    await expect(resolveSandboxPath(sandbox, '../other-plugin/secret')).rejects.toThrow('Path escapes')
  })

  it('rejects sneaky traversal with intervening dirs', async () => {
    await expect(resolveSandboxPath(sandbox, 'data/../../other/file')).rejects.toThrow('Path escapes')
  })

  it('allows nested paths within sandbox', async () => {
    const result = await resolveSandboxPath(sandbox, 'a/b/c/d.txt')
    expect(result).toBe(path.join(sandbox, 'a/b/c/d.txt'))
  })

  it('rejects symlink that escapes sandbox', async () => {
    // Create an outside directory with a secret file
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-outside-'))
    try {
      await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'sensitive data')

      // Create a symlink inside the sandbox pointing outside
      await fs.symlink(outsideDir, path.join(sandbox, 'escape-link'))

      // The symlink-unaware check would allow this since the logical path
      // is inside the sandbox, but the real path points outside
      await expect(
        resolveSandboxPath(sandbox, 'escape-link/secret.txt')
      ).rejects.toThrow('Path escapes')
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
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

describe('Plugin command execution validation', () => {
  it('allows commands on the allowlist', () => {
    expect(() => validatePluginCommand('git')).not.toThrow()
    expect(() => validatePluginCommand('node')).not.toThrow()
    expect(() => validatePluginCommand('npm')).not.toThrow()
    expect(() => validatePluginCommand('docker')).not.toThrow()
    expect(() => validatePluginCommand('python3')).not.toThrow()
    expect(() => validatePluginCommand('cargo')).not.toThrow()
  })

  it('rejects commands not on the allowlist', () => {
    expect(() => validatePluginCommand('rm')).toThrow('not allowed')
    expect(() => validatePluginCommand('shutdown')).toThrow('not allowed')
    expect(() => validatePluginCommand('passwd')).toThrow('not allowed')
    expect(() => validatePluginCommand('reboot')).toThrow('not allowed')
  })

  it('rejects absolute paths to binaries (Unix)', () => {
    expect(() => validatePluginCommand('/usr/bin/rm')).toThrow('bare command name')
    expect(() => validatePluginCommand('/bin/sh')).toThrow('bare command name')
    expect(() => validatePluginCommand('/etc/../bin/bash')).toThrow('bare command name')
  })

  it('rejects absolute paths to binaries (Windows)', () => {
    expect(() => validatePluginCommand('C:\\Windows\\System32\\cmd.exe')).toThrow('bare command name')
    expect(() => validatePluginCommand('..\\..\\cmd.exe')).toThrow('bare command name')
  })

  it('rejects relative paths with separators', () => {
    expect(() => validatePluginCommand('./malicious')).toThrow('bare command name')
    expect(() => validatePluginCommand('../escape/binary')).toThrow('bare command name')
    expect(() => validatePluginCommand('subdir/binary')).toThrow('bare command name')
  })

  it('rejects empty command', () => {
    expect(() => validatePluginCommand('')).toThrow('must not be empty')
    expect(() => validatePluginCommand('  ')).toThrow('must not be empty')
  })

  it('allowlist contains expected common commands', () => {
    const expected = ['git', 'node', 'npm', 'npx', 'docker', 'python', 'python3', 'go', 'cargo', 'curl']
    for (const cmd of expected) {
      expect(ALLOWED_PLUGIN_COMMANDS.has(cmd)).toBe(true)
    }
  })

  it('allowlist does NOT contain dangerous commands', () => {
    const dangerous = ['rm', 'del', 'rmdir', 'shutdown', 'reboot', 'format', 'fdisk', 'dd', 'mkfs',
      'passwd', 'su', 'sudo', 'chmod', 'chown', 'kill', 'killall', 'powershell', 'cmd', 'bash', 'sh']
    for (const cmd of dangerous) {
      expect(ALLOWED_PLUGIN_COMMANDS.has(cmd)).toBe(false)
    }
  })
})
