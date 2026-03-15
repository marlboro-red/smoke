import { describe, it, expect } from 'vitest'
import { parseImports } from '../importParser'

describe('parseImports', () => {
  describe('TypeScript / JavaScript', () => {
    it('parses ES imports', () => {
      const code = `
import { foo } from './foo'
import bar from '../bar'
import * as baz from 'baz'
`
      const result = parseImports(code, 'typescript')
      expect(result).toEqual([
        { specifier: './foo', type: 'import' },
        { specifier: '../bar', type: 'import' },
        { specifier: 'baz', type: 'import' },
      ])
    })

    it('parses side-effect imports', () => {
      const code = `import './styles.css'`
      const result = parseImports(code, 'javascript')
      expect(result).toEqual([{ specifier: './styles.css', type: 'import' }])
    })

    it('parses dynamic imports', () => {
      const code = `const mod = await import('./dynamic')`
      const result = parseImports(code, 'tsx')
      expect(result).toEqual([{ specifier: './dynamic', type: 'import' }])
    })

    it('parses require calls', () => {
      const code = `const fs = require('fs')\nconst path = require('path')`
      const result = parseImports(code, 'javascript')
      expect(result).toEqual([
        { specifier: 'fs', type: 'require' },
        { specifier: 'path', type: 'require' },
      ])
    })

    it('parses re-exports', () => {
      const code = `export { default } from './re-exported'`
      const result = parseImports(code, 'typescript')
      expect(result).toEqual([{ specifier: './re-exported', type: 'import' }])
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
  })

  describe('Python', () => {
    it('parses import statements', () => {
      const code = `
import os
import sys
import foo.bar
`
      const result = parseImports(code, 'python')
      expect(result).toEqual([
        { specifier: 'os', type: 'import' },
        { specifier: 'sys', type: 'import' },
        { specifier: 'foo.bar', type: 'import' },
      ])
    })

    it('parses from-import statements', () => {
      const code = `from collections import OrderedDict\nfrom .utils import helper`
      const result = parseImports(code, 'python')
      expect(result).toEqual([
        { specifier: 'collections', type: 'import' },
        { specifier: '.utils', type: 'import' },
      ])
    })
  })

  describe('Go', () => {
    it('parses single import', () => {
      const code = `import "fmt"`
      const result = parseImports(code, 'go')
      expect(result).toEqual([{ specifier: 'fmt', type: 'import' }])
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
      expect(result).toEqual([
        { specifier: 'fmt', type: 'import' },
        { specifier: 'os', type: 'import' },
        { specifier: 'github.com/user/pkg', type: 'import' },
      ])
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
      expect(result).toEqual([
        { specifier: 'std', type: 'use' },
        { specifier: 'serde', type: 'use' },
        { specifier: 'crate', type: 'use' },
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
      const code = `using MyList = System.Collections.Generic.List;`
      const result = parseImports(code, 'csharp')
      expect(result).toEqual([{ specifier: 'System.Collections.Generic.List', type: 'use' }])
    })
  })

  describe('unsupported language', () => {
    it('returns empty array', () => {
      expect(parseImports('some code', 'text')).toEqual([])
      expect(parseImports('some code', 'html')).toEqual([])
    })
  })
})
