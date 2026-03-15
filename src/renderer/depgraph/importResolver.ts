/**
 * Resolve import specifiers to absolute file paths using the file system IPC.
 * Only resolves relative/local imports — external packages are skipped.
 */

import type { ParsedImport } from './importParser'

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const INDEX_FILES = JS_EXTENSIONS.map((ext) => `/index${ext}`)

/**
 * Attempt to resolve a single import specifier to an absolute file path.
 * Returns null if the import is external (npm package, stdlib, etc.).
 */
export async function resolveImport(
  specifier: string,
  importerDir: string,
  language: string
): Promise<string | null> {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return resolveJsTs(specifier, importerDir)
    case 'python':
      return resolvePython(specifier, importerDir)
    case 'go':
    case 'rust':
      // Go and Rust imports are package/crate-level — skip resolution
      return null
    default:
      return null
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await window.smokeAPI.fs.readfile(path, 1)
    return true
  } catch {
    return false
  }
}

async function resolveJsTs(specifier: string, importerDir: string): Promise<string | null> {
  // Only resolve relative imports
  if (!specifier.startsWith('.')) return null

  const basePath = `${importerDir}/${specifier}`

  // Try exact path first
  if (await fileExists(basePath)) return basePath

  // Try adding extensions
  for (const ext of JS_EXTENSIONS) {
    const withExt = basePath + ext
    if (await fileExists(withExt)) return withExt
  }

  // Try as directory with index file
  for (const idx of INDEX_FILES) {
    const indexPath = basePath + idx
    if (await fileExists(indexPath)) return indexPath
  }

  return null
}

async function resolvePython(specifier: string, importerDir: string): Promise<string | null> {
  // Only resolve relative-looking imports (containing dots or single-word local modules)
  // Convert dot notation to path
  const relPath = specifier.replace(/\./g, '/')

  // Try as a .py file
  const pyPath = `${importerDir}/${relPath}.py`
  if (await fileExists(pyPath)) return pyPath

  // Try as a package (__init__.py)
  const initPath = `${importerDir}/${relPath}/__init__.py`
  if (await fileExists(initPath)) return initPath

  return null
}

/**
 * Resolve all imports from a parsed list, filtering out unresolvable ones.
 */
export async function resolveAllImports(
  parsedImports: ParsedImport[],
  importerDir: string,
  language: string
): Promise<string[]> {
  const resolved: string[] = []
  const seen = new Set<string>()

  for (const imp of parsedImports) {
    const path = await resolveImport(imp.specifier, importerDir, language)
    if (path && !seen.has(path)) {
      seen.add(path)
      resolved.push(path)
    }
  }

  return resolved
}
