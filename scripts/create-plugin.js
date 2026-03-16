#!/usr/bin/env node

/**
 * Scaffold a new Smoke plugin project.
 *
 * Usage:
 *   node scripts/create-plugin.js <plugin-name>
 *   npm run create-plugin -- <plugin-name>
 *
 * Creates a ready-to-develop plugin project with manifest.json, TypeScript
 * source, type definitions, and dev/build scripts.
 */

const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/

function fatal(message) {
  console.error(`\n  Error: ${message}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function manifestJson(name) {
  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      description: `A Smoke canvas plugin`,
      author: '',
      defaultSize: { width: 400, height: 300 },
      entryPoint: 'index.js',
      permissions: [],
    },
    null,
    2,
  )
}

function packageJson(name) {
  return JSON.stringify(
    {
      name: `smoke-plugin-${name}`,
      version: '0.1.0',
      private: true,
      scripts: {
        build: 'esbuild src/index.tsx --bundle --outfile=index.js --format=iife --target=es2020',
        dev: 'node dev.js',
      },
      devDependencies: {
        esbuild: '^0.24.0',
        typescript: '^5.7.0',
      },
    },
    null,
    2,
  )
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      jsx: 'react-jsx',
      jsxImportSource: './src',
      noEmit: true,
      skipLibCheck: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
    },
    include: ['src'],
  },
  null,
  2,
)

function indexTsx(name) {
  // Capitalise for display: "my-plugin" → "My Plugin"
  const displayName = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return `/**
 * ${displayName} — a Smoke canvas plugin.
 *
 * This file is the plugin entry point. It runs inside a sandboxed iframe
 * with no access to Node.js, Electron, or the host DOM. Communicate with
 * Smoke through the PluginBridgeContext provided on initialisation.
 *
 * Build:  npm run build
 * Dev:    npm run dev   (watch + symlink into ~/.smoke/plugins/)
 */

// The type definitions in smoke-plugin.d.ts describe the bridge API.
// At runtime, window.__smokePlugin is injected by the Smoke host.

window.__smokePlugin.onReady((ctx) => {
  ctx.setTitle('${displayName}')

  document.body.innerHTML = \`
    <div id="root" style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1e1e1e;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      gap: 16px;
    ">
      <h1 style="font-size: 24px; font-weight: 400; color: #61dafb;">
        ${displayName}
      </h1>
      <p style="font-size: 14px; color: #888;">
        Plugin is running! Edit <code>src/index.tsx</code> to get started.
      </p>
      <p id="info" style="font-size: 12px; color: #666;"></p>
    </div>
  \`

  const info = document.getElementById('info')!
  info.textContent = \`Session: \${ctx.sessionId} · v\${ctx.manifest.version}\`
})
`
}

const SMOKE_PLUGIN_DTS = `/**
 * Type definitions for the Smoke plugin bridge API.
 *
 * These types describe the global \`window.__smokePlugin\` object that the
 * Smoke host injects into every plugin iframe. Use them for editor
 * autocompletion and type-checking — they are NOT shipped at runtime.
 */

interface PluginBridgeContext {
  /** The session ID for this plugin instance. */
  sessionId: string
  /** Basic manifest info forwarded into the iframe. */
  manifest: { name: string; version: string; entryPoint: string }

  /** Read-only window dimensions. */
  size: { width: number; height: number }

  /** Update the window title shown in the chrome. */
  setTitle: (title: string) => void

  /** Request a window resize (subject to grid snapping). */
  requestResize: (width: number, height: number) => void

  /** Key-value storage scoped to this plugin (persisted across sessions). */
  storage: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
  }

  /** Send a message to the Smoke host. */
  sendMessage: (type: string, payload: unknown) => void

  /**
   * Register a handler for messages from the host.
   * Returns an unsubscribe function.
   */
  onMessage: (type: string, handler: (payload: unknown) => void) => () => void
}

interface SmokePlugin {
  onReady: (callback: (context: PluginBridgeContext) => void) => void
}

declare global {
  interface Window {
    __smokePlugin: SmokePlugin
  }
}

export {}
`

// Minimal JSX runtime shim so TypeScript resolves jsx-runtime without React.
// esbuild will tree-shake it — plugins use raw DOM, not React.
const JSX_RUNTIME = `export function jsx() { throw new Error('JSX not supported — use DOM APIs') }
export function jsxs() { throw new Error('JSX not supported — use DOM APIs') }
export function Fragment() { throw new Error('JSX not supported — use DOM APIs') }
`

function devScript(name) {
  return `#!/usr/bin/env node

/**
 * Development script for ${name}.
 *
 * 1. Symlinks this plugin directory into ~/.smoke/plugins/ so Smoke can discover it.
 * 2. Runs esbuild in watch mode to rebuild on every source change.
 *
 * Usage: npm run dev
 */

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const pluginName = '${name}'
const pluginsDir = path.join(os.homedir(), '.smoke', 'plugins')
const linkPath = path.join(pluginsDir, pluginName)
const targetPath = process.cwd()

// Ensure ~/.smoke/plugins/ exists
fs.mkdirSync(pluginsDir, { recursive: true })

// Create symlink (idempotent)
try {
  const existing = fs.readlinkSync(linkPath)
  if (existing !== targetPath) {
    fs.unlinkSync(linkPath)
    fs.symlinkSync(targetPath, linkPath)
    console.log(\`Updated symlink: \${linkPath} → \${targetPath}\`)
  } else {
    console.log(\`Symlink already exists: \${linkPath} → \${targetPath}\`)
  }
} catch {
  fs.symlinkSync(targetPath, linkPath)
  console.log(\`Created symlink: \${linkPath} → \${targetPath}\`)
}

// Run esbuild in watch mode
console.log('Watching for changes...\\n')
const child = spawn(
  'npx',
  ['esbuild', 'src/index.tsx', '--bundle', '--outfile=index.js', '--format=iife', '--target=es2020', '--watch'],
  { stdio: 'inherit', shell: true },
)

child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => { child.kill(); process.exit(0) })
process.on('SIGTERM', () => { child.kill(); process.exit(0) })
`
}

const GITIGNORE = `node_modules/
index.js
`

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
  Usage: npm run create-plugin -- <plugin-name>

  Scaffolds a new Smoke plugin project in ./<plugin-name>/

  The plugin name must be lowercase alphanumeric with hyphens (e.g. "docker-dashboard").
`)
  process.exit(0)
}

const name = args[0]

if (!NAME_RE.test(name)) {
  fatal(
    `Invalid plugin name "${name}".\n  Must be 1-64 lowercase alphanumeric characters or hyphens,\n  starting and ending with a letter or digit (e.g. "my-plugin").`,
  )
}

const dir = path.resolve(name)

if (fs.existsSync(dir)) {
  fatal(`Directory "${name}" already exists.`)
}

console.log(`\n  Creating plugin: ${name}\n`)

// Create directory structure
fs.mkdirSync(path.join(dir, 'src', 'jsx-runtime'), { recursive: true })

// Write files
const files = [
  ['manifest.json', manifestJson(name)],
  ['package.json', packageJson(name)],
  ['tsconfig.json', TSCONFIG],
  ['src/index.tsx', indexTsx(name)],
  ['src/smoke-plugin.d.ts', SMOKE_PLUGIN_DTS],
  ['src/jsx-runtime/index.ts', JSX_RUNTIME],
  ['dev.js', devScript(name)],
  ['.gitignore', GITIGNORE],
]

for (const [file, content] of files) {
  const filePath = path.join(dir, file)
  fs.writeFileSync(filePath, content)
  console.log(`  created  ${name}/${file}`)
}

console.log(`
  Done! Next steps:

    cd ${name}
    npm install
    npm run dev       # symlink into ~/.smoke/plugins/ + watch mode
    npm run build     # produce distributable plugin

  Open Smoke and add your plugin from the Create menu.
`)
