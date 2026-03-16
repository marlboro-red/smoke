import type { ComponentType } from 'react'
import type { PluginSession } from '../stores/sessionStore'

export interface PluginWindowProps {
  session: PluginSession
  zoom: () => number
  gridSize: number
}

export interface PluginThumbnailProps {
  session: PluginSession
}

export interface PluginElementRegistration {
  /** Namespaced type like 'plugin:my-db-browser' */
  type: `plugin:${string}`
  /** Human-readable display name */
  displayName: string
  /** Window component rendered at normal zoom */
  WindowComponent: ComponentType<PluginWindowProps>
  /** Thumbnail component rendered at low zoom (<0.4) */
  ThumbnailComponent: ComponentType<PluginThumbnailProps>
  /** Default size for new instances */
  defaultSize: { width: number; height: number }
  /** Short label for status bar display (e.g. 'db', 'docker') */
  statusLabel?: string
  /** Icon character for search modal */
  searchIcon?: string
  /** Serialize plugin-specific data for layout persistence */
  serializeData?: (session: PluginSession) => Record<string, unknown>
  /** Deserialize saved data when restoring a layout */
  deserializeData?: (saved: Record<string, unknown>) => Record<string, unknown>
}

const registry = new Map<string, PluginElementRegistration>()

const listeners = new Set<() => void>()

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function registerPluginElementType(registration: PluginElementRegistration): () => void {
  if (!registration.type.startsWith('plugin:')) {
    throw new Error(`Plugin element type must use 'plugin:' prefix, got '${registration.type}'`)
  }
  if (registry.has(registration.type)) {
    throw new Error(`Plugin element type '${registration.type}' is already registered`)
  }
  registry.set(registration.type, registration)
  notifyListeners()

  // Return unregister function
  return () => {
    registry.delete(registration.type)
    notifyListeners()
  }
}

export function getPluginElementRegistration(type: string): PluginElementRegistration | undefined {
  return registry.get(type)
}

export function isPluginElementType(type: string): type is `plugin:${string}` {
  return type.startsWith('plugin:')
}

export function getAllPluginElementTypes(): PluginElementRegistration[] {
  return Array.from(registry.values())
}

export function subscribeToPluginRegistry(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
