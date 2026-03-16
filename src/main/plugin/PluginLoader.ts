import { readdir, readFile, access, stat } from 'fs/promises'
import { watch, type FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  validateManifest,
  type PluginManifest,
} from './pluginManifest'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadedPlugin {
  manifest: PluginManifest
  /** Absolute path to the plugin directory. */
  pluginDir: string
  /** Resolved absolute path to the entry point file. */
  entryPointPath: string
  /** Where the plugin was discovered. */
  source: 'global' | 'project'
}

export interface PluginLoadError {
  pluginDir: string
  error: string
}

export interface PluginLoadResult {
  plugins: LoadedPlugin[]
  errors: PluginLoadError[]
}

// ---------------------------------------------------------------------------
// PluginLoader
// ---------------------------------------------------------------------------

export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private watchers: FSWatcher[] = []
  private globalDir: string
  private projectDir: string | null

  constructor(projectRoot?: string) {
    this.globalDir = join(homedir(), '.smoke', 'plugins')
    this.projectDir = projectRoot
      ? join(projectRoot, '.smoke', 'plugins')
      : null
  }

  /** Scan both plugin directories and load all valid plugins. */
  async loadAll(): Promise<PluginLoadResult> {
    this.plugins.clear()

    const allPlugins: LoadedPlugin[] = []
    const allErrors: PluginLoadError[] = []

    // Scan global first, then project-local (project-local wins on name collision)
    const globalResult = await this.scanDirectory(this.globalDir, 'global')
    allPlugins.push(...globalResult.plugins)
    allErrors.push(...globalResult.errors)

    if (this.projectDir) {
      const projectResult = await this.scanDirectory(this.projectDir, 'project')
      allPlugins.push(...projectResult.plugins)
      allErrors.push(...projectResult.errors)
    }

    // Register — project-local overrides global on name collision
    for (const plugin of allPlugins) {
      const existing = this.plugins.get(plugin.manifest.name)
      if (existing && existing.source === 'global' && plugin.source === 'project') {
        // Project-local wins
        this.plugins.set(plugin.manifest.name, plugin)
      } else if (!existing) {
        this.plugins.set(plugin.manifest.name, plugin)
      }
      // If same source with duplicate name, first-found wins (skip later ones)
    }

    return {
      plugins: this.getPlugins(),
      errors: allErrors,
    }
  }

  /** Scan a single directory for plugin subdirectories. */
  async scanDirectory(
    dir: string,
    source: 'global' | 'project'
  ): Promise<PluginLoadResult> {
    const plugins: LoadedPlugin[] = []
    const errors: PluginLoadError[] = []

    if (!(await directoryExists(dir))) {
      return { plugins, errors }
    }

    let entries: string[]
    try {
      const dirEntries = await readdir(dir, { withFileTypes: true })
      entries = dirEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      return { plugins, errors }
    }

    for (const name of entries) {
      const pluginDir = join(dir, name)
      const result = await this.loadPlugin(pluginDir, source)
      if (result.plugin) {
        plugins.push(result.plugin)
      }
      if (result.error) {
        errors.push(result.error)
      }
    }

    return { plugins, errors }
  }

  /** Attempt to load a single plugin from a directory. */
  private async loadPlugin(
    pluginDir: string,
    source: 'global' | 'project'
  ): Promise<{ plugin?: LoadedPlugin; error?: PluginLoadError }> {
    const manifestPath = join(pluginDir, 'manifest.json')

    // Check manifest exists
    if (!(await fileExists(manifestPath))) {
      return {
        error: {
          pluginDir,
          error: 'No manifest.json found',
        },
      }
    }

    // Read and parse manifest
    let raw: unknown
    try {
      const content = await readFile(manifestPath, 'utf-8')
      raw = JSON.parse(content)
    } catch (err) {
      return {
        error: {
          pluginDir,
          error: `Failed to read/parse manifest.json: ${err instanceof Error ? err.message : String(err)}`,
        },
      }
    }

    // Validate manifest
    const validation = validateManifest(raw)
    if (!validation.valid || !validation.manifest) {
      const messages = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
      return {
        error: {
          pluginDir,
          error: `Invalid manifest: ${messages}`,
        },
      }
    }

    const manifest = validation.manifest

    // Resolve and verify entry point exists
    const entryPointPath = join(pluginDir, manifest.entryPoint)
    if (!(await fileExists(entryPointPath))) {
      return {
        error: {
          pluginDir,
          error: `Entry point not found: ${manifest.entryPoint}`,
        },
      }
    }

    return {
      plugin: {
        manifest,
        pluginDir,
        entryPointPath,
        source,
      },
    }
  }

  /** Get all currently loaded plugins. */
  getPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()]
  }

  /** Get a single plugin by name. */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name)
  }

  /**
   * Start watching plugin directories for changes (dev mode).
   * Calls `onChange` with the updated plugin list whenever a change is detected.
   */
  startWatching(onChange: (result: PluginLoadResult) => void): void {
    this.stopWatching()

    const dirs = [this.globalDir]
    if (this.projectDir) {
      dirs.push(this.projectDir)
    }

    // Debounce reloads — file watchers fire multiple events for a single save
    let reloadTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = (): void => {
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(async () => {
        const result = await this.loadAll()
        onChange(result)
      }, 300)
    }

    for (const dir of dirs) {
      try {
        const watcher = watch(dir, { recursive: true }, () => {
          scheduleReload()
        })
        this.watchers.push(watcher)
      } catch {
        // Directory may not exist yet — that's fine
      }
    }
  }

  /** Stop all file watchers. */
  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close()
    }
    this.watchers = []
  }

  /** Clean up all state and watchers. */
  dispose(): void {
    this.stopWatching()
    this.plugins.clear()
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function directoryExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
