import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseImports, detectLanguage, extractImportsFromFile } from '../importParser'

describe('detectLanguage', () => {
  it('detects JS extensions', () => {
    expect(detectLanguage('foo.js')).toBe('javascript')
    expect(detectLanguage('foo.jsx')).toBe('jsx')
    expect(detectLanguage('foo.mjs')).toBe('javascript')
    expect(detectLanguage('foo.cjs')).toBe('javascript')
  })

  it('detects TS extensions', () => {
    expect(detectLanguage('foo.ts')).toBe('typescript')
    expect(detectLanguage('foo.tsx')).toBe('tsx')
    expect(detectLanguage('foo.mts')).toBe('typescript')
    expect(detectLanguage('foo.cts')).toBe('typescript')
  })

  it('detects Python', () => {
    expect(detectLanguage('main.py')).toBe('python')
    expect(detectLanguage('script.pyw')).toBe('python')
  })

  it('detects Go', () => {
    expect(detectLanguage('main.go')).toBe('go')
  })

  it('detects Rust', () => {
    expect(detectLanguage('lib.rs')).toBe('rust')
  })

  it('detects C#', () => {
    expect(detectLanguage('Program.cs')).toBe('csharp')
  })

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('file.txt')).toBeNull()
    expect(detectLanguage('file.html')).toBeNull()
    expect(detectLanguage('Makefile')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(detectLanguage('FOO.TS')).toBe('typescript')
    expect(detectLanguage('bar.PY')).toBe('python')
  })
})

describe('parseImports', () => {
  describe('JS/TS', () => {
    it('parses ES imports', () => {
      const code = `
import { foo } from './foo'
import bar from '../bar'
import * as baz from 'baz'
`
      const result = parseImports(code, 'typescript')
      expect(result.map(r => r.specifier)).toEqual(['./foo', '../bar', 'baz'])
    })

    it('parses side-effect imports', () => {
      const result = parseImports(`import './styles.css'`, 'javascript')
      expect(result).toEqual([{ specifier: './styles.css', type: 'import', line: 1 }])
    })

    it('parses dynamic imports', () => {
      const result = parseImports(`const mod = import('./dynamic')`, 'typescript')
      expect(result).toEqual([{ specifier: './dynamic', type: 'import', line: 1 }])
    })

    it('parses require calls', () => {
      const code = `const fs = require('fs')\nconst path = require('path')`
      const result = parseImports(code, 'javascript')
      expect(result.map(r => r.specifier)).toEqual(['fs', 'path'])
      expect(result.every(r => r.type === 'require')).toBe(true)
    })

    it('parses re-exports', () => {
      const result = parseImports(`export { default } from './re-exported'`, 'typescript')
      expect(result[0].specifier).toBe('./re-exported')
      expect(result[0].type).toBe('import')
    })

    it('deduplicates specifiers', () => {
      const code = `
import { a } from './shared'
import { b } from './shared'
`
      const result = parseImports(code, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].specifier).toBe('./shared')
    })

    it('handles double-quoted imports', () => {
      const result = parseImports(`import foo from "bar"`, 'javascript')
      expect(result[0].specifier).toBe('bar')
    })

    it('tracks line numbers', () => {
      const code = `import a from 'a'\nimport b from 'b'\nimport c from 'c'`
      const result = parseImports(code, 'typescript')
      expect(result.map(r => r.line)).toEqual([1, 2, 3])
    })

    it('accepts short language aliases', () => {
      const result = parseImports(`import a from 'a'`, 'ts')
      expect(result[0].specifier).toBe('a')
      const result2 = parseImports(`import b from 'b'`, 'js')
      expect(result2[0].specifier).toBe('b')
    })
  })

  describe('Python', () => {
    it('parses import statements', () => {
      const code = `
import os
import sys
import foo.bar
`
      const result = parseImports(code, 'python')
      expect(result.map(r => r.specifier)).toEqual(['os', 'sys', 'foo.bar'])
    })

    it('parses from-import statements', () => {
      const code = `from collections import OrderedDict\nfrom os.path import join`
      const result = parseImports(code, 'python')
      expect(result.map(r => r.specifier)).toEqual(['collections', 'os.path'])
    })

    it('deduplicates', () => {
      const code = `import os\nimport os`
      const result = parseImports(code, 'python')
      expect(result).toHaveLength(1)
    })
  })

  describe('Go', () => {
    it('parses single import', () => {
      const result = parseImports(`import "fmt"`, 'go')
      expect(result[0].specifier).toBe('fmt')
    })

    it('parses grouped imports', () => {
      const code = `
import (
	"fmt"
	"os"
	myalias "github.com/user/pkg"
)
`
      const result = parseImports(code, 'go')
      expect(result.map(r => r.specifier)).toEqual([
        'fmt', 'os', 'github.com/user/pkg'
      ])
    })

    it('handles aliased single import', () => {
      const result = parseImports(`import f "fmt"`, 'go')
      expect(result[0].specifier).toBe('fmt')
    })
  })

  describe('Rust', () => {
    it('parses use statements', () => {
      const code = `
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::utils;
`
      const result = parseImports(code, 'rust')
      expect(result.map(r => r.specifier)).toEqual([
        'std::collections::HashMap',
        'serde::{Serialize, Deserialize}',
        'crate::utils',
      ])
    })

    it('parses glob imports', () => {
      const result = parseImports(`use std::io::*;`, 'rust')
      expect(result[0].specifier).toBe('std::io::*')
    })
  })

  describe('C#', () => {
    it('parses using statements', () => {
      const code = `
using System;
using System.Collections.Generic;
using System.Linq;
`
      const result = parseImports(code, 'csharp')
      expect(result.map(r => r.specifier)).toEqual([
        'System',
        'System.Collections.Generic',
        'System.Linq',
      ])
    })

    it('parses using static', () => {
      const result = parseImports(`using static System.Math;`, 'csharp')
      expect(result[0].specifier).toBe('System.Math')
    })

    it('parses using alias', () => {
      const result = parseImports(`using MyList = System.Collections.Generic.List;`, 'csharp')
      expect(result[0].specifier).toBe('System.Collections.Generic.List')
    })

    it('tracks line numbers', () => {
      const code = `using System;\nusing System.IO;`
      const result = parseImports(code, 'csharp')
      expect(result.map(r => r.line)).toEqual([1, 2])
    })

    it('deduplicates', () => {
      const code = `using System;\nusing System;`
      const result = parseImports(code, 'csharp')
      expect(result).toHaveLength(1)
    })
  })
})

describe('extractImportsFromFile', () => {
  const tmpDir = join(tmpdir(), `smoke-import-test-${Date.now()}`)

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('extracts imports from a .ts file', () => {
    const file = join(tmpDir, 'test.ts')
    writeFileSync(file, `import { foo } from './foo'\nimport bar from 'bar'\n`)
    const result = extractImportsFromFile(file)
    expect(result.map(r => r.specifier)).toEqual(['./foo', 'bar'])
  })

  it('extracts imports from a .py file', () => {
    const file = join(tmpDir, 'test.py')
    writeFileSync(file, `import os\nfrom sys import argv\n`)
    const result = extractImportsFromFile(file)
    expect(result.map(r => r.specifier)).toEqual(['os', 'sys'])
  })

  it('extracts imports from a .cs file', () => {
    const file = join(tmpDir, 'test.cs')
    writeFileSync(file, `using System;\nusing System.Linq;\n`)
    const result = extractImportsFromFile(file)
    expect(result.map(r => r.specifier)).toEqual(['System', 'System.Linq'])
  })

  it('returns empty for unsupported extensions', () => {
    const file = join(tmpDir, 'readme.md')
    writeFileSync(file, `# Hello`)
    expect(extractImportsFromFile(file)).toEqual([])
  })

  it('reads only the first 4KB', () => {
    const file = join(tmpDir, 'big.ts')
    // Put an import in the first 4KB and one after 4KB
    const padding = 'x'.repeat(4096)
    writeFileSync(file, `import a from 'a'\n${padding}\nimport b from 'b'\n`)
    const result = extractImportsFromFile(file)
    expect(result.map(r => r.specifier)).toEqual(['a'])
  })
})
