/**
 * Codebase structure analyzer (smoke-phq.2).
 *
 * Detects logical boundaries in a project: workspaces, modules, packages,
 * src/test/config separation. Produces a structured map of modules with
 * their root paths, entry points, and types.
 *
 * Runs once on demand, cached and updated incrementally via file watcher.
 */

import * as fs from 'fs/promises'
import * as path from 'path'

/** Type of a detected module/boundary. */
export type ModuleType =
  | 'workspace-root'  // monorepo root
  | 'package'         // npm/yarn workspace package
  | 'go-module'       // Go module (go.mod)
  | 'rust-crate'      // Rust crate (Cargo.toml)
  | 'python-package'  // Python package (pyproject.toml / setup.py)
  | 'service'         // service directory (has its own entry point)
  | 'library'         // shared library code
  | 'config'          // configuration directory
  | 'tests'           // test directory
  | 'source'          // generic source directory

export interface ModuleInfo {
  /** Unique identifier (relative path from project root, or '.' for root). */
  id: string
  /** Human-readable name (from package.json, Cargo.toml, etc.). */
  name: string
  /** Absolute path to the module root. */
  rootPath: string
  /** Entry point file, if detected. */
  entryPoint: string | null
  /** Type classification. */
  type: ModuleType
  /** Child module IDs (for workspace roots). */
  children: string[]
  /** Key files found in this module. */
  keyFiles: string[]
}

export interface StructureMap {
  /** Project root path. */
  projectRoot: string
  /** All detected modules, keyed by id. */
  modules: Record<string, ModuleInfo>
  /** Top-level directory classification. */
  topLevelDirs: Array<{ name: string; type: ModuleType | 'unknown'; path: string }>
}

/** Directories to skip during analysis. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next',
  '__pycache__', '.tox', 'venv', '.venv', 'target',
  '.cache', '.turbo', '.parcel-cache', 'coverage',
])

/** Test directory names. */
const TEST_DIRS = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs',
  'e2e', 'integration', 'unit',
])

/** Config directory names. */
const CONFIG_DIRS = new Set([
  'config', 'configs', 'configuration', '.config',
])

/** Source directory names. */
const SOURCE_DIRS = new Set([
  'src', 'lib', 'pkg', 'packages', 'apps', 'services',
  'internal', 'cmd',
])

export class StructureAnalyzer {
  private cache: StructureMap | null = null

  /** Analyze a project and return its structure map. */
  async analyze(projectRoot: string): Promise<StructureMap> {
    const root = path.resolve(projectRoot)
    const modules: Record<string, ModuleInfo> = {}
    const topLevelDirs: StructureMap['topLevelDirs'] = []

    // Detect root-level project type
    const rootModule = await this.analyzeDirectory(root, root)
    if (rootModule) {
      modules[rootModule.id] = rootModule
    }

    // Scan top-level directories
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch {
      this.cache = { projectRoot: root, modules, topLevelDirs }
      return this.cache
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue

      const dirPath = path.join(root, entry.name)
      const dirType = this.classifyDirectory(entry.name)
      topLevelDirs.push({ name: entry.name, type: dirType, path: dirPath })

      // For workspace/package directories, scan children
      if (entry.name === 'packages' || entry.name === 'apps' || entry.name === 'services') {
        await this.scanWorkspaceChildren(dirPath, root, modules, rootModule)
      } else {
        const mod = await this.analyzeDirectory(dirPath, root)
        if (mod) {
          modules[mod.id] = mod
          if (rootModule) rootModule.children.push(mod.id)
        }
      }
    }

    this.cache = { projectRoot: root, modules, topLevelDirs }
    return this.cache
  }

  /** Get the cached structure map, or null if not yet analyzed. */
  getCached(): StructureMap | null {
    return this.cache
  }

  /** Get details for a specific module by id. */
  getModule(moduleId: string): ModuleInfo | null {
    return this.cache?.modules[moduleId] ?? null
  }

  // -- Internal --

  private classifyDirectory(name: string): ModuleType | 'unknown' {
    if (TEST_DIRS.has(name)) return 'tests'
    if (CONFIG_DIRS.has(name)) return 'config'
    if (SOURCE_DIRS.has(name)) return 'source'
    return 'unknown'
  }

  private async scanWorkspaceChildren(
    dir: string,
    projectRoot: string,
    modules: Record<string, ModuleInfo>,
    parentModule: ModuleInfo | null
  ): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue

      const childPath = path.join(dir, entry.name)
      const mod = await this.analyzeDirectory(childPath, projectRoot)
      if (mod) {
        modules[mod.id] = mod
        if (parentModule) parentModule.children.push(mod.id)
      }
    }
  }

  private async analyzeDirectory(dir: string, projectRoot: string): Promise<ModuleInfo | null> {
    const relPath = path.relative(projectRoot, dir) || '.'
    const name = relPath === '.' ? path.basename(projectRoot) : path.basename(dir)

    const keyFiles: string[] = []
    let type: ModuleType = 'source'
    let entryPoint: string | null = null
    let detectedName = name

    // Check for marker files
    const checks = await this.checkMarkerFiles(dir)

    if (checks.packageJson) {
      keyFiles.push('package.json')
      detectedName = checks.packageJson.name || name

      if (checks.packageJson.workspaces) {
        type = 'workspace-root'
      } else {
        type = 'package'
      }

      // Detect entry point
      entryPoint = checks.packageJson.main
        || checks.packageJson.module
        || null

      if (!entryPoint) {
        entryPoint = await this.findEntryPoint(dir, [
          'src/index.ts', 'src/index.tsx', 'src/index.js',
          'src/main.ts', 'src/main.tsx', 'src/main.js',
          'index.ts', 'index.tsx', 'index.js',
        ])
      }
    }

    if (checks.goMod) {
      keyFiles.push('go.mod')
      type = 'go-module'
      detectedName = checks.goMod.module || name
      entryPoint = entryPoint || await this.findEntryPoint(dir, [
        'main.go', 'cmd/main.go',
      ])
    }

    if (checks.cargoToml) {
      keyFiles.push('Cargo.toml')
      type = checks.cargoToml.isWorkspace ? 'workspace-root' : 'rust-crate'
      detectedName = checks.cargoToml.name || name
      entryPoint = entryPoint || await this.findEntryPoint(dir, [
        'src/main.rs', 'src/lib.rs',
      ])
    }

    if (checks.pyProject) {
      keyFiles.push(checks.pyProject.file)
      type = 'python-package'
      detectedName = checks.pyProject.name || name
      entryPoint = entryPoint || await this.findEntryPoint(dir, [
        '__main__.py', 'main.py', `${name}/__init__.py`,
      ])
    }

    // Detect additional key files
    const additionalKeys = [
      'tsconfig.json', 'Makefile', 'Dockerfile',
      'docker-compose.yml', 'docker-compose.yaml',
      '.env', '.env.example',
    ]
    for (const f of additionalKeys) {
      if (await this.fileExists(path.join(dir, f))) {
        keyFiles.push(f)
      }
    }

    // For the root module or subdirs with marker files, always return
    if (relPath === '.' || keyFiles.length > 0) {
      // Classify service directories
      if (type === 'source' && (
        keyFiles.includes('Dockerfile') ||
        keyFiles.includes('docker-compose.yml') ||
        keyFiles.includes('docker-compose.yaml')
      )) {
        type = 'service'
      }

      // Classify test/config by directory name
      const dirName = path.basename(dir)
      if (type === 'source' && TEST_DIRS.has(dirName)) type = 'tests'
      if (type === 'source' && CONFIG_DIRS.has(dirName)) type = 'config'

      return {
        id: relPath,
        name: detectedName,
        rootPath: dir,
        entryPoint,
        type,
        children: [],
        keyFiles,
      }
    }

    return null
  }

  private async checkMarkerFiles(dir: string): Promise<{
    packageJson: { name?: string; workspaces?: unknown; main?: string; module?: string } | null
    goMod: { module?: string } | null
    cargoToml: { name?: string; isWorkspace: boolean } | null
    pyProject: { name?: string; file: string } | null
  }> {
    const result = {
      packageJson: null as { name?: string; workspaces?: unknown; main?: string; module?: string } | null,
      goMod: null as { module?: string } | null,
      cargoToml: null as { name?: string; isWorkspace: boolean } | null,
      pyProject: null as { name?: string; file: string } | null,
    }

    // package.json
    try {
      const content = await fs.readFile(path.join(dir, 'package.json'), 'utf-8')
      const pkg = JSON.parse(content)
      result.packageJson = {
        name: pkg.name,
        workspaces: pkg.workspaces,
        main: pkg.main,
        module: pkg.module,
      }
    } catch { /* not found */ }

    // go.mod
    try {
      const content = await fs.readFile(path.join(dir, 'go.mod'), 'utf-8')
      const moduleMatch = content.match(/^module\s+(.+)$/m)
      result.goMod = { module: moduleMatch?.[1]?.trim() }
    } catch { /* not found */ }

    // Cargo.toml
    try {
      const content = await fs.readFile(path.join(dir, 'Cargo.toml'), 'utf-8')
      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
      const isWorkspace = /\[workspace\]/.test(content)
      result.cargoToml = { name: nameMatch?.[1], isWorkspace }
    } catch { /* not found */ }

    // pyproject.toml or setup.py
    try {
      const content = await fs.readFile(path.join(dir, 'pyproject.toml'), 'utf-8')
      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
      result.pyProject = { name: nameMatch?.[1], file: 'pyproject.toml' }
    } catch {
      try {
        await fs.access(path.join(dir, 'setup.py'))
        result.pyProject = { name: undefined, file: 'setup.py' }
      } catch { /* not found */ }
    }

    return result
  }

  private async findEntryPoint(dir: string, candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
      if (await this.fileExists(path.join(dir, candidate))) {
        return candidate
      }
    }
    return null
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}
