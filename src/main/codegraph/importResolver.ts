/**
 * Import resolver: convert specifiers to absolute file paths (smoke-mib.5).
 *
 * Uses the FilenameIndex for fast lookup instead of filesystem probing.
 * Handles relative imports, path aliases (tsconfig paths), extension resolution.
 * Skips node_modules packages (returns package name as label, not expanded).
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import type { FilenameIndex } from '../index/FilenameIndex'
import type { ParsedImport } from './importParser'

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const INDEX_BASENAMES = JS_EXTENSIONS.map((ext) => `index${ext}`)

export interface ResolvedImport {
  specifier: string
  resolvedPath: string | null  // null means external package
  packageName?: string         // set when it's an npm/stdlib package
}

export interface PathAliases {
  [prefix: string]: string  // e.g., '@renderer/*' → 'src/renderer/*'
}

/**
 * Load path aliases from tsconfig.json (compilerOptions.paths).
 * Returns empty aliases if tsconfig doesn't exist or has no paths.
 */
export async function loadPathAliases(projectRoot: string): Promise<PathAliases> {
  const aliases: PathAliases = {}

  for (const filename of ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
    try {
      const content = await fs.readFile(path.join(projectRoot, filename), 'utf-8')
      // Strip comments (JSON with comments support)
      const clean = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      const config = JSON.parse(clean)
      const paths: Record<string, string[]> = config?.compilerOptions?.paths ?? {}
      const baseUrl = config?.compilerOptions?.baseUrl ?? '.'

      for (const [pattern, targets] of Object.entries(paths)) {
        if (targets.length === 0) continue
        // Convert 'src/renderer/*' to absolute path prefix
        const prefix = pattern.replace(/\/?\*$/, '')
        const targetDir = targets[0].replace(/\/?\*$/, '')
        aliases[prefix] = path.resolve(projectRoot, baseUrl, targetDir)
      }
    } catch {
      // tsconfig doesn't exist or is invalid — skip
    }
  }

  return aliases
}

/**
 * Resolve a single import to an absolute file path.
 */
export function resolveImport(
  parsed: ParsedImport,
  importerPath: string,
  language: string,
  index: FilenameIndex,
  aliases: PathAliases
): ResolvedImport {
  const { specifier } = parsed

  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return resolveJsTs(specifier, importerPath, index, aliases)
    case 'python':
      return resolvePython(specifier, importerPath, index)
    case 'go':
    case 'rust':
      // Package-level only — label but don't expand
      return { specifier, resolvedPath: null, packageName: specifier }
    default:
      return { specifier, resolvedPath: null }
  }
}

/**
 * Resolve all imports for a file, returning only successfully resolved ones.
 */
export function resolveAllImports(
  parsedImports: ParsedImport[],
  importerPath: string,
  language: string,
  index: FilenameIndex,
  aliases: PathAliases
): ResolvedImport[] {
  const results: ResolvedImport[] = []
  const seen = new Set<string>()

  for (const imp of parsedImports) {
    const resolved = resolveImport(imp, importerPath, language, index, aliases)
    if (resolved.resolvedPath && !seen.has(resolved.resolvedPath)) {
      seen.add(resolved.resolvedPath)
      results.push(resolved)
    }
  }

  return results
}

// -- Language-specific resolvers --

function resolveJsTs(
  specifier: string,
  importerPath: string,
  index: FilenameIndex,
  aliases: PathAliases
): ResolvedImport {
  // External package — don't resolve
  if (isExternalPackage(specifier)) {
    return { specifier, resolvedPath: null, packageName: specifier.split('/')[0] }
  }

  const importerDir = path.dirname(importerPath)

  // Relative imports: ./foo, ../bar
  if (specifier.startsWith('.')) {
    const basePath = path.resolve(importerDir, specifier)
    const resolved = tryResolveJsPath(basePath, index)
    return { specifier, resolvedPath: resolved }
  }

  // Path alias resolution: @renderer/stores/sessionStore → src/renderer/stores/sessionStore
  for (const [prefix, targetDir] of Object.entries(aliases)) {
    if (specifier === prefix || specifier.startsWith(prefix + '/')) {
      const rest = specifier.slice(prefix.length)
      const basePath = path.join(targetDir, rest)
      const resolved = tryResolveJsPath(basePath, index)
      if (resolved) return { specifier, resolvedPath: resolved }
    }
  }

  // Bare specifier that's not a known alias — treat as external
  return { specifier, resolvedPath: null, packageName: specifier.split('/')[0] }
}

function tryResolveJsPath(basePath: string, index: FilenameIndex): string | null {
  // Try exact path
  if (index.has(basePath)) return basePath

  // Try adding extensions
  for (const ext of JS_EXTENSIONS) {
    const withExt = basePath + ext
    if (index.has(withExt)) return withExt
  }

  // Try as directory with index file
  for (const idxBase of INDEX_BASENAMES) {
    const indexPath = path.join(basePath, idxBase)
    if (index.has(indexPath)) return indexPath
  }

  return null
}

function resolvePython(
  specifier: string,
  importerPath: string,
  index: FilenameIndex
): ResolvedImport {
  const importerDir = path.dirname(importerPath)
  const relPath = specifier.replace(/\./g, '/')

  // Try as .py file
  const pyPath = path.resolve(importerDir, relPath + '.py')
  if (index.has(pyPath)) return { specifier, resolvedPath: pyPath }

  // Try as package (__init__.py)
  const initPath = path.resolve(importerDir, relPath, '__init__.py')
  if (index.has(initPath)) return { specifier, resolvedPath: initPath }

  return { specifier, resolvedPath: null, packageName: specifier.split('.')[0] }
}

function isExternalPackage(specifier: string): boolean {
  // Relative imports start with .
  if (specifier.startsWith('.')) return false
  // Scoped packages: @scope/pkg
  if (specifier.startsWith('@')) return true
  // Bare specifiers without path prefix are npm packages
  return !specifier.startsWith('/')
}
