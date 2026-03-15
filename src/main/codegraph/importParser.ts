/**
 * Regex-based import parser with early termination (smoke-mib.1).
 *
 * Reads only the first ~4KB of content (imports are at the top).
 * Supports JS/TS, Python, Go, Rust.
 * Returns raw import specifiers — resolution is separate.
 */

export interface ParsedImport {
  specifier: string
  type: 'import' | 'require' | 'use'
}

/** Maximum bytes to scan for imports (imports are always at the top). */
const IMPORT_SCAN_LIMIT = 4096

/**
 * Parse import statements from source content.
 * Only scans the first IMPORT_SCAN_LIMIT characters for performance.
 */
export function parseImports(content: string, language: string): ParsedImport[] {
  const snippet = content.slice(0, IMPORT_SCAN_LIMIT)

  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return parseJsTs(snippet)
    case 'python':
      return parsePython(snippet)
    case 'go':
      return parseGo(snippet)
    case 'rust':
      return parseRust(snippet)
    case 'csharp':
      return parseCSharp(snippet)
    default:
      return []
  }
}

/** Detect language from file extension. */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    mjs: 'javascript', cjs: 'javascript',
    py: 'python', rs: 'rust', go: 'go', cs: 'csharp',
  }
  return langMap[ext] || 'text'
}

function parseJsTs(content: string): ParsedImport[] {
  const imports: ParsedImport[] = []
  const seen = new Set<string>()

  function add(specifier: string, type: ParsedImport['type']): void {
    if (!seen.has(specifier)) {
      seen.add(specifier)
      imports.push({ specifier, type })
    }
  }

  // ES import: import ... from 'specifier' or import 'specifier'
  const esImportRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = esImportRe.exec(content)) !== null) add(m[1], 'import')

  // Dynamic import: import('specifier')
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynamicRe.exec(content)) !== null) add(m[1], 'import')

  // CommonJS require: require('specifier')
  const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = requireRe.exec(content)) !== null) add(m[1], 'require')

  // Re-export: export ... from 'specifier'
  const reExportRe = /export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g
  while ((m = reExportRe.exec(content)) !== null) add(m[1], 'import')

  return imports
}

function parsePython(content: string): ParsedImport[] {
  const imports: ParsedImport[] = []
  const seen = new Set<string>()

  // import foo, import foo.bar
  const importRe = /^import\s+([\w.]+)/gm
  let m: RegExpExecArray | null
  while ((m = importRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      imports.push({ specifier: m[1], type: 'import' })
    }
  }

  // from foo import bar
  const fromRe = /^from\s+([\w.]+)\s+import/gm
  while ((m = fromRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      imports.push({ specifier: m[1], type: 'import' })
    }
  }

  return imports
}

function parseGo(content: string): ParsedImport[] {
  const imports: ParsedImport[] = []
  const seen = new Set<string>()

  // Single import: import "pkg"
  const singleRe = /import\s+"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = singleRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      imports.push({ specifier: m[1], type: 'import' })
    }
  }

  // Grouped import: import ( "pkg1" \n "pkg2" )
  const groupRe = /import\s*\(([\s\S]*?)\)/g
  while ((m = groupRe.exec(content)) !== null) {
    const block = m[1]
    const lineRe = /(?:\w+\s+)?"([^"]+)"/g
    let lm: RegExpExecArray | null
    while ((lm = lineRe.exec(block)) !== null) {
      if (!seen.has(lm[1])) {
        seen.add(lm[1])
        imports.push({ specifier: lm[1], type: 'import' })
      }
    }
  }

  return imports
}

function parseRust(content: string): ParsedImport[] {
  const imports: ParsedImport[] = []
  const seen = new Set<string>()

  // use foo::bar; → extract top-level crate name
  const useRe = /use\s+([\w:]+)/g
  let m: RegExpExecArray | null
  while ((m = useRe.exec(content)) !== null) {
    const crate = m[1].split('::')[0]
    if (crate && !seen.has(crate)) {
      seen.add(crate)
      imports.push({ specifier: crate, type: 'use' })
    }
  }

  return imports
}

function parseCSharp(content: string): ParsedImport[] {
  const imports: ParsedImport[] = []
  const seen = new Set<string>()

  // using System; using System.Collections.Generic; using static System.Math;
  // using MyAlias = Some.Namespace;
  const usingRe = /^using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)(?:<[^>]*>)?\s*;/gm
  let m: RegExpExecArray | null
  while ((m = usingRe.exec(content)) !== null) {
    const ns = m[1]
    if (ns && !seen.has(ns)) {
      seen.add(ns)
      imports.push({ specifier: ns, type: 'use' })
    }
  }

  return imports
}
