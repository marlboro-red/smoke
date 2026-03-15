import type { Extension } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { rust } from '@codemirror/lang-rust'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { go } from '@codemirror/lang-go'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import { sql } from '@codemirror/lang-sql'
import { php } from '@codemirror/lang-php'
import { csharp } from '@replit/codemirror-lang-csharp'

/**
 * Map Shiki language identifiers to CodeMirror language extensions.
 * Returns an empty array for unsupported languages (plain text editing).
 */
export function getLanguageExtension(language: string): Extension[] {
  switch (language) {
    case 'typescript':
      return [javascript({ typescript: true })]
    case 'tsx':
      return [javascript({ typescript: true, jsx: true })]
    case 'javascript':
      return [javascript()]
    case 'jsx':
      return [javascript({ jsx: true })]
    case 'python':
      return [python()]
    case 'html':
      return [html()]
    case 'css':
      return [css()]
    case 'json':
      return [json()]
    case 'markdown':
      return [markdown()]
    case 'rust':
      return [rust()]
    case 'c':
    case 'cpp':
      return [cpp()]
    case 'java':
      return [java()]
    case 'go':
      return [go()]
    case 'yaml':
      return [yaml()]
    case 'xml':
      return [xml()]
    case 'sql':
      return [sql()]
    case 'php':
      return [php()]
    case 'csharp':
      return [csharp()]
    default:
      return []
  }
}
