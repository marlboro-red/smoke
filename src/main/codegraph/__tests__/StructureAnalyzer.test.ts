import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { StructureAnalyzer } from '../StructureAnalyzer'

describe('StructureAnalyzer', () => {
  let tmpDir: string
  let analyzer: StructureAnalyzer

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-struct-'))
    analyzer = new StructureAnalyzer()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('detects a Node.js project from package.json', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', main: 'dist/index.js' })
    )
    await fs.mkdir(path.join(tmpDir, 'src'))
    await fs.writeFile(path.join(tmpDir, 'src/index.ts'), 'export {}')

    const result = await analyzer.analyze(tmpDir)

    expect(result.projectRoot).toBe(tmpDir)
    const root = result.modules['.']
    expect(root).toBeDefined()
    expect(root.name).toBe('my-app')
    expect(root.type).toBe('package')
    expect(root.keyFiles).toContain('package.json')
  })

  it('detects a monorepo workspace root', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'monorepo', workspaces: ['packages/*'] })
    )
    await fs.mkdir(path.join(tmpDir, 'packages/core'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'packages/core/package.json'),
      JSON.stringify({ name: '@mono/core' })
    )

    const result = await analyzer.analyze(tmpDir)

    const root = result.modules['.']
    expect(root.type).toBe('workspace-root')

    const core = result.modules['packages/core']
    expect(core).toBeDefined()
    expect(core.name).toBe('@mono/core')
    expect(core.type).toBe('package')
  })

  it('detects a Go module', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'go.mod'),
      'module github.com/example/myapp\n\ngo 1.21\n'
    )
    await fs.writeFile(path.join(tmpDir, 'main.go'), 'package main')

    const result = await analyzer.analyze(tmpDir)

    const root = result.modules['.']
    expect(root.type).toBe('go-module')
    expect(root.name).toBe('github.com/example/myapp')
    expect(root.entryPoint).toBe('main.go')
  })

  it('detects a Rust crate', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Cargo.toml'),
      '[package]\nname = "my-crate"\nversion = "0.1.0"\n'
    )
    await fs.mkdir(path.join(tmpDir, 'src'))
    await fs.writeFile(path.join(tmpDir, 'src/main.rs'), 'fn main() {}')

    const result = await analyzer.analyze(tmpDir)

    const root = result.modules['.']
    expect(root.type).toBe('rust-crate')
    expect(root.name).toBe('my-crate')
    expect(root.entryPoint).toBe('src/main.rs')
  })

  it('detects a Python package', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "my-package"\n'
    )

    const result = await analyzer.analyze(tmpDir)

    const root = result.modules['.']
    expect(root.type).toBe('python-package')
    expect(root.name).toBe('my-package')
    expect(root.keyFiles).toContain('pyproject.toml')
  })

  it('classifies test and config directories', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app' })
    )
    await fs.mkdir(path.join(tmpDir, 'tests'))
    await fs.writeFile(
      path.join(tmpDir, 'tests/package.json'),
      JSON.stringify({ name: 'app-tests' })
    )
    await fs.mkdir(path.join(tmpDir, 'config'))
    await fs.writeFile(
      path.join(tmpDir, 'config/package.json'),
      JSON.stringify({ name: 'app-config' })
    )

    const result = await analyzer.analyze(tmpDir)

    const testDir = result.topLevelDirs.find(d => d.name === 'tests')
    expect(testDir?.type).toBe('tests')

    const configDir = result.topLevelDirs.find(d => d.name === 'config')
    expect(configDir?.type).toBe('config')
  })

  it('caches results and returns via getCached()', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'cached-app' })
    )

    expect(analyzer.getCached()).toBeNull()
    await analyzer.analyze(tmpDir)
    expect(analyzer.getCached()).not.toBeNull()
    expect(analyzer.getCached()!.modules['.'].name).toBe('cached-app')
  })

  it('getModule returns specific module', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', workspaces: ['packages/*'] })
    )
    await fs.mkdir(path.join(tmpDir, 'packages/ui'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'packages/ui/package.json'),
      JSON.stringify({ name: '@app/ui' })
    )

    await analyzer.analyze(tmpDir)

    const mod = analyzer.getModule('packages/ui')
    expect(mod).not.toBeNull()
    expect(mod!.name).toBe('@app/ui')
    expect(analyzer.getModule('nonexistent')).toBeNull()
  })

  it('detects entry point from src/index.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'with-entry' })
    )
    await fs.mkdir(path.join(tmpDir, 'src'))
    await fs.writeFile(path.join(tmpDir, 'src/index.ts'), 'export {}')

    const result = await analyzer.analyze(tmpDir)
    expect(result.modules['.'].entryPoint).toBe('src/index.ts')
  })

  it('skips node_modules and .git', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app' })
    )
    await fs.mkdir(path.join(tmpDir, 'node_modules/dep'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'node_modules/dep/package.json'),
      JSON.stringify({ name: 'dep' })
    )
    await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true })

    const result = await analyzer.analyze(tmpDir)

    // node_modules and .git should not appear
    expect(result.modules['node_modules/dep']).toBeUndefined()
    expect(result.topLevelDirs.find(d => d.name === 'node_modules')).toBeUndefined()
    expect(result.topLevelDirs.find(d => d.name === '.git')).toBeUndefined()
  })
})
