import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { PluginLoader } from '../PluginLoader'

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

describe('PluginLoader', () => {
  let globalDir: string
  let projectDir: string
  let tempBase: string

  beforeEach(async () => {
    tempBase = await mkdtemp(join(tmpdir(), 'smoke-plugin-test-'))
    globalDir = join(tempBase, 'global-plugins')
    projectDir = join(tempBase, 'project-plugins')
    await mkdir(globalDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempBase, { recursive: true, force: true })
  })

  /** Helper to create a plugin directory with manifest and entry point. */
  async function createPlugin(
    baseDir: string,
    name: string,
    manifest: string,
    createEntryPoint = true
  ): Promise<string> {
    const pluginDir = join(baseDir, name)
    await mkdir(pluginDir, { recursive: true })
    await writeFile(join(pluginDir, 'manifest.json'), manifest)
    if (createEntryPoint) {
      const parsed = JSON.parse(manifest)
      const entryPoint = parsed.entryPoint || 'index.js'
      const entryDir = join(pluginDir, entryPoint, '..')
      await mkdir(entryDir, { recursive: true })
      await writeFile(join(pluginDir, entryPoint), '// entry')
    }
    return pluginDir
  }

  // ── scanDirectory ─────────────────────────────────────────────

  describe('scanDirectory', () => {
    it('discovers a valid plugin', async () => {
      await createPlugin(globalDir, 'my-plugin', validManifest({ name: 'my-plugin' }))

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].manifest.name).toBe('my-plugin')
      expect(result.plugins[0].source).toBe('global')
      expect(result.errors).toHaveLength(0)
    })

    it('discovers multiple plugins', async () => {
      await createPlugin(globalDir, 'plugin-a', validManifest({ name: 'plugin-a' }))
      await createPlugin(globalDir, 'plugin-b', validManifest({ name: 'plugin-b' }))

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(2)
      const names = result.plugins.map((p) => p.manifest.name).sort()
      expect(names).toEqual(['plugin-a', 'plugin-b'])
    })

    it('skips directories without manifest.json', async () => {
      const pluginDir = join(globalDir, 'no-manifest')
      await mkdir(pluginDir)
      await writeFile(join(pluginDir, 'index.js'), '// no manifest')

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('No manifest.json')
    })

    it('reports error for invalid JSON in manifest', async () => {
      const pluginDir = join(globalDir, 'bad-json')
      await mkdir(pluginDir)
      await writeFile(join(pluginDir, 'manifest.json'), '{not valid json}')

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('Failed to read/parse manifest.json')
    })

    it('reports error for manifest failing validation', async () => {
      await createPlugin(
        globalDir,
        'bad-manifest',
        JSON.stringify({ name: 'INVALID NAME', version: 'not-semver' })
      )

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('Invalid manifest')
    })

    it('reports error when entry point file is missing', async () => {
      await createPlugin(
        globalDir,
        'missing-entry',
        validManifest({ name: 'missing-entry', entryPoint: 'src/missing.tsx' }),
        false // don't create entry point
      )

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('Entry point not found')
    })

    it('returns empty for non-existent directory', async () => {
      const loader = new PluginLoader()
      const result = await loader.scanDirectory('/nonexistent/path', 'global')

      expect(result.plugins).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('ignores files (non-directories) in plugins dir', async () => {
      await writeFile(join(globalDir, 'stray-file.txt'), 'not a plugin')
      await createPlugin(globalDir, 'real-plugin', validManifest({ name: 'real-plugin' }))

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].manifest.name).toBe('real-plugin')
    })

    it('resolves entry point path to absolute', async () => {
      await createPlugin(
        globalDir,
        'abs-test',
        validManifest({ name: 'abs-test', entryPoint: 'src/index.tsx' })
      )

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].entryPointPath).toBe(
        join(globalDir, 'abs-test', 'src', 'index.tsx')
      )
    })
  })

  // ── loadAll ───────────────────────────────────────────────────

  describe('loadAll', () => {
    it('loads plugins from both global and project directories', async () => {
      // Override the private dirs
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = projectDir

      await createPlugin(globalDir, 'global-plugin', validManifest({ name: 'global-plugin' }))
      await createPlugin(projectDir, 'project-plugin', validManifest({ name: 'project-plugin' }))

      const result = await loader.loadAll()

      expect(result.plugins).toHaveLength(2)
      const names = result.plugins.map((p) => p.manifest.name).sort()
      expect(names).toEqual(['global-plugin', 'project-plugin'])
    })

    it('project-local plugin overrides global plugin with same name', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = projectDir

      await createPlugin(
        globalDir,
        'shared-name',
        validManifest({ name: 'shared-name', version: '1.0.0' })
      )
      await createPlugin(
        projectDir,
        'shared-name',
        validManifest({ name: 'shared-name', version: '2.0.0' })
      )

      const result = await loader.loadAll()

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].manifest.name).toBe('shared-name')
      expect(result.plugins[0].manifest.version).toBe('2.0.0')
      expect(result.plugins[0].source).toBe('project')
    })

    it('populates getPlugins() and getPlugin()', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = null

      await createPlugin(globalDir, 'my-plugin', validManifest({ name: 'my-plugin' }))

      await loader.loadAll()

      expect(loader.getPlugins()).toHaveLength(1)
      expect(loader.getPlugin('my-plugin')).toBeDefined()
      expect(loader.getPlugin('my-plugin')!.manifest.name).toBe('my-plugin')
      expect(loader.getPlugin('nonexistent')).toBeUndefined()
    })

    it('clears previous state on reload', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = null

      await createPlugin(globalDir, 'plugin-a', validManifest({ name: 'plugin-a' }))
      await loader.loadAll()
      expect(loader.getPlugins()).toHaveLength(1)

      // Remove the plugin dir and reload
      await rm(join(globalDir, 'plugin-a'), { recursive: true, force: true })
      await loader.loadAll()
      expect(loader.getPlugins()).toHaveLength(0)
    })

    it('collects errors from both directories', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = projectDir

      // Create invalid plugin in global
      const badGlobal = join(globalDir, 'bad-global')
      await mkdir(badGlobal)
      await writeFile(join(badGlobal, 'manifest.json'), 'not json')

      // Create invalid plugin in project
      const badProject = join(projectDir, 'bad-project')
      await mkdir(badProject)
      await writeFile(join(badProject, 'manifest.json'), '{}')

      const result = await loader.loadAll()
      expect(result.errors).toHaveLength(2)
    })

    it('handles null projectDir (no project context)', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = null

      await createPlugin(globalDir, 'solo', validManifest({ name: 'solo' }))
      const result = await loader.loadAll()

      expect(result.plugins).toHaveLength(1)
    })
  })

  // ── watching ──────────────────────────────────────────────────

  describe('startWatching / stopWatching', () => {
    it('calls onChange when a file changes in watched directory', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = null

      await createPlugin(globalDir, 'watch-test', validManifest({ name: 'watch-test' }))
      await loader.loadAll()

      const onChange = vi.fn()
      loader.startWatching(onChange)

      // Trigger a file change
      await writeFile(
        join(globalDir, 'watch-test', 'manifest.json'),
        validManifest({ name: 'watch-test', version: '2.0.0' })
      )

      // Wait for debounce (300ms) + some buffer
      await new Promise((r) => setTimeout(r, 600))

      expect(onChange).toHaveBeenCalled()
      loader.stopWatching()
    })

    it('stopWatching cleans up watchers', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = null

      loader.startWatching(vi.fn())
      expect((loader as any).watchers.length).toBeGreaterThan(0)

      loader.stopWatching()
      expect((loader as any).watchers).toHaveLength(0)
    })

    it('dispose cleans up everything', async () => {
      const loader = new PluginLoader()
      ;(loader as any).globalDir = globalDir
      ;(loader as any).projectDir = null

      await createPlugin(globalDir, 'dispose-test', validManifest({ name: 'dispose-test' }))
      await loader.loadAll()
      loader.startWatching(vi.fn())

      loader.dispose()

      expect(loader.getPlugins()).toHaveLength(0)
      expect((loader as any).watchers).toHaveLength(0)
    })
  })

  // ── edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles nested entry point paths', async () => {
      await createPlugin(
        globalDir,
        'nested',
        validManifest({ name: 'nested', entryPoint: 'src/components/index.tsx' })
      )

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].entryPointPath).toContain('src/components/index.tsx')
    })

    it('preserves all manifest fields in loaded plugin', async () => {
      const manifest = validManifest({
        name: 'full-plugin',
        version: '2.1.0-beta.1',
        icon: 'icon.png',
        permissions: ['network', 'clipboard'],
        configSchema: {
          apiKey: { type: 'string', label: 'API Key' },
        },
      })
      const pluginDir = await createPlugin(globalDir, 'full-plugin', manifest)
      // Create icon file
      await writeFile(join(pluginDir, 'icon.png'), 'fake-png')

      const loader = new PluginLoader()
      const result = await loader.scanDirectory(globalDir, 'global')

      expect(result.plugins).toHaveLength(1)
      const p = result.plugins[0]
      expect(p.manifest.version).toBe('2.1.0-beta.1')
      expect(p.manifest.icon).toBe('icon.png')
      expect(p.manifest.permissions).toEqual(['network', 'clipboard'])
      expect(p.manifest.configSchema).toHaveProperty('apiKey')
    })
  })
})
