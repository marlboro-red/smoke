import { describe, it, expect } from 'vitest'
import { parseImports, detectLanguage } from '../../imports/importParser'

describe('parseImports', () => {
  describe('TypeScript / JavaScript', () => {
    it('parses ES imports', () => {
      const code = `
import { foo } from './foo'
import bar from '../bar'
import './side-effect'
`
      const result = parseImports(code, 'typescript')
      expect(result.map(r => r.specifier)).toEqual(['./foo', '../bar', './side-effect'])
      expect(result.every(r => r.type === 'import')).toBe(true)
    })

    it('parses dynamic imports', () => {
      const code = `const mod = import('./lazy')`
      const result = parseImports(code, 'typescript')
      expect(result).toEqual([{ specifier: './lazy', type: 'import', line: 1 }])
    })

    it('parses require calls', () => {
      const code = `const x = require('lodash')`
      const result = parseImports(code, 'javascript')
      expect(result).toEqual([{ specifier: 'lodash', type: 'require', line: 1 }])
    })

    it('parses re-exports', () => {
      const code = `export { default } from './utils'`
      const result = parseImports(code, 'typescript')
      expect(result).toEqual([{ specifier: './utils', type: 'import', line: 1 }])
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
      expect(result.map(r => r.specifier)).toEqual(['os', 'sys', 'pathlib', 'os.path'])
      expect(result.every(r => r.type === 'import')).toBe(true)
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
      expect(result.map(r => r.specifier)).toEqual(['fmt', 'os', 'strings'])
      expect(result.every(r => r.type === 'import')).toBe(true)
    })
  })

  describe('Rust', () => {
    it('parses use statements', () => {
      const code = `
use std::collections::HashMap;
use tokio::fs;
`
      const result = parseImports(code, 'rust')
      expect(result.map(r => r.specifier)).toEqual(['std::collections::HashMap', 'tokio::fs'])
      expect(result.every(r => r.type === 'use')).toBe(true)
    })
  })

  describe('C#', () => {
    it('parses using statements', () => {
      const code = `
using System;
using System.Collections.Generic;
`
      const result = parseImports(code, 'csharp')
      expect(result.map(r => r.specifier)).toEqual(['System', 'System.Collections.Generic'])
      expect(result.every(r => r.type === 'use')).toBe(true)
    })

    it('parses using static', () => {
      const code = `using static System.Math;`
      const result = parseImports(code, 'csharp')
      expect(result).toEqual([{ specifier: 'System.Math', type: 'use', line: 1 }])
    })

    it('parses using alias', () => {
      const code = `using MyList = System.Collections.Generic.List<int>;`
      const result = parseImports(code, 'csharp')
      expect(result).toEqual([{ specifier: 'System.Collections.Generic.List', type: 'use', line: 1 }])
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

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('/foo/bar.xyz')).toBeNull()
  })
})
