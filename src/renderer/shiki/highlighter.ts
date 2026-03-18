import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

type LangImporter = () => Promise<{ default: unknown }>
type ThemeImporter = () => Promise<{ default: unknown }>

const langImportMap: Record<string, LangImporter> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  svelte: () => import('shiki/langs/svelte.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  zig: () => import('shiki/langs/zig.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
}

const themeImportMap: Record<string, ThemeImporter> = {
  'github-dark': () => import('shiki/themes/github-dark.mjs'),
  'github-light': () => import('shiki/themes/github-light.mjs'),
  'catppuccin-mocha': () => import('shiki/themes/catppuccin-mocha.mjs'),
  'dracula': () => import('shiki/themes/dracula.mjs'),
  'nord': () => import('shiki/themes/nord.mjs'),
  'solarized-dark': () => import('shiki/themes/solarized-dark.mjs'),
}

let highlighterPromise: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()
const loadedThemes = new Set<string>()

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

async function ensureLanguage(highlighter: HighlighterCore, lang: string): Promise<boolean> {
  if (lang === 'text') return true
  if (loadedLangs.has(lang)) return true
  const importer = langImportMap[lang]
  if (!importer) return false
  const mod = await importer()
  await highlighter.loadLanguage(mod.default as never)
  loadedLangs.add(lang)
  return true
}

async function ensureTheme(highlighter: HighlighterCore, theme: string): Promise<void> {
  if (loadedThemes.has(theme)) return
  const importer = themeImportMap[theme]
  if (!importer) return
  const mod = await importer()
  await highlighter.loadTheme(mod.default as never)
  loadedThemes.add(theme)
}

/**
 * Lazy-loading replacement for shiki's codeToHtml.
 * Only loads the requested language grammar and theme on first use.
 */
export async function codeToHtml(
  code: string,
  options: { lang: string; theme: string }
): Promise<string> {
  const highlighter = await getHighlighter()
  await ensureTheme(highlighter, options.theme)
  const langLoaded = await ensureLanguage(highlighter, options.lang)
  return highlighter.codeToHtml(code, {
    lang: langLoaded ? options.lang : 'text',
    theme: options.theme,
  })
}
