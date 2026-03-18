import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { readInstallMetadata } from '../installMetadata'

// Mock electron's net module
vi.mock('electron', () => ({
  net: {
    request: vi.fn(),
  },
}))

/** Create a valid manifest.json string. */
function validManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Test Author',
    defaultSize: { width: 400, height: 300 },
    entryPoint: 'index.js',
    permissions: [],
    ...overrides,
  })
}

describe('readInstallMetadata', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'smoke-installer-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns null when no metadata file exists', async () => {
    const pluginDir = join(tempDir, 'some-plugin')
    await mkdir(pluginDir, { recursive: true })

    const metadata = await readInstallMetadata(pluginDir)
    expect(metadata).toBeNull()
  })

  it('reads valid metadata', async () => {
    const pluginDir = join(tempDir, 'some-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, '.smoke-install.json'),
      JSON.stringify({
        source: 'npm',
        packageName: 'smoke-plugin-clock',
        installedAt: '2026-03-16T00:00:00Z',
      })
    )

    const metadata = await readInstallMetadata(pluginDir)
    expect(metadata).toEqual({
      source: 'npm',
      packageName: 'smoke-plugin-clock',
      installedAt: '2026-03-16T00:00:00Z',
    })
  })

  it('returns null for invalid JSON', async () => {
    const pluginDir = join(tempDir, 'some-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(join(pluginDir, '.smoke-install.json'), 'not json')

    const metadata = await readInstallMetadata(pluginDir)
    expect(metadata).toBeNull()
  })

  it('returns null for non-existent directory', async () => {
    const metadata = await readInstallMetadata(join(tempDir, 'nonexistent'))
    expect(metadata).toBeNull()
  })
})

describe('PluginInstaller', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'smoke-installer-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // We can't easily test installFromNpm and installFromUrl in unit tests
  // since they depend on external tools (npm, tar) and network access.
  // But we can test the uninstall and listInstalled logic.

  describe('uninstall', () => {
    it('removes a plugin that has install metadata', async () => {
      // Create a fake installed plugin
      const pluginDir = join(tempDir, 'test-plugin')
      await mkdir(pluginDir, { recursive: true })
      await writeFile(join(pluginDir, 'manifest.json'), validManifest())
      await writeFile(join(pluginDir, 'index.js'), '// entry')
      await writeFile(
        join(pluginDir, '.smoke-install.json'),
        JSON.stringify({
          source: 'npm',
          packageName: 'smoke-plugin-test',
          installedAt: new Date().toISOString(),
        })
      )

      // Dynamically import and construct with overridden path
      const { PluginInstaller } = await import('../PluginInstaller')
      const installer = new PluginInstaller()
      // Override the private globalPluginDir for testing
      ;(installer as unknown as { globalPluginDir: string }).globalPluginDir = tempDir

      const result = await installer.uninstall('test-plugin')
      expect(result.success).toBe(true)

      // Verify the directory was removed
      const entries = await readdir(tempDir)
      expect(entries).not.toContain('test-plugin')
    })

    it('refuses to uninstall a local plugin without force', async () => {
      // Create a plugin without install metadata (local plugin)
      const pluginDir = join(tempDir, 'local-plugin')
      await mkdir(pluginDir, { recursive: true })
      await writeFile(join(pluginDir, 'manifest.json'), validManifest({ name: 'local-plugin' }))
      await writeFile(join(pluginDir, 'index.js'), '// entry')

      const { PluginInstaller } = await import('../PluginInstaller')
      const installer = new PluginInstaller()
      ;(installer as unknown as { globalPluginDir: string }).globalPluginDir = tempDir

      const result = await installer.uninstall('local-plugin')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not installed via the plugin manager')

      // Plugin should still exist
      const entries = await readdir(tempDir)
      expect(entries).toContain('local-plugin')
    })

    it('force-removes a local plugin', async () => {
      const pluginDir = join(tempDir, 'local-plugin')
      await mkdir(pluginDir, { recursive: true })
      await writeFile(join(pluginDir, 'manifest.json'), validManifest({ name: 'local-plugin' }))
      await writeFile(join(pluginDir, 'index.js'), '// entry')

      const { PluginInstaller } = await import('../PluginInstaller')
      const installer = new PluginInstaller()
      ;(installer as unknown as { globalPluginDir: string }).globalPluginDir = tempDir

      const result = await installer.uninstall('local-plugin', true)
      expect(result.success).toBe(true)
    })

    it('returns error for non-existent plugin', async () => {
      const { PluginInstaller } = await import('../PluginInstaller')
      const installer = new PluginInstaller()
      ;(installer as unknown as { globalPluginDir: string }).globalPluginDir = tempDir

      const result = await installer.uninstall('nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('listInstalled', () => {
    it('returns empty array when no plugins exist', async () => {
      const { PluginInstaller } = await import('../PluginInstaller')
      const installer = new PluginInstaller()
      ;(installer as unknown as { globalPluginDir: string }).globalPluginDir = join(tempDir, 'nonexistent')

      const result = await installer.listInstalled()
      expect(result).toEqual([])
    })

    it('returns only plugins with install metadata', async () => {
      // Create an npm-installed plugin
      const npmPlugin = join(tempDir, 'npm-plugin')
      await mkdir(npmPlugin, { recursive: true })
      await writeFile(
        join(npmPlugin, '.smoke-install.json'),
        JSON.stringify({ source: 'npm', packageName: 'p', installedAt: '2026-01-01T00:00:00Z' })
      )

      // Create a local plugin (no metadata)
      const localPlugin = join(tempDir, 'local-plugin')
      await mkdir(localPlugin, { recursive: true })
      await writeFile(join(localPlugin, 'manifest.json'), validManifest())

      const { PluginInstaller } = await import('../PluginInstaller')
      const installer = new PluginInstaller()
      ;(installer as unknown as { globalPluginDir: string }).globalPluginDir = tempDir

      const result = await installer.listInstalled()
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('npm-plugin')
      expect(result[0].metadata.source).toBe('npm')
    })
  })

  describe('downloadFile redirect limit', () => {
    it('throws after exceeding max redirects', async () => {
      const { net } = await import('electron')
      const mockRequest = vi.mocked(net.request)

      // Each request returns a 302 redirect back to the same URL (circular)
      mockRequest.mockImplementation(() => {
        const req = {
          on: vi.fn((event: string, cb: (resp: unknown) => void) => {
            if (event === 'response') {
              // Fire the response callback asynchronously
              queueMicrotask(() =>
                cb({
                  statusCode: 302,
                  headers: { location: 'https://example.com/loop' },
                  on: vi.fn(),
                })
              )
            }
            return req
          }),
          end: vi.fn(),
          abort: vi.fn(),
        }
        return req as unknown as ReturnType<typeof net.request>
      })

      const { PluginInstaller } = await import('../PluginInstaller')
      const installer = new PluginInstaller()

      // Access private method via bracket notation
      const downloadFile = (installer as unknown as Record<string, Function>)['downloadFile'].bind(installer)

      await expect(downloadFile('https://example.com/loop', join(tempDir, 'out.tar.gz'))).rejects.toThrow(
        /Too many redirects/
      )

      // Should have made at most MAX_REDIRECTS + 1 requests (0 through 5, then throw on 6th call)
      expect(mockRequest.mock.calls.length).toBeLessThanOrEqual(7)
    })
  })
})
