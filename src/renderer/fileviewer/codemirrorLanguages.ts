import type { Extension } from '@codemirror/state'

type LangLoader = () => Promise<Extension[]>

const langLoaders: Record<string, LangLoader> = {
  typescript: () =>
    import('@codemirror/lang-javascript').then((m) => [m.javascript({ typescript: true })]),
  tsx: () =>
    import('@codemirror/lang-javascript').then((m) => [m.javascript({ typescript: true, jsx: true })]),
  javascript: () =>
    import('@codemirror/lang-javascript').then((m) => [m.javascript()]),
  jsx: () =>
    import('@codemirror/lang-javascript').then((m) => [m.javascript({ jsx: true })]),
  python: () =>
    import('@codemirror/lang-python').then((m) => [m.python()]),
  html: () =>
    import('@codemirror/lang-html').then((m) => [m.html()]),
  css: () =>
    import('@codemirror/lang-css').then((m) => [m.css()]),
  json: () =>
    import('@codemirror/lang-json').then((m) => [m.json()]),
  markdown: () =>
    import('@codemirror/lang-markdown').then((m) => [m.markdown()]),
  rust: () =>
    import('@codemirror/lang-rust').then((m) => [m.rust()]),
  c: () =>
    import('@codemirror/lang-cpp').then((m) => [m.cpp()]),
  cpp: () =>
    import('@codemirror/lang-cpp').then((m) => [m.cpp()]),
  java: () =>
    import('@codemirror/lang-java').then((m) => [m.java()]),
  go: () =>
    import('@codemirror/lang-go').then((m) => [m.go()]),
  yaml: () =>
    import('@codemirror/lang-yaml').then((m) => [m.yaml()]),
  xml: () =>
    import('@codemirror/lang-xml').then((m) => [m.xml()]),
  sql: () =>
    import('@codemirror/lang-sql').then((m) => [m.sql()]),
  php: () =>
    import('@codemirror/lang-php').then((m) => [m.php()]),
  csharp: () =>
    import('@replit/codemirror-lang-csharp').then((m) => [m.csharp()]),
}

/**
 * Lazily load a CodeMirror language extension.
 * Returns an empty array for unsupported languages (plain text editing).
 */
export async function getLanguageExtension(language: string): Promise<Extension[]> {
  const loader = langLoaders[language]
  if (!loader) return []
  return loader()
}
