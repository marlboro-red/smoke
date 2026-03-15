import { describe, it, expect } from 'vitest'
import { parseImports, detectLanguage } from '../importParser'

describe('parseImports', () => {
  describe('TypeScript / JavaScript', () => {
    it('parses ES imports', () => {
      const code = `
import { foo } from './foo'
import bar from '../bar'
import './side-effect'
`
      const result = parseImports(code, 'typescript')
      expect(result).toEqual([
        { specifier: './foo', type: 'import' },
        { specifier: '../bar', type: 'import' },
        { specifier: './side-effect', type: 'import' },
      ])
    })

    it('parses dynamic imports', () => {
      const code = `const mod = import('./lazy')`
      const result = parseImports(code, 'typescript')
      expect(result).toEqual([{ specifier: './lazy', type: 'import' }])
    })

    it('parses require calls', () => {
      const code = `const x = require('lodash')`
      const result = parseImports(code, 'javascript')
      expect(result).toEqual([{ specifier: 'lodash', type: 'require' }])
    })

    it('parses re-exports', () => {
      const code = `export { default } from './utils'`
      const result = parseImports(code, 'typescript')
      expect(result).toEqual([{ specifier: './utils', type: 'import' }])
    })

    it('deduplicates', () => {
      const code = `
import { a } from './mod'
import { b } from './mod'
`
      const result = parseImports(code, 'typescript')
      expect(result.length).toBe(1)
    })
  })

  describe('Python', () => {
    it('parses import statements', () => {
      const code = `
import os
import sys
from pathlib import Path
from os.path import join
`
      const result = parseImports(code, 'python')
      expect(result).toEqual([
        { specifier: 'os', type: 'import' },
        { specifier: 'sys', type: 'import' },
        { specifier: 'pathlib', type: 'import' },
        { specifier: 'os.path', type: 'import' },
      ])
    })
  })

  describe('Go', () => {
    it('parses single and grouped imports', () => {
      const code = `
import "fmt"
import (
  "os"
  "strings"
)
`
      const result = parseImports(code, 'go')
      expect(result).toEqual([
        { specifier: 'fmt', type: 'import' },
        { specifier: 'os', type: 'import' },
        { specifier: 'strings', type: 'import' },
      ])
    })
  })

  describe('Rust', () => {
    it('parses use statements and extracts crate name', () => {
      const code = `
use std::collections::HashMap;
use tokio::fs;
`
      const result = parseImports(code, 'rust')
      expect(result).toEqual([
        { specifier: 'std', type: 'use' },
        { specifier: 'tokio', type: 'use' },
      ])
    })
  })

  describe('C#', () => {
    it('parses using statements', () => {
      const code = `
using System;
using System.Collections.Generic;
`
      const result = parseImports(code, 'csharp')
      expect(result).toEqual([
        { specifier: 'System', type: 'use' },
        { specifier: 'System.Collections.Generic', type: 'use' },
      ])
    })

    it('parses using static', () => {
      const code = `using static System.Math;`
      const result = parseImports(code, 'csharp')
      expect(result).toEqual([{ specifier: 'System.Math', type: 'use' }])
    })

    it('parses using alias', () => {
      const code = `using MyList = System.Collections.Generic.List<int>;`
      const result = parseImports(code, 'csharp')
      expect(result).toEqual([{ specifier: 'System.Collections.Generic.List', type: 'use' }])
    })

    it('deduplicates', () => {
      const code = `
using System;
using System;
`
      const result = parseImports(code, 'csharp')
      expect(result).toHaveLength(1)
    })
  })

  describe('unsupported language', () => {
    it('returns empty array', () => {
      expect(parseImports('anything', 'haskell')).toEqual([])
    })
  })
})

describe('detectLanguage', () => {
  it('detects common extensions', () => {
    expect(detectLanguage('/foo/bar.ts')).toBe('typescript')
    expect(detectLanguage('/foo/bar.tsx')).toBe('tsx')
    expect(detectLanguage('/foo/bar.js')).toBe('javascript')
    expect(detectLanguage('/foo/bar.py')).toBe('python')
    expect(detectLanguage('/foo/bar.go')).toBe('go')
    expect(detectLanguage('/foo/bar.rs')).toBe('rust')
    expect(detectLanguage('/foo/bar.cs')).toBe('csharp')
  })

  it('returns text for unknown extensions', () => {
    expect(detectLanguage('/foo/bar.xyz')).toBe('text')
  })
})
