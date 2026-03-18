import { openSync, readSync, closeSync } from 'fs'

/** Maximum bytes to read from each file (imports are at the top) */
const READ_LIMIT = 4096

export type Language =
  | 'typescript' | 'javascript' | 'tsx' | 'jsx'
  | 'python' | 'go' | 'rust' | 'csharp'

export interface ParsedImport {
  specifier: string
  type: 'import' | 'require' | 'use'
  line: number
}

// --- Language detection ---

const EXT_MAP: Record<string, Language> = {
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.cs': 'csharp',
}

export function detectLanguage(filePath: string): Language | null {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return null
  return EXT_MAP[filePath.slice(dot).toLowerCase()] ?? null
}

// --- Helpers ---

function lineAt(source: string, index: number): number {
  let n = 1
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) n++
  }
  return n
}

// --- Per-language extractors ---

function extractJS(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  function add(specifier: string, type: ParsedImport['type'], index: number): void {
    if (!seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, type, line: lineAt(source, index) })
    }
  }

  // ES import: import ... from 'specifier'  |  import 'specifier'
  const esImportRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = esImportRe.exec(source)) !== null) add(m[1], 'import', m.index)

  // Dynamic import: import('specifier')
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynamicRe.exec(source)) !== null) add(m[1], 'import', m.index)

  // CommonJS require: require('specifier')
  const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = requireRe.exec(source)) !== null) add(m[1], 'require', m.index)

  // Re-export: export ... from 'specifier'
  const reExportRe = /export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g
  while ((m = reExportRe.exec(source)) !== null) add(m[1], 'import', m.index)

  return results
}

function extractPython(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  function add(specifier: string, index: number): void {
    if (!seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, type: 'import', line: lineAt(source, index) })
    }
  }

  const importRe = /^import\s+([\w.]+)/gm
  let m: RegExpExecArray | null
  while ((m = importRe.exec(source)) !== null) add(m[1], m.index)

  const fromRe = /^from\s+([\w.]+)\s+import/gm
  while ((m = fromRe.exec(source)) !== null) add(m[1], m.index)

  return results
}

function extractGo(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  function add(specifier: string, index: number): void {
    if (!seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, type: 'import', line: lineAt(source, index) })
    }
  }

  // Single import: import "pkg" or import alias "pkg"
  const singleRe = /import\s+(?:\w+\s+)?"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = singleRe.exec(source)) !== null) {
    // Skip if inside a group import block
    const before = source.slice(Math.max(0, m.index - 20), m.index)
    if (before.includes('(')) continue
    add(m[1], m.index)
  }

  // Group import: import ( ... )
  const groupRe = /import\s*\(([\s\S]*?)\)/g
  while ((m = groupRe.exec(source)) !== null) {
    const groupContent = m[1]
    const groupStart = m.index + source.slice(m.index).indexOf('(') + 1
    const lineRe = /(?:\w+\s+)?"([^"]+)"/g
    let inner: RegExpExecArray | null
    while ((inner = lineRe.exec(groupContent)) !== null) {
      add(inner[1], groupStart + inner.index)
    }
  }

  return results
}

function extractRust(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  const useRe = /^use\s+([\w:]+(?:::\{[^}]*\})?(?:::\*)?)\s*;/gm
  let m: RegExpExecArray | null
  while ((m = useRe.exec(source)) !== null) {
    const specifier = m[1]
    if (!seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, type: 'use', line: lineAt(source, m.index) })
    }
  }

  return results
}

function extractCSharp(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  const usingRe = /^using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)(?:<[^>]*>)?\s*;/gm
  let m: RegExpExecArray | null
  while ((m = usingRe.exec(source)) !== null) {
    const specifier = m[1]
    if (specifier && !seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, type: 'use', line: lineAt(source, m.index) })
    }
  }

  return results
}

// --- Public API ---

/**
 * Parse import specifiers from a source string.
 * Accepts both short ('js', 'ts') and full ('javascript', 'typescript') language names.
 */
export function parseImports(source: string, language: string): ParsedImport[] {
  switch (language) {
    case 'js':
    case 'javascript':
    case 'jsx':
    case 'ts':
    case 'typescript':
    case 'tsx':
      return extractJS(source)
    case 'python':
      return extractPython(source)
    case 'go':
      return extractGo(source)
    case 'rust':
      return extractRust(source)
    case 'csharp':
      return extractCSharp(source)
    default:
      return []
  }
}

/**
 * Extract import specifiers from a file on disk.
 * Reads only the first 4KB for performance.
 * Returns an empty array for unsupported file types.
 */
export function extractImportsFromFile(filePath: string): ParsedImport[] {
  const lang = detectLanguage(filePath)
  if (!lang) return []

  const fd = openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(READ_LIMIT)
    const bytesRead = readSync(fd, buf, 0, READ_LIMIT, 0)
    const source = buf.toString('utf8', 0, bytesRead)
    return parseImports(source, lang)
  } finally {
    closeSync(fd)
  }
}
