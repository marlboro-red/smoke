/**
 * PluginPermissionManager — tracks registered plugins and enforces
 * per-plugin permission checks for IPC calls.
 *
 * Plugins declare permissions in their manifest using dotted names
 * (e.g. "filesystem.read"). The PluginContext API uses colon-delimited
 * names (e.g. "fs:read"). This manager handles the mapping and lookup.
 */

import type { PluginPermission as ManifestPermission } from './pluginManifest'

/** Permission names as used by PluginContext (renderer-facing). */
export type ContextPermission =
  | 'fs:read'
  | 'fs:write'
  | 'shell:execute'
  | 'terminal:spawn'
  | 'canvas:modify'
  | 'network:fetch'

/**
 * Maps manifest permission names → PluginContext permission names.
 * A single manifest permission may grant multiple context permissions.
 */
const MANIFEST_TO_CONTEXT: Record<ManifestPermission, ContextPermission[]> = {
  'filesystem.read': ['fs:read'],
  'filesystem.write': ['fs:write'],
  'shell': ['shell:execute'],
  'pty': ['terminal:spawn'],
  'network': ['network:fetch'],
  'clipboard': [],
  'notifications': [],
}

interface RegisteredPlugin {
  pluginId: string
  /** Resolved sandbox root directory (absolute path). */
  sandboxRoot: string
  /** Set of context-level permissions granted by the manifest. */
  grantedPermissions: Set<ContextPermission>
  /** Runtime-granted permissions (via requestPermission). */
  runtimePermissions: Set<ContextPermission>
}

export class PluginPermissionManager {
  private plugins = new Map<string, RegisteredPlugin>()

  /**
   * Register a plugin with its manifest permissions and sandbox root.
   * Call this when a plugin is loaded.
   */
  register(
    pluginId: string,
    manifestPermissions: ManifestPermission[],
    sandboxRoot: string
  ): void {
    const granted = new Set<ContextPermission>()
    for (const mp of manifestPermissions) {
      const contextPerms = MANIFEST_TO_CONTEXT[mp]
      if (contextPerms) {
        for (const cp of contextPerms) {
          granted.add(cp)
        }
      }
    }

    this.plugins.set(pluginId, {
      pluginId,
      sandboxRoot,
      grantedPermissions: granted,
      runtimePermissions: new Set(),
    })
  }

  /** Unregister a plugin (e.g. when unloaded). */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  /** Check whether a plugin has a given permission (manifest or runtime). */
  hasPermission(pluginId: string, permission: ContextPermission): boolean {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return false
    return (
      plugin.grantedPermissions.has(permission) ||
      plugin.runtimePermissions.has(permission)
    )
  }

  /**
   * Grant a runtime permission to a plugin.
   * Returns true if the permission was newly granted, false if already held.
   */
  grantRuntimePermission(pluginId: string, permission: ContextPermission): boolean {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return false
    if (plugin.grantedPermissions.has(permission) || plugin.runtimePermissions.has(permission)) {
      return false
    }
    plugin.runtimePermissions.add(permission)
    return true
  }

  /** Get the sandbox root for a registered plugin. */
  getSandboxRoot(pluginId: string): string | undefined {
    return this.plugins.get(pluginId)?.sandboxRoot
  }

  /** Check if a plugin is registered. */
  isRegistered(pluginId: string): boolean {
    return this.plugins.has(pluginId)
  }

  /** Get all registered plugin IDs. */
  getRegisteredPlugins(): string[] {
    return [...this.plugins.keys()]
  }
}
