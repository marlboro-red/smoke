import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { StructureAnalyzer } from '../StructureAnalyzer'

let tmpDir: string
let analyzer: StructureAnalyzer

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2))
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, content)
}

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'smoke-structure-'))
  analyzer = new StructureAnalyzer(() => null)
})

afterEach(async () => {
  analyzer.dispose()
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('StructureAnalyzer', () => {
  describe('single Node.js package', () => {
    it('detects a root package.json as single-package', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), {
        name: 'my-app',
        main: 'dist/index.js',
        scripts: { start: 'node dist/index.js' },
        dependencies: { express: '^4.0.0' },
      })
      await writeFile(path.join(tmpDir, 'src/index.ts'), 'export default {}')

      const result = await analyzer.analyze(tmpDir)

      expect(result.projectType).toBe('single-package')
      expect(result.modules).toHaveLength(1)
      expect(result.modules[0].name).toBe('my-app')
      expect(result.modules[0].type).toBe('app')
      expect(result.modules[0].entryPoints).toContain('dist/index.js')
      expect(result.modules[0].framework).toBe('express')
    })

    it('detects React framework', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), {
        name: 'my-react-app',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      })
      await writeFile(path.join(tmpDir, 'src/index.tsx'), '')

      const result = await analyzer.analyze(tmpDir)
      expect(result.modules[0].framework).toBe('react')
    })
  })

  describe('npm/yarn workspaces', () => {
    it('detects workspace packages', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), {
        name: 'monorepo',
        workspaces: ['packages/*'],
      })
      await writeJson(path.join(tmpDir, 'packages/core/package.json'), {
        name: '@my/core',
        main: 'dist/index.js',
      })
      await writeJson(path.join(tmpDir, 'packages/ui/package.json'), {
        name: '@my/ui',
        dependencies: { react: '^18.0.0' },
        scripts: { dev: 'vite' },
      })

      const result = await analyzer.analyze(tmpDir)

      expect(result.projectType).toBe('monorepo')
      expect(result.modules.length).toBeGreaterThanOrEqual(2)

      const core = result.modules.find(m => m.name === '@my/core')
      expect(core).toBeDefined()
      expect(core!.type).toBe('library')
      expect(core!.marker).toBe('package.json (workspace)')

      const ui = result.modules.find(m => m.name === '@my/ui')
      expect(ui).toBeDefined()
      expect(ui!.framework).toBe('react')
    })

    it('handles yarn workspaces.packages format', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), {
        name: 'monorepo',
        workspaces: { packages: ['packages/*'] },
      })
      await writeJson(path.join(tmpDir, 'packages/lib-a/package.json'), {
        name: 'lib-a',
      })

      const result = await analyzer.analyze(tmpDir)
      expect(result.modules.length).toBeGreaterThanOrEqual(1)
      expect(result.modules.find(m => m.name === 'lib-a')).toBeDefined()
    })
  })

  describe('Go modules', () => {
    it('detects go.mod with main.go', async () => {
      await writeFile(path.join(tmpDir, 'go.mod'), 'module github.com/example/myservice\n\ngo 1.21\n')
      await writeFile(path.join(tmpDir, 'main.go'), 'package main\n')

      const result = await analyzer.analyze(tmpDir)

      expect(result.modules).toHaveLength(1)
      expect(result.modules[0].name).toBe('github.com/example/myservice')
      expect(result.modules[0].type).toBe('service')
      expect(result.modules[0].entryPoints).toContain('main.go')
      expect(result.modules[0].marker).toBe('go.mod')
    })

    it('detects Go module with cmd/ directory', async () => {
      await writeFile(path.join(tmpDir, 'go.mod'), 'module github.com/example/multi\n\ngo 1.21\n')
      await writeFile(path.join(tmpDir, 'cmd/server/main.go'), 'package main\n')
      await writeFile(path.join(tmpDir, 'cmd/cli/main.go'), 'package main\n')

      const result = await analyzer.analyze(tmpDir)

      expect(result.modules[0].entryPoints).toContain('cmd/server/main.go')
      expect(result.modules[0].entryPoints).toContain('cmd/cli/main.go')
    })

    it('classifies library modules without entry points', async () => {
      await writeFile(path.join(tmpDir, 'go.mod'), 'module github.com/example/lib\n\ngo 1.21\n')
      await writeFile(path.join(tmpDir, 'lib.go'), 'package lib\n')

      const result = await analyzer.analyze(tmpDir)
      expect(result.modules[0].type).toBe('library')
    })
  })

  describe('Python packages', () => {
    it('detects pyproject.toml package', async () => {
      await writeFile(path.join(tmpDir, 'pyproject.toml'), `
[project]
name = "my-python-lib"
version = "1.0.0"
`)
      await writeFile(path.join(tmpDir, 'src/my_python_lib/__init__.py'), '')

      const result = await analyzer.analyze(tmpDir)

      expect(result.modules).toHaveLength(1)
      expect(result.modules[0].name).toBe('my-python-lib')
      expect(result.modules[0].marker).toBe('pyproject.toml')
    })

    it('detects Django project', async () => {
      await writeFile(path.join(tmpDir, 'setup.py'), 'from setuptools import setup; setup()')
      await writeFile(path.join(tmpDir, 'requirements.txt'), 'django==4.2\ndjango-rest-framework==3.14\n')
      await writeFile(path.join(tmpDir, 'manage.py'), '#!/usr/bin/env python\nimport django\n')

      const result = await analyzer.analyze(tmpDir)

      expect(result.modules[0].type).toBe('service')
      expect(result.modules[0].framework).toBe('django')
      expect(result.modules[0].entryPoints).toContain('manage.py')
    })
  })

  describe('monorepo service directories', () => {
    it('detects services/ convention', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), { name: 'mono', private: true })
      await writeJson(path.join(tmpDir, 'services/api/package.json'), {
        name: 'api',
        scripts: { start: 'node index.js' },
      })
      await writeFile(path.join(tmpDir, 'services/worker/Dockerfile'), 'FROM node:20\n')

      const result = await analyzer.analyze(tmpDir)

      const api = result.modules.find(m => m.name === 'api')
      expect(api).toBeDefined()

      const worker = result.modules.find(m => m.name === 'worker')
      expect(worker).toBeDefined()
      expect(worker!.type).toBe('service')
    })
  })

  describe('boundary detection', () => {
    it('detects src, test, and config directories', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), { name: 'app' })
      await fsp.mkdir(path.join(tmpDir, 'src'), { recursive: true })
      await fsp.mkdir(path.join(tmpDir, 'tests'), { recursive: true })
      await fsp.mkdir(path.join(tmpDir, 'config'), { recursive: true })
      await fsp.mkdir(path.join(tmpDir, '.github'), { recursive: true })
      await writeFile(path.join(tmpDir, 'tsconfig.json'), '{}')
      await writeFile(path.join(tmpDir, 'vitest.config.ts'), '')

      const result = await analyzer.analyze(tmpDir)

      expect(result.boundaries.src).toContain('src')
      expect(result.boundaries.test).toContain('tests')
      expect(result.boundaries.config).toContain('config')
      expect(result.boundaries.config).toContain('.github')
      expect(result.boundaries.config).toContain('tsconfig.json')
    })
  })

  describe('caching', () => {
    it('returns cached result via getStructure()', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), { name: 'cached' })

      const result = await analyzer.analyze(tmpDir)
      const cached = analyzer.getStructure()

      expect(cached).toBe(result)
      expect(cached!.rootPath).toBe(path.resolve(tmpDir))
    })

    it('returns null before analysis', () => {
      expect(analyzer.getStructure()).toBeNull()
    })
  })

  describe('dispose', () => {
    it('clears state after dispose', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), { name: 'disposable' })
      await analyzer.analyze(tmpDir)

      analyzer.dispose()
      expect(analyzer.getStructure()).toBeNull()
    })
  })

  describe('multi-module Go project', () => {
    it('detects multiple go.mod files', async () => {
      await writeFile(path.join(tmpDir, 'svc-a/go.mod'), 'module github.com/ex/svc-a\n\ngo 1.21\n')
      await writeFile(path.join(tmpDir, 'svc-a/main.go'), 'package main\n')
      await writeFile(path.join(tmpDir, 'svc-b/go.mod'), 'module github.com/ex/svc-b\n\ngo 1.21\n')
      await writeFile(path.join(tmpDir, 'svc-b/main.go'), 'package main\n')

      const result = await analyzer.analyze(tmpDir)

      expect(result.projectType).toBe('multi-module')
      expect(result.modules).toHaveLength(2)
    })
  })

  describe('pnpm workspaces', () => {
    it('detects pnpm-workspace.yaml', async () => {
      await writeJson(path.join(tmpDir, 'package.json'), { name: 'pnpm-mono', private: true })
      await writeFile(path.join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n')
      await writeJson(path.join(tmpDir, 'packages/utils/package.json'), {
        name: '@pnpm/utils',
      })

      const result = await analyzer.analyze(tmpDir)

      const utils = result.modules.find(m => m.name === '@pnpm/utils')
      expect(utils).toBeDefined()
      expect(utils!.marker).toBe('pnpm-workspace.yaml')
    })
  })

  describe('Rust project', () => {
    it('detects Cargo.toml library', async () => {
      await writeFile(path.join(tmpDir, 'Cargo.toml'), `
[package]
name = "my-rust-lib"
version = "0.1.0"

[lib]
name = "my_rust_lib"
`)
      await writeFile(path.join(tmpDir, 'src/lib.rs'), '')

      const result = await analyzer.analyze(tmpDir)

      expect(result.modules).toHaveLength(1)
      expect(result.modules[0].name).toBe('my-rust-lib')
      expect(result.modules[0].type).toBe('library')
      expect(result.modules[0].entryPoints).toContain('src/lib.rs')
    })

    it('detects Cargo.toml binary', async () => {
      await writeFile(path.join(tmpDir, 'Cargo.toml'), `
[package]
name = "my-rust-app"
version = "0.1.0"
`)
      await writeFile(path.join(tmpDir, 'src/main.rs'), 'fn main() {}')

      const result = await analyzer.analyze(tmpDir)

      expect(result.modules[0].type).toBe('app')
      expect(result.modules[0].entryPoints).toContain('src/main.rs')
    })
  })

  describe('empty/unknown project', () => {
    it('returns unknown type with no modules for empty dir', async () => {
      const result = await analyzer.analyze(tmpDir)

      expect(result.projectType).toBe('unknown')
      expect(result.modules).toHaveLength(0)
    })
  })
})
