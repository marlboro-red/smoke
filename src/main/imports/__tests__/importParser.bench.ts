import { bench, describe } from 'vitest'
import { parseImports, detectLanguage } from '../importParser'
import type { Language } from '../importParser'

// --- Synthetic source files ---

function generateJSSource(importCount: number): string {
  const lines: string[] = []
  for (let i = 0; i < importCount; i++) {
    if (i % 3 === 0) {
      lines.push(`import { thing${i} } from './module${i}'`)
    } else if (i % 3 === 1) {
      lines.push(`const mod${i} = require('./lib${i}')`)
    } else {
      lines.push(`export { default } from './reexport${i}'`)
    }
  }
  lines.push('// end of imports')
  lines.push('function main() { console.log("hello") }')
  return lines.join('\n')
}

function generatePythonSource(importCount: number): string {
  const lines: string[] = []
  for (let i = 0; i < importCount; i++) {
    if (i % 2 === 0) {
      lines.push(`import module${i}`)
    } else {
      lines.push(`from package${i} import thing${i}`)
    }
  }
  lines.push('def main(): pass')
  return lines.join('\n')
}

function generateGoSource(importCount: number): string {
  const lines = ['package main', '', 'import (']
  for (let i = 0; i < importCount; i++) {
    lines.push(`\t"github.com/org/repo${i}/pkg${i}"`)
  }
  lines.push(')', '', 'func main() {}')
  return lines.join('\n')
}

function generateRustSource(importCount: number): string {
  const lines: string[] = []
  for (let i = 0; i < importCount; i++) {
    lines.push(`use crate::module${i}::Thing${i};`)
  }
  lines.push('fn main() {}')
  return lines.join('\n')
}

function generateCSharpSource(importCount: number): string {
  const lines: string[] = []
  for (let i = 0; i < importCount; i++) {
    lines.push(`using System.Collections.Generic${i};`)
  }
  lines.push('class Program { static void Main() {} }')
  return lines.join('\n')
}

// --- Parse throughput ---

describe('importParser throughput', () => {
  const js50 = generateJSSource(50)
  const js100 = generateJSSource(100)
  const py100 = generatePythonSource(100)
  const go100 = generateGoSource(100)
  const rust100 = generateRustSource(100)
  const csharp100 = generateCSharpSource(100)

  bench('parseImports JS — 50 imports', () => {
    parseImports(js50, 'js')
  })

  bench('parseImports JS — 100 imports', () => {
    parseImports(js100, 'js')
  })

  bench('parseImports Python — 100 imports', () => {
    parseImports(py100, 'python')
  })

  bench('parseImports Go — 100 imports', () => {
    parseImports(go100, 'go')
  })

  bench('parseImports Rust — 100 imports', () => {
    parseImports(rust100, 'rust')
  })

  bench('parseImports C# — 100 imports', () => {
    parseImports(csharp100, 'csharp')
  })
})

// --- Batch parsing (simulates project-wide import scan) ---

describe('importParser batch throughput', () => {
  const sources: Array<{ source: string; lang: Language }> = []
  for (let i = 0; i < 200; i++) {
    if (i % 5 === 0) sources.push({ source: generatePythonSource(20), lang: 'python' })
    else if (i % 5 === 1) sources.push({ source: generateGoSource(20), lang: 'go' })
    else if (i % 5 === 2) sources.push({ source: generateRustSource(20), lang: 'rust' })
    else if (i % 5 === 3) sources.push({ source: generateCSharpSource(20), lang: 'csharp' })
    else sources.push({ source: generateJSSource(20), lang: 'ts' })
  }

  bench('parse 200 mixed-language files (20 imports each)', () => {
    for (const { source, lang } of sources) {
      parseImports(source, lang)
    }
  })
})

// --- Language detection ---

describe('detectLanguage throughput', () => {
  const paths = [
    'src/index.ts', 'lib/util.js', 'app.py', 'main.go',
    'lib.rs', 'Program.cs', 'README.md', 'style.css',
    'data.json', 'config.yaml', 'test.tsx', 'module.mjs',
  ]

  bench('detectLanguage 10K lookups', () => {
    for (let i = 0; i < 10_000; i++) {
      detectLanguage(paths[i % paths.length])
    }
  })
})
