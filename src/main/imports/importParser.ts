import { openSync, readSync, closeSync } from 'fs'

/** Maximum bytes to read from each file (imports are at the top) */
const READ_LIMIT = 4096

export type Language = 'js' | 'ts' | 'python' | 'go' | 'rust' | 'csharp'

export interface ParsedImport {
  specifier: string
  line: number
}

// --- Language detection ---

const EXT_MAP: Record<string, Language> = {
  '.js': 'js',
  '.jsx': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.ts': 'ts',
  '.tsx': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
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

  function collect(regex: RegExp): void {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(source)) !== null) {
      const specifier = match[1]
      if (!seen.has(specifier)) {
        seen.add(specifier)
        results.push({ specifier, line: lineAt(source, match.index) })
      }
    }
  }

  // ES import: import ... from 'specifier'  |  import 'specifier'
  collect(/import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)
  // CommonJS require
  collect(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
  // Re-exports: export ... from 'specifier'
  collect(/export\s+(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g)

  return results
}

function extractPython(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  function collect(regex: RegExp): void {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(source)) !== null) {
      const specifier = match[1]
      if (!seen.has(specifier)) {
        seen.add(specifier)
        results.push({ specifier, line: lineAt(source, match.index) })
      }
    }
  }

  collect(/^import\s+([\w.]+)/gm)
  collect(/^from\s+([\w.]+)\s+import/gm)

  return results
}

function extractGo(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  // Single import: import "pkg" or import alias "pkg"
  const singleRe = /import\s+(?:\w+\s+)?"([^"]+)"/g
  singleRe.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = singleRe.exec(source)) !== null) {
    // Skip if inside a group import block
    const before = source.slice(Math.max(0, match.index - 20), match.index)
    if (before.includes('(')) continue
    const specifier = match[1]
    if (!seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, line: lineAt(source, match.index) })
    }
  }

  // Group import: import ( ... )
  const groupRe = /import\s*\(([\s\S]*?)\)/g
  groupRe.lastIndex = 0
  while ((match = groupRe.exec(source)) !== null) {
    const groupContent = match[1]
    const groupStart = match.index + source.slice(match.index).indexOf('(') + 1
    const lineRe = /(?:\w+\s+)?"([^"]+)"/g
    lineRe.lastIndex = 0
    let inner: RegExpExecArray | null
    while ((inner = lineRe.exec(groupContent)) !== null) {
      const specifier = inner[1]
      if (!seen.has(specifier)) {
        seen.add(specifier)
        results.push({ specifier, line: lineAt(source, groupStart + inner.index) })
      }
    }
  }

  return results
}

function extractRust(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  const useRe = /^use\s+([\w:]+(?:::\{[^}]*\})?(?:::\*)?)\s*;/gm
  useRe.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = useRe.exec(source)) !== null) {
    const specifier = match[1]
    if (!seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, line: lineAt(source, match.index) })
    }
  }

  return results
}

function extractCSharp(source: string): ParsedImport[] {
  const results: ParsedImport[] = []
  const seen = new Set<string>()

  // using System; using static System.Math; using MyAlias = Some.Namespace;
  const usingRe = /^using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)(?:<[^>]*>)?\s*;/gm
  usingRe.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = usingRe.exec(source)) !== null) {
    const specifier = match[1]
    if (specifier && !seen.has(specifier)) {
      seen.add(specifier)
      results.push({ specifier, line: lineAt(source, match.index) })
    }
  }

  return results
}

// --- Public API ---

/**
 * Parse import specifiers from a source string.
 */
export function parseImports(source: string, language: Language): ParsedImport[] {
  switch (language) {
    case 'js':
    case 'ts':
      return extractJS(source)
    case 'python':
      return extractPython(source)
    case 'go':
      return extractGo(source)
    case 'rust':
      return extractRust(source)
    case 'csharp':
      return extractCSharp(source)
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
