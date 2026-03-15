import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import type { BrowserWindow } from 'electron'

// ── Types ──────────────────────────────────────────────────

export type ModuleType = 'service' | 'library' | 'config' | 'tests' | 'app' | 'package'

export interface ModuleInfo {
  /** Human-readable module name */
  name: string
  /** Absolute path to module root */
  rootPath: string
  /** Relative path from project root */
  relativePath: string
  /** Detected module type */
  type: ModuleType
  /** Main entry files (relative to module root) */
  entryPoints: string[]
  /** What marker file/pattern identified this module */
  marker: string
  /** Detected framework hint (react, express, django, flask, gin, etc.) */
  framework?: string
}

export interface ProjectStructure {
  rootPath: string
  modules: ModuleInfo[]
  boundaries: {
    src: string[]
    test: string[]
    config: string[]
  }
  projectType: 'monorepo' | 'single-package' | 'multi-module' | 'unknown'
  analyzedAt: number
}

// ── Constants ──────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn',
  'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'env',
  'target', 'vendor', '.cache',
  'coverage', '.nyc_output', '.beads',
])

const SRC_DIR_NAMES = new Set(['src', 'lib', 'source', 'app', 'pkg', 'internal', 'cmd'])
const TEST_DIR_NAMES = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'integration', 'fixtures'])
const CONFIG_DIR_NAMES = new Set(['config', 'configs', '.github', '.vscode', '.circleci', 'scripts', 'deploy', 'infra', 'terraform', 'helm'])

/** Monorepo workspace directory conventions */
const WORKSPACE_DIR_PATTERNS = ['packages', 'apps', 'services', 'modules', 'libs', 'plugins', 'tools']

const MAX_DEPTH = 5
const DEBOUNCE_MS = 1000

// ── Analyzer ──────────────────────────────────────────────

export class StructureAnalyzer {
  private structure: ProjectStructure | null = null
  private rootPath: string | null = null
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  /**
   * Perform full analysis of the project rooted at rootPath.
   * Cached result available via getStructure().
   */
  async analyze(rootPath: string): Promise<ProjectStructure> {
    this.dispose()
    this.rootPath = path.resolve(rootPath)

    const modules: ModuleInfo[] = []
    const boundaries = { src: [] as string[], test: [] as string[], config: [] as string[] }

    // Run detection passes
    await Promise.all([
      this.detectNodeWorkspaces(modules),
      this.detectGoModules(modules),
      this.detectPythonPackages(modules),
      this.detectMonorepoServices(modules),
    ])

    // If no modules found, treat root as a single package
    if (modules.length === 0) {
      await this.detectRootPackage(modules)
    }

    // Detect src/test/config boundaries
    await this.detectBoundaries(boundaries)

    const projectType = this.classifyProjectType(modules)

    this.structure = {
      rootPath: this.rootPath,
      modules,
      boundaries,
      projectType,
      analyzedAt: Date.now(),
    }

    this.startWatching()

    return this.structure
  }

  getStructure(): ProjectStructure | null {
    return this.structure
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.structure = null
    this.rootPath = null
  }

  // ── Detection: Node/npm workspaces ─────────────────────

  private async detectNodeWorkspaces(modules: ModuleInfo[]): Promise<void> {
    if (!this.rootPath) return

    const rootPkg = await this.readJson(path.join(this.rootPath, 'package.json'))
    if (!rootPkg) return

    const workspacePatterns = this.extractWorkspacePatterns(rootPkg)

    if (workspacePatterns.length > 0) {
      // Monorepo: resolve workspace globs
      const workspaceDirs = await this.resolveWorkspaceGlobs(workspacePatterns)
      for (const dir of workspaceDirs) {
        const pkgPath = path.join(dir, 'package.json')
        const pkg = await this.readJson(pkgPath)
        if (!pkg) continue

        const name = (pkg.name as string) || path.basename(dir)
        const relPath = path.relative(this.rootPath!, dir)
        const entryPoints = this.detectNodeEntryPoints(pkg, dir)
        const framework = this.detectNodeFramework(pkg)
        const type = this.classifyNodeModule(pkg, relPath)

        modules.push({
          name,
          rootPath: dir,
          relativePath: relPath,
          type,
          entryPoints,
          marker: 'package.json (workspace)',
          framework: framework || undefined,
        })
      }
    }
  }

  private extractWorkspacePatterns(pkg: Record<string, unknown>): string[] {
    // npm/yarn: workspaces as array
    if (Array.isArray(pkg.workspaces)) {
      return pkg.workspaces as string[]
    }
    // yarn: workspaces.packages
    if (pkg.workspaces && typeof pkg.workspaces === 'object' && !Array.isArray(pkg.workspaces)) {
      const ws = pkg.workspaces as Record<string, unknown>
      if (Array.isArray(ws.packages)) return ws.packages as string[]
    }
    // pnpm: read pnpm-workspace.yaml
    // For simplicity, check common workspace dirs
    return []
  }

  private async resolveWorkspaceGlobs(patterns: string[]): Promise<string[]> {
    if (!this.rootPath) return []
    const dirs: string[] = []

    for (const pattern of patterns) {
      // Handle simple patterns like "packages/*" or "apps/*"
      const clean = pattern.replace(/\/?\*\*?$/, '')
      const base = path.join(this.rootPath, clean)

      if (await this.isDirectory(base)) {
        // List subdirectories
        try {
          const entries = await fsp.readdir(base, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
              dirs.push(path.join(base, entry.name))
            }
          }
        } catch {
          // skip unreadable
        }
      } else {
        // Direct path (no glob) — check if it's a directory with package.json
        const direct = path.join(this.rootPath, pattern)
        if (await this.isDirectory(direct)) {
          dirs.push(direct)
        }
      }
    }

    return dirs
  }

  private detectNodeEntryPoints(pkg: Record<string, unknown>, dir: string): string[] {
    const entries: string[] = []
    if (typeof pkg.main === 'string') entries.push(pkg.main)
    if (typeof pkg.module === 'string') entries.push(pkg.module)
    if (typeof pkg.types === 'string') entries.push(pkg.types)
    if (typeof pkg.typings === 'string') entries.push(pkg.typings)

    // exports field
    if (pkg.exports && typeof pkg.exports === 'object') {
      const exp = pkg.exports as Record<string, unknown>
      if (typeof exp['.'] === 'string') entries.push(exp['.'])
      else if (exp['.'] && typeof exp['.'] === 'object') {
        const dotExp = exp['.'] as Record<string, unknown>
        for (const val of Object.values(dotExp)) {
          if (typeof val === 'string') entries.push(val)
        }
      }
    }

    // Fallback: check common entry files
    if (entries.length === 0) {
      const candidates = ['index.ts', 'index.tsx', 'index.js', 'index.mjs', 'src/index.ts', 'src/index.tsx', 'src/index.js', 'src/main.ts', 'src/main.tsx']
      for (const c of candidates) {
        try {
          fs.accessSync(path.join(dir, c))
          entries.push(c)
          break
        } catch {
          // not found
        }
      }
    }

    return [...new Set(entries)]
  }

  private detectNodeFramework(pkg: Record<string, unknown>): string | null {
    const allDeps: Record<string, unknown> = {
      ...(pkg.dependencies as Record<string, unknown> || {}),
      ...(pkg.devDependencies as Record<string, unknown> || {}),
    }

    if ('next' in allDeps) return 'next'
    if ('nuxt' in allDeps) return 'nuxt'
    if ('react' in allDeps && 'electron' in allDeps) return 'electron-react'
    if ('react' in allDeps) return 'react'
    if ('vue' in allDeps) return 'vue'
    if ('svelte' in allDeps) return 'svelte'
    if ('express' in allDeps) return 'express'
    if ('fastify' in allDeps) return 'fastify'
    if ('koa' in allDeps) return 'koa'
    if ('hono' in allDeps) return 'hono'
    if ('nestjs' in allDeps || '@nestjs/core' in allDeps) return 'nestjs'
    if ('electron' in allDeps) return 'electron'

    return null
  }

  private classifyNodeModule(pkg: Record<string, unknown>, relPath: string): ModuleType {
    // Check for test-only packages
    const name = (pkg.name as string) || ''
    if (name.includes('test') || name.includes('e2e') || relPath.includes('test')) return 'tests'

    // Config packages
    if (name.includes('config') || name.includes('eslint') || name.includes('tsconfig')) return 'config'

    // Check scripts for service indicators
    const scripts = pkg.scripts as Record<string, string> | undefined
    if (scripts) {
      if (scripts.start || scripts.serve || scripts.dev) return 'service'
    }

    // Check if it's an app vs library
    const allDeps = {
      ...(pkg.dependencies as Record<string, unknown> || {}),
    }
    if ('express' in allDeps || 'fastify' in allDeps || 'koa' in allDeps ||
        'next' in allDeps || 'nuxt' in allDeps || '@nestjs/core' in allDeps) {
      return 'app'
    }

    // Workspace path heuristics
    const firstDir = relPath.split(path.sep)[0]
    if (firstDir === 'packages' || firstDir === 'libs') return 'library'
    if (firstDir === 'apps') return 'app'
    if (firstDir === 'services') return 'service'

    return 'library'
  }

  // ── Detection: Go modules ──────────────────────────────

  private async detectGoModules(modules: ModuleInfo[]): Promise<void> {
    if (!this.rootPath) return
    const goModPaths = await this.findFiles(this.rootPath, 'go.mod', MAX_DEPTH)

    for (const goModPath of goModPaths) {
      const dir = path.dirname(goModPath)
      const relPath = path.relative(this.rootPath, dir)
      const content = await this.readText(goModPath)
      if (!content) continue

      const moduleMatch = content.match(/^module\s+(\S+)/m)
      const moduleName = moduleMatch ? moduleMatch[1] : path.basename(dir)

      const entryPoints: string[] = []
      // Check for main.go or cmd/ directory
      const mainGo = path.join(dir, 'main.go')
      if (await this.fileExists(mainGo)) {
        entryPoints.push('main.go')
      }
      const cmdDir = path.join(dir, 'cmd')
      if (await this.isDirectory(cmdDir)) {
        try {
          const cmds = await fsp.readdir(cmdDir, { withFileTypes: true })
          for (const entry of cmds) {
            if (entry.isDirectory()) {
              entryPoints.push(`cmd/${entry.name}/main.go`)
            }
          }
        } catch {
          // skip
        }
      }

      const type: ModuleType = entryPoints.length > 0 ? 'service' : 'library'

      modules.push({
        name: moduleName,
        rootPath: dir,
        relativePath: relPath || '.',
        type,
        entryPoints,
        marker: 'go.mod',
      })
    }
  }

  // ── Detection: Python packages ─────────────────────────

  private async detectPythonPackages(modules: ModuleInfo[]): Promise<void> {
    if (!this.rootPath) return

    // Check for pyproject.toml, setup.py, or setup.cfg at any level
    const markers = [
      ...await this.findFiles(this.rootPath, 'pyproject.toml', MAX_DEPTH),
      ...await this.findFiles(this.rootPath, 'setup.py', MAX_DEPTH),
      ...await this.findFiles(this.rootPath, 'setup.cfg', MAX_DEPTH),
    ]

    // Deduplicate by directory
    const seen = new Set<string>()
    for (const marker of markers) {
      const dir = path.dirname(marker)
      if (seen.has(dir)) continue
      seen.add(dir)

      const relPath = path.relative(this.rootPath, dir)
      const name = await this.detectPythonPackageName(dir, marker) || path.basename(dir)
      const entryPoints = await this.detectPythonEntryPoints(dir)
      const framework = await this.detectPythonFramework(dir)

      const type: ModuleType = entryPoints.some(e =>
        e.includes('manage.py') || e.includes('app.py') || e.includes('main.py') || e.includes('wsgi.py') || e.includes('asgi.py')
      ) ? 'service' : 'library'

      modules.push({
        name,
        rootPath: dir,
        relativePath: relPath || '.',
        type,
        entryPoints,
        marker: path.basename(marker),
        framework: framework || undefined,
      })
    }
  }

  private async detectPythonPackageName(dir: string, markerPath: string): Promise<string | null> {
    if (path.basename(markerPath) === 'pyproject.toml') {
      const content = await this.readText(markerPath)
      if (content) {
        const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
        if (nameMatch) return nameMatch[1]
      }
    }
    return null
  }

  private async detectPythonEntryPoints(dir: string): Promise<string[]> {
    const entries: string[] = []
    const candidates = ['main.py', 'app.py', 'manage.py', 'wsgi.py', 'asgi.py', '__main__.py', 'cli.py']
    for (const c of candidates) {
      if (await this.fileExists(path.join(dir, c))) {
        entries.push(c)
      }
    }
    // Check src/<name>/__init__.py pattern
    const srcDir = path.join(dir, 'src')
    if (await this.isDirectory(srcDir)) {
      try {
        const srcEntries = await fsp.readdir(srcDir, { withFileTypes: true })
        for (const entry of srcEntries) {
          if (entry.isDirectory() && await this.fileExists(path.join(srcDir, entry.name, '__init__.py'))) {
            entries.push(`src/${entry.name}/__init__.py`)
          }
        }
      } catch {
        // skip
      }
    }
    return entries
  }

  private async detectPythonFramework(dir: string): Promise<string | null> {
    // Quick check requirements.txt or pyproject.toml for framework deps
    const reqPath = path.join(dir, 'requirements.txt')
    const pyprojectPath = path.join(dir, 'pyproject.toml')

    for (const filePath of [reqPath, pyprojectPath]) {
      const content = await this.readText(filePath)
      if (!content) continue
      const lower = content.toLowerCase()
      if (lower.includes('django')) return 'django'
      if (lower.includes('flask')) return 'flask'
      if (lower.includes('fastapi')) return 'fastapi'
      if (lower.includes('starlette')) return 'starlette'
      if (lower.includes('tornado')) return 'tornado'
    }
    return null
  }

  // ── Detection: Monorepo service directories ────────────

  private async detectMonorepoServices(modules: ModuleInfo[]): Promise<void> {
    if (!this.rootPath) return

    // Check for pnpm-workspace.yaml (pnpm monorepo)
    const pnpmWs = await this.readText(path.join(this.rootPath, 'pnpm-workspace.yaml'))
    if (pnpmWs) {
      const patterns = this.parsePnpmWorkspacePatterns(pnpmWs)
      if (patterns.length > 0) {
        const dirs = await this.resolveWorkspaceGlobs(patterns)
        for (const dir of dirs) {
          // Skip if already detected
          if (modules.some(m => m.rootPath === dir)) continue

          const pkgPath = path.join(dir, 'package.json')
          const pkg = await this.readJson(pkgPath)
          if (!pkg) continue

          const name = (pkg.name as string) || path.basename(dir)
          const relPath = path.relative(this.rootPath!, dir)
          const entryPoints = this.detectNodeEntryPoints(pkg, dir)
          const framework = this.detectNodeFramework(pkg)
          const type = this.classifyNodeModule(pkg, relPath)

          modules.push({
            name,
            rootPath: dir,
            relativePath: relPath,
            type,
            entryPoints,
            marker: 'pnpm-workspace.yaml',
            framework: framework || undefined,
          })
        }
      }
    }

    // Detect service directories by convention (services/, microservices/)
    for (const pattern of WORKSPACE_DIR_PATTERNS) {
      const wsDir = path.join(this.rootPath, pattern)
      if (!await this.isDirectory(wsDir)) continue

      try {
        const entries = await fsp.readdir(wsDir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name)) continue
          const dir = path.join(wsDir, entry.name)
          // Skip if already detected by another pass
          if (modules.some(m => m.rootPath === dir)) continue

          // Must have some marker to qualify
          const hasMarker =
            await this.fileExists(path.join(dir, 'package.json')) ||
            await this.fileExists(path.join(dir, 'go.mod')) ||
            await this.fileExists(path.join(dir, 'pyproject.toml')) ||
            await this.fileExists(path.join(dir, 'setup.py')) ||
            await this.fileExists(path.join(dir, 'Cargo.toml')) ||
            await this.fileExists(path.join(dir, 'Dockerfile'))

          if (!hasMarker) continue

          const relPath = path.relative(this.rootPath!, dir)
          modules.push({
            name: entry.name,
            rootPath: dir,
            relativePath: relPath,
            type: pattern === 'services' ? 'service' : pattern === 'libs' ? 'library' : 'package',
            entryPoints: [],
            marker: `${pattern}/ convention`,
          })
        }
      } catch {
        // skip
      }
    }
  }

  private parsePnpmWorkspacePatterns(content: string): string[] {
    const patterns: string[] = []
    // Simple YAML array parsing for packages:
    const inPackages = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)+)/)
    if (inPackages) {
      const lines = inPackages[1].split('\n')
      for (const line of lines) {
        const match = line.match(/^\s+-\s+['"]?([^'"]+)['"]?/)
        if (match) patterns.push(match[1].trim())
      }
    }
    return patterns
  }

  // ── Detection: Root single package ─────────────────────

  private async detectRootPackage(modules: ModuleInfo[]): Promise<void> {
    if (!this.rootPath) return

    // Check for package.json
    const pkg = await this.readJson(path.join(this.rootPath, 'package.json'))
    if (pkg) {
      const name = (pkg.name as string) || path.basename(this.rootPath)
      const entryPoints = this.detectNodeEntryPoints(pkg, this.rootPath)
      const framework = this.detectNodeFramework(pkg)
      modules.push({
        name,
        rootPath: this.rootPath,
        relativePath: '.',
        type: framework ? 'app' : 'package',
        entryPoints,
        marker: 'package.json',
        framework: framework || undefined,
      })
      return
    }

    // Check for go.mod
    if (await this.fileExists(path.join(this.rootPath, 'go.mod'))) {
      // Already handled by detectGoModules, but that runs in parallel
      return
    }

    // Check for Cargo.toml
    const cargo = await this.readText(path.join(this.rootPath, 'Cargo.toml'))
    if (cargo) {
      const nameMatch = cargo.match(/^\s*name\s*=\s*"([^"]+)"/m)
      modules.push({
        name: nameMatch ? nameMatch[1] : path.basename(this.rootPath),
        rootPath: this.rootPath,
        relativePath: '.',
        type: cargo.includes('[lib]') ? 'library' : 'app',
        entryPoints: cargo.includes('[lib]') ? ['src/lib.rs'] : ['src/main.rs'],
        marker: 'Cargo.toml',
      })
    }
  }

  // ── Boundary detection ─────────────────────────────────

  private async detectBoundaries(boundaries: ProjectStructure['boundaries']): Promise<void> {
    if (!this.rootPath) return

    try {
      const entries = await fsp.readdir(this.rootPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name)) continue
        const relName = entry.name.toLowerCase()

        if (SRC_DIR_NAMES.has(relName)) {
          boundaries.src.push(entry.name)
        }
        if (TEST_DIR_NAMES.has(relName)) {
          boundaries.test.push(entry.name)
        }
        if (CONFIG_DIR_NAMES.has(relName)) {
          boundaries.config.push(entry.name)
        }
      }
    } catch {
      // skip
    }

    // Also check for top-level config files
    const configFiles = [
      'tsconfig.json', '.eslintrc.js', '.eslintrc.json', '.prettierrc',
      'webpack.config.js', 'vite.config.ts', 'rollup.config.js',
      'jest.config.js', 'vitest.config.ts', '.babelrc',
      'Makefile', 'Dockerfile', 'docker-compose.yml',
    ]
    for (const cf of configFiles) {
      if (await this.fileExists(path.join(this.rootPath, cf))) {
        if (!boundaries.config.includes(cf)) {
          boundaries.config.push(cf)
        }
      }
    }
  }

  // ── Project classification ─────────────────────────────

  private classifyProjectType(modules: ModuleInfo[]): ProjectStructure['projectType'] {
    if (modules.length === 0) return 'unknown'
    if (modules.length === 1 && modules[0].relativePath === '.') return 'single-package'

    // Check for monorepo markers
    const hasWorkspaceModules = modules.some(m =>
      m.marker.includes('workspace') || m.marker.includes('pnpm')
    )
    if (hasWorkspaceModules) return 'monorepo'

    // Multiple go.mod files = multi-module
    const goModCount = modules.filter(m => m.marker === 'go.mod').length
    if (goModCount > 1) return 'multi-module'

    if (modules.length > 1) return 'monorepo'

    return 'single-package'
  }

  // ── Incremental updates via watcher ────────────────────

  private startWatching(): void {
    if (!this.rootPath) return

    try {
      this.watcher = fs.watch(
        this.rootPath,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (!filename || !this.rootPath) return

          // Only re-analyze when structural files change
          const base = path.basename(filename)
          const isStructural =
            base === 'package.json' ||
            base === 'go.mod' ||
            base === 'pyproject.toml' ||
            base === 'setup.py' ||
            base === 'setup.cfg' ||
            base === 'Cargo.toml' ||
            base === 'pnpm-workspace.yaml' ||
            base === 'Dockerfile'

          if (!isStructural) return

          // Skip ignored directories
          const parts = filename.split(path.sep)
          if (parts.some(p => IGNORE_DIRS.has(p))) return

          this.scheduleReanalyze()
        }
      )

      this.watcher.on('error', () => {
        if (this.watcher) {
          this.watcher.close()
          this.watcher = null
        }
      })
    } catch {
      // Platform may not support recursive watching
    }
  }

  private scheduleReanalyze(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null
      if (!this.rootPath) return

      const rootPath = this.rootPath
      // Stop old watcher before re-analyzing
      if (this.watcher) {
        this.watcher.close()
        this.watcher = null
      }

      await this.analyze(rootPath)
      this.notifyUpdated()
    }, DEBOUNCE_MS)
  }

  private notifyUpdated(): void {
    if (!this.structure) return
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('structure:updated', {
        moduleCount: this.structure.modules.length,
        projectType: this.structure.projectType,
      })
    }
  }

  // ── Utility helpers ────────────────────────────────────

  private async readJson(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const content = await fsp.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  private async readText(filePath: string): Promise<string | null> {
    try {
      return await fsp.readFile(filePath, 'utf-8')
    } catch {
      return null
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async isDirectory(dirPath: string): Promise<boolean> {
    try {
      const stat = await fsp.stat(dirPath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Find files by exact basename within rootPath, up to maxDepth.
   */
  private async findFiles(rootDir: string, targetName: string, maxDepth: number): Promise<string[]> {
    const results: string[] = []
    await this.walkForFile(rootDir, targetName, maxDepth, 0, results)
    return results
  }

  private async walkForFile(
    dir: string,
    targetName: string,
    maxDepth: number,
    currentDepth: number,
    results: string[]
  ): Promise<void> {
    if (currentDepth > maxDepth) return

    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    const subdirPromises: Promise<void>[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          subdirPromises.push(
            this.walkForFile(path.join(dir, entry.name), targetName, maxDepth, currentDepth + 1, results)
          )
        }
      } else if (entry.isFile() && entry.name === targetName) {
        results.push(path.join(dir, entry.name))
      }
    }

    await Promise.all(subdirPromises)
  }
}
