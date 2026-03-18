import { ipcMain, type BrowserWindow } from 'electron'
import { configStore } from '../../config/ConfigStore'
import { PluginLoader, type LoadedPlugin } from '../../plugin/PluginLoader'
import { PluginInstaller } from '../../plugin/PluginInstaller'
import { memoizeAsyncWithTTL } from '../../utils/memoizeWithTTL'
import {
  PLUGIN_LIST,
  PLUGIN_GET,
  PLUGIN_RELOAD,
  PLUGIN_CHANGED,
  PLUGIN_INSTALL,
  PLUGIN_UNINSTALL,
  PLUGIN_CONFIG_GET,
  PLUGIN_CONFIG_SET,
  PLUGIN_SET_ENABLED,
  PLUGIN_GET_DISABLED,
  type PluginGetRequest,
  type PluginInfo,
  type PluginListResponse,
  type PluginReloadResponse,
  type PluginInstallRequest,
  type PluginInstallResponse,
  type PluginUninstallRequest,
  type PluginUninstallResponse,
  type PluginConfigGetRequest,
  type PluginConfigSetRequest,
  type PluginSetEnabledRequest,
} from '../channels'

export interface PluginInstances {
  pluginLoader: PluginLoader
  dispose: () => void
}

function toPluginInfo(p: LoadedPlugin): PluginInfo {
  return {
    name: p.manifest.name,
    version: p.manifest.version,
    description: p.manifest.description,
    author: p.manifest.author,
    icon: p.manifest.icon,
    defaultSize: p.manifest.defaultSize,
    entryPointPath: p.entryPointPath,
    permissions: p.manifest.permissions,
    pluginDir: p.pluginDir,
    source: p.source,
    installSource: p.installSource,
    configSchema: p.manifest.configSchema,
  }
}

export async function registerPluginHandlers(
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string,
): Promise<PluginInstances> {
  const pluginLoader = new PluginLoader(launchCwd)
  const initialLoad = await pluginLoader.loadAll()

  // Log plugin load errors as warnings
  for (const err of initialLoad.errors) {
    console.warn(`[plugin] Skipped ${err.pluginDir}: ${err.error}`)
  }
  if (initialLoad.plugins.length > 0) {
    console.log(`[plugin] Loaded ${initialLoad.plugins.length} plugin(s): ${initialLoad.plugins.map((p) => p.manifest.name).join(', ')}`)
  }

  // Dev mode: watch for changes and push updates to renderer
  if (process.env.NODE_ENV !== 'production') {
    pluginLoader.startWatching((result) => {
      for (const err of result.errors) {
        console.warn(`[plugin] Skipped ${err.pluginDir}: ${err.error}`)
      }
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PLUGIN_CHANGED, {
          plugins: result.plugins.map(toPluginInfo),
          errors: result.errors,
        })
      }
    })
  }

  ipcMain.handle(PLUGIN_LIST, (): PluginListResponse => {
    return { plugins: pluginLoader.getPlugins().map(toPluginInfo) }
  })

  ipcMain.handle(PLUGIN_GET, (_event, request: PluginGetRequest): PluginInfo | null => {
    const plugin = pluginLoader.getPlugin(request.name)
    return plugin ? toPluginInfo(plugin) : null
  })

  // Plugin reload: 2s TTL with in-flight dedup to coalesce rapid successive calls
  const pluginReloadCache = memoizeAsyncWithTTL(
    () => pluginLoader.loadAll(),
    { ttlMs: 2_000 }
  )

  ipcMain.handle(PLUGIN_RELOAD, async (): Promise<PluginReloadResponse> => {
    const result = await pluginReloadCache.get()
    return {
      plugins: result.plugins.map(toPluginInfo),
      errors: result.errors,
    }
  })

  // Plugin install/uninstall
  const pluginInstaller = new PluginInstaller()

  ipcMain.handle(
    PLUGIN_INSTALL,
    async (_event, request: PluginInstallRequest): Promise<PluginInstallResponse> => {
      const { source } = request

      // Determine if this is a URL or an npm package name
      let result
      if (source.startsWith('http://') || source.startsWith('https://')) {
        result = await pluginInstaller.installFromUrl(source)
      } else {
        result = await pluginInstaller.installFromNpm(source)
      }

      if (result.success) {
        // Reload plugins so the new one is discovered
        pluginReloadCache.invalidate()
        const loadResult = await pluginReloadCache.get()
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(PLUGIN_CHANGED, {
            plugins: loadResult.plugins.map(toPluginInfo),
            errors: loadResult.errors,
          })
        }
      }

      return result
    }
  )

  ipcMain.handle(
    PLUGIN_UNINSTALL,
    async (_event, request: PluginUninstallRequest): Promise<PluginUninstallResponse> => {
      const result = await pluginInstaller.uninstall(request.name, request.force)

      if (result.success) {
        // Reload plugins so the removed one is dropped
        pluginReloadCache.invalidate()
        const loadResult = await pluginReloadCache.get()
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(PLUGIN_CHANGED, {
            plugins: loadResult.plugins.map(toPluginInfo),
            errors: loadResult.errors,
          })
        }
      }

      return result
    }
  )

  // Plugin config
  ipcMain.handle(PLUGIN_CONFIG_GET, (_event, request: PluginConfigGetRequest): Record<string, unknown> => {
    const allSettings = configStore.get('pluginSettings', {})
    return allSettings[request.pluginName] ?? {}
  })

  ipcMain.handle(PLUGIN_CONFIG_SET, (_event, request: PluginConfigSetRequest): void => {
    const allSettings = configStore.get('pluginSettings', {})
    if (!allSettings[request.pluginName]) {
      allSettings[request.pluginName] = {}
    }
    allSettings[request.pluginName][request.key] = request.value
    configStore.set('pluginSettings', allSettings)
  })

  ipcMain.handle(PLUGIN_SET_ENABLED, (_event, request: PluginSetEnabledRequest): void => {
    const disabled = configStore.get('disabledPlugins', [])
    if (request.enabled) {
      configStore.set('disabledPlugins', disabled.filter((n: string) => n !== request.pluginName))
    } else {
      if (!disabled.includes(request.pluginName)) {
        configStore.set('disabledPlugins', [...disabled, request.pluginName])
      }
    }
  })

  ipcMain.handle(PLUGIN_GET_DISABLED, (): string[] => {
    return configStore.get('disabledPlugins', [])
  })

  return {
    pluginLoader,
    dispose(): void {
      pluginLoader.stopWatching()
      ipcMain.removeHandler(PLUGIN_LIST)
      ipcMain.removeHandler(PLUGIN_GET)
      ipcMain.removeHandler(PLUGIN_RELOAD)
      ipcMain.removeHandler(PLUGIN_INSTALL)
      ipcMain.removeHandler(PLUGIN_UNINSTALL)
      ipcMain.removeHandler(PLUGIN_CONFIG_GET)
      ipcMain.removeHandler(PLUGIN_CONFIG_SET)
      ipcMain.removeHandler(PLUGIN_SET_ENABLED)
      ipcMain.removeHandler(PLUGIN_GET_DISABLED)
    },
  }
}
