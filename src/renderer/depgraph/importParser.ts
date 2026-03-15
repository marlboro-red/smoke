/**
 * Regex-based import parser for common languages.
 * Returns raw import specifiers (not resolved file paths).
 */

export interface ParsedImport {
  specifier: string
  type: 'import' | 'require' | 'use'
}

/**
 * Parse import statements from source code based on language.
 */
export function parseImports(content: string, language: string): ParsedImport[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return parseJsTs(content)
    case 'python':
      return parsePython(content)
    case 'go':
      return parseGo(content)
    case 'rust':
      return parseRust(content)
    case 'csharp':
      return parseCSharp(content)
    default:
      return []
  }
}

function parseJsTs(content: string): ParsedImport[] {
  const imports: ParsedImport[] = []
  const seen = new Set<string>()

  // ES import: import ... from 'specifier'
  // Also handles: import 'specifier' (side-effect imports)
  const esImportRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = esImportRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      imports.push({ specifier: m[1], type: 'import' })
    }
  }

  // Dynamic import: import('specifier')
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynamicRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      imports.push({ specifier: m[1], type: 'import' })
    }
  }

  // CommonJS require: require('specifier')
  const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = requireRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      imports.push({ specifier: m[1], type: 'require' })
    }
  }

  // Re-export: export ... from 'specifier'
  const reExportRe = /export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g
  while ((m = reExportRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      imports.push({ specifier: m[1], type: 'import' })
    }
  }

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

  // from foo import bar, from foo.bar import baz
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

  // use foo::bar; or use foo::bar::{baz, qux};
  const useRe = /use\s+([\w:]+)/g
  let m: RegExpExecArray | null
  while ((m = useRe.exec(content)) !== null) {
    // Take the top-level crate name
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

  // using System; using static System.Math; using MyAlias = Some.Namespace;
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
