import { describe, it, expect, beforeEach } from 'vitest'
import { PluginPermissionManager } from '../PluginPermissionManager'

describe('PluginPermissionManager', () => {
  let manager: PluginPermissionManager

  beforeEach(() => {
    manager = new PluginPermissionManager()
  })

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  it('registers a plugin with manifest permissions', () => {
    manager.register('my-plugin', ['filesystem.read', 'shell'], '/sandbox/my-plugin')
    expect(manager.isRegistered('my-plugin')).toBe(true)
  })

  it('unregisters a plugin', () => {
    manager.register('my-plugin', ['filesystem.read'], '/sandbox/my-plugin')
    manager.unregister('my-plugin')
    expect(manager.isRegistered('my-plugin')).toBe(false)
  })

  it('returns registered plugin IDs', () => {
    manager.register('plugin-a', [], '/sandbox/a')
    manager.register('plugin-b', ['network'], '/sandbox/b')
    expect(manager.getRegisteredPlugins()).toEqual(['plugin-a', 'plugin-b'])
  })

  // -----------------------------------------------------------------------
  // Permission mapping
  // -----------------------------------------------------------------------

  it('maps filesystem.read → fs:read', () => {
    manager.register('p', ['filesystem.read'], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(true)
    expect(manager.hasPermission('p', 'fs:write')).toBe(false)
  })

  it('maps filesystem.write → fs:write', () => {
    manager.register('p', ['filesystem.write'], '/s')
    expect(manager.hasPermission('p', 'fs:write')).toBe(true)
    expect(manager.hasPermission('p', 'fs:read')).toBe(false)
  })

  it('maps shell → shell:execute', () => {
    manager.register('p', ['shell'], '/s')
    expect(manager.hasPermission('p', 'shell:execute')).toBe(true)
  })

  it('maps pty → terminal:spawn', () => {
    manager.register('p', ['pty'], '/s')
    expect(manager.hasPermission('p', 'terminal:spawn')).toBe(true)
  })

  it('maps network → network:fetch', () => {
    manager.register('p', ['network'], '/s')
    expect(manager.hasPermission('p', 'network:fetch')).toBe(true)
  })

  it('maps clipboard/notifications to no context permissions', () => {
    manager.register('p', ['clipboard', 'notifications'], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(false)
    expect(manager.hasPermission('p', 'fs:write')).toBe(false)
    expect(manager.hasPermission('p', 'shell:execute')).toBe(false)
    expect(manager.hasPermission('p', 'terminal:spawn')).toBe(false)
    expect(manager.hasPermission('p', 'network:fetch')).toBe(false)
    expect(manager.hasPermission('p', 'canvas:modify')).toBe(false)
  })

  it('supports multiple manifest permissions', () => {
    manager.register('p', ['filesystem.read', 'filesystem.write', 'shell', 'pty', 'network'], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(true)
    expect(manager.hasPermission('p', 'fs:write')).toBe(true)
    expect(manager.hasPermission('p', 'shell:execute')).toBe(true)
    expect(manager.hasPermission('p', 'terminal:spawn')).toBe(true)
    expect(manager.hasPermission('p', 'network:fetch')).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Unregistered plugin
  // -----------------------------------------------------------------------

  it('returns false for permissions of unregistered plugin', () => {
    expect(manager.hasPermission('unknown', 'fs:read')).toBe(false)
  })

  it('returns undefined sandbox root for unregistered plugin', () => {
    expect(manager.getSandboxRoot('unknown')).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Sandbox root
  // -----------------------------------------------------------------------

  it('returns the sandbox root for a registered plugin', () => {
    manager.register('p', [], '/home/user/.smoke/plugins/p')
    expect(manager.getSandboxRoot('p')).toBe('/home/user/.smoke/plugins/p')
  })

  // -----------------------------------------------------------------------
  // Runtime permissions
  // -----------------------------------------------------------------------

  it('grants a runtime permission', () => {
    manager.register('p', [], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(false)

    const result = manager.grantRuntimePermission('p', 'fs:read')
    expect(result).toBe(true)
    expect(manager.hasPermission('p', 'fs:read')).toBe(true)
  })

  it('returns false when granting already-held manifest permission', () => {
    manager.register('p', ['filesystem.read'], '/s')
    const result = manager.grantRuntimePermission('p', 'fs:read')
    expect(result).toBe(false)
  })

  it('returns false when granting already-held runtime permission', () => {
    manager.register('p', [], '/s')
    manager.grantRuntimePermission('p', 'fs:read')
    const result = manager.grantRuntimePermission('p', 'fs:read')
    expect(result).toBe(false)
  })

  it('returns false when granting to unregistered plugin', () => {
    const result = manager.grantRuntimePermission('unknown', 'fs:read')
    expect(result).toBe(false)
  })

  it('clears runtime permissions on unregister', () => {
    manager.register('p', [], '/s')
    manager.grantRuntimePermission('p', 'fs:read')
    expect(manager.hasPermission('p', 'fs:read')).toBe(true)

    manager.unregister('p')
    expect(manager.hasPermission('p', 'fs:read')).toBe(false)
  })

  // -----------------------------------------------------------------------
  // Re-registration
  // -----------------------------------------------------------------------

  it('replaces permissions on re-register', () => {
    manager.register('p', ['filesystem.read'], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(true)

    manager.register('p', ['shell'], '/s')
    expect(manager.hasPermission('p', 'fs:read')).toBe(false)
    expect(manager.hasPermission('p', 'shell:execute')).toBe(true)
  })
})
