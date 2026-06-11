import Store from 'electron-store'

export interface LayoutSession {
  title: string
  cwd: string
  startupCommand?: string
  position: { x: number; y: number }
  size: { width: number; height: number; cols: number; rows: number }
}

export interface Layout {
  name: string
  sessions: LayoutSession[]
  viewport: { panX: number; panY: number; zoom: number }
  gridSize: number
}

export interface SidebarSectionSizes {
  fileTree?: number
  layouts?: number
  bookmarks?: number
  recordings?: number
}

export interface ShortcutBindingPref {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
  /** Control on macOS (mod = Cmd there); ignored elsewhere */
  ctrl?: boolean
}

export interface Preferences {
  defaultShell: string
  autoLaunchClaude: boolean
  claudeCommand: string
  gridSize: number
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number
  sidebarSectionSizes: SidebarSectionSizes
  theme: string
  defaultCwd: string
  terminalOpacity: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  customShortcuts: Record<string, ShortcutBindingPref | null>
  startupCommand: string
  skipAssemblyPreview: boolean
  sidebarCollapsed: boolean
}

export const defaultPreferences: Preferences = {
  defaultShell: '',
  autoLaunchClaude: false,
  claudeCommand: 'claude',
  gridSize: 20,
  sidebarPosition: 'left',
  sidebarWidth: 240,
  sidebarSectionSizes: {},
  theme: 'dark',
  defaultCwd: '',
  terminalOpacity: 1,
  fontFamily: '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  customShortcuts: {},
  startupCommand: '',
  skipAssemblyPreview: false,
  sidebarCollapsed: false,
}

export interface Bookmark {
  name: string
  panX: number
  panY: number
  zoom: number
}

export interface TabInfo {
  id: string
  name: string
}

export interface SmokeConfig {
  defaultLayout: Layout | null
  namedLayouts: Record<string, Layout>
  canvasBookmarks: Record<string, Bookmark>
  preferences: Preferences
  tabs: TabInfo[]
  activeTabId: string
  pluginSettings: Record<string, Record<string, unknown>>
  disabledPlugins: string[]
  recentWorkspaces: string[]
}

const storeOptions = {
  name: 'smoke-config' as const,
  defaults: {
    defaultLayout: null as Layout | null,
    namedLayouts: {} as Record<string, Layout>,
    canvasBookmarks: {} as Record<string, Bookmark>,
    preferences: { ...defaultPreferences },
    tabs: [{ id: 'default', name: 'Canvas 1' }] as TabInfo[],
    activeTabId: 'default',
    pluginSettings: {} as Record<string, Record<string, unknown>>,
    disabledPlugins: [] as string[],
    recentWorkspaces: [] as string[],
  },
  // Allow E2E tests to redirect config to an isolated temp directory
  ...(process.env.SMOKE_E2E_CONFIG_DIR ? { cwd: process.env.SMOKE_E2E_CONFIG_DIR } : {}),
}

let configStore: Store<SmokeConfig>
try {
  configStore = new Store<SmokeConfig>(storeOptions)
} catch {
  // Corrupted config file — delete it and recreate with defaults
  const Store2 = Store
  const fs = require('fs')
  const path = require('path')
  const configDir = storeOptions.cwd || require('electron').app.getPath('userData')
  const configFile = path.join(configDir, 'smoke-config.json')
  try { fs.unlinkSync(configFile) } catch { /* may not exist */ }
  configStore = new Store2<SmokeConfig>(storeOptions)
}

export { configStore }

// ---------------------------------------------------------------------------
// Write-behind persistence
// ---------------------------------------------------------------------------

/**
 * electron-store writes the whole config file to disk SYNCHRONOUSLY on every
 * `set`, blocking the main process (and therefore all IPC, including
 * keystrokes and PTY output) for 5–50ms per call. With layout autosave every
 * 2s plus preference updates, that's a recurring stall.
 *
 * DeferredConfigWriter coalesces mutations in memory and flushes them in one
 * disk write after a short delay. Reads check pending mutations first (and
 * flush on root-key overlap) so callers always see their own writes.
 *
 * Call `flushConfigWrites()` on before-quit so nothing is lost.
 */
const CONFIG_FLUSH_DELAY_MS = 500

class DeferredConfigWriter {
  private pending = new Map<string, unknown>()
  private timer: ReturnType<typeof setTimeout> | null = null

  set(key: string, value: unknown): void {
    this.pending.set(key, value)
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), CONFIG_FLUSH_DELAY_MS)
    }
  }

  /**
   * Read a key, seeing pending writes. Dotted-path writes (e.g.
   * `preferences.theme`) overlap whole-object reads (`preferences`), so any
   * root-segment overlap forces a flush before reading from the store.
   */
  get<T>(key: string, defaultValue: T): T {
    if (this.pending.size > 0) {
      if (this.pending.has(key)) {
        return this.pending.get(key) as T
      }
      const root = key.split('.')[0]
      for (const pendingKey of this.pending.keys()) {
        if (pendingKey.split('.')[0] === root) {
          this.flush()
          break
        }
      }
    }
    return configStore.get(key as never, defaultValue as never) as T
  }

  /** Apply all pending mutations in a single disk write. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.size === 0) return
    const batch = Object.fromEntries(this.pending)
    this.pending.clear()
    // electron-store applies all entries to its in-memory state and writes
    // the file once for the object form.
    configStore.set(batch as never)
  }
}

export const deferredConfig = new DeferredConfigWriter()

export function flushConfigWrites(): void {
  deferredConfig.flush()
}
