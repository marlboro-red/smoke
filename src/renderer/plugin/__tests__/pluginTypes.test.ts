import { describe, it, expect } from 'vitest'
import type {
  PluginManifest,
  PluginPermission,
  PluginConfigField,
  PluginBridgeContext,
  PluginSandboxState,
  PluginError,
} from '../pluginTypes'

/**
 * Manifest validation tests: verify that the renderer-side PluginManifest
 * type enforces the expected shape and that objects conforming to the type
 * behave correctly for downstream consumers.
 */

describe('PluginManifest structure', () => {
  it('a valid manifest has all required fields', () => {
    const manifest: PluginManifest = {
      name: 'docker-dashboard',
      version: '1.2.0',
      description: 'Docker container management',
      author: 'smoke-team',
      defaultSize: { width: 600, height: 400 },
      entryPoint: 'index.js',
      permissions: [],
    }

    expect(manifest.name).toBe('docker-dashboard')
    expect(manifest.version).toBe('1.2.0')
    expect(manifest.description).toBe('Docker container management')
    expect(manifest.author).toBe('smoke-team')
    expect(manifest.defaultSize).toEqual({ width: 600, height: 400 })
    expect(manifest.entryPoint).toBe('index.js')
    expect(manifest.permissions).toEqual([])
  })

  it('manifest supports optional icon field', () => {
    const manifest: PluginManifest = {
      name: 'test',
      version: '1.0.0',
      description: 'test',
      author: 'test',
      defaultSize: { width: 400, height: 300 },
      entryPoint: 'index.js',
      permissions: [],
      icon: 'docker.svg',
    }
    expect(manifest.icon).toBe('docker.svg')
  })

  it('manifest supports optional configSchema', () => {
    const configSchema: Record<string, PluginConfigField> = {
      refreshInterval: {
        type: 'number',
        label: 'Refresh Interval (s)',
        description: 'How often to poll for updates',
        default: 30,
        min: 5,
        max: 300,
      },
      showStopped: {
        type: 'boolean',
        label: 'Show Stopped',
        default: false,
      },
      layout: {
        type: 'select',
        label: 'Layout',
        options: ['grid', 'list', 'compact'],
        default: 'grid',
      },
    }

    const manifest: PluginManifest = {
      name: 'test',
      version: '1.0.0',
      description: 'test',
      author: 'test',
      defaultSize: { width: 400, height: 300 },
      entryPoint: 'index.js',
      permissions: [],
      configSchema,
    }

    expect(manifest.configSchema?.refreshInterval.type).toBe('number')
    expect(manifest.configSchema?.refreshInterval.min).toBe(5)
    expect(manifest.configSchema?.showStopped.default).toBe(false)
    expect(manifest.configSchema?.layout.options).toEqual(['grid', 'list', 'compact'])
  })

  it('manifest permissions are from the allowed set', () => {
    const allPerms: PluginPermission[] = [
      'filesystem.read',
      'filesystem.write',
      'network',
      'pty',
      'clipboard',
      'notifications',
      'shell',
    ]

    const manifest: PluginManifest = {
      name: 'full-perms',
      version: '1.0.0',
      description: 'test',
      author: 'test',
      defaultSize: { width: 400, height: 300 },
      entryPoint: 'index.js',
      permissions: allPerms,
    }

    expect(manifest.permissions).toHaveLength(7)
    expect(manifest.permissions).toContain('filesystem.read')
    expect(manifest.permissions).toContain('network')
    expect(manifest.permissions).toContain('shell')
  })
})

describe('PluginBridgeContext structure', () => {
  it('has all required fields and methods', () => {
    const ctx: PluginBridgeContext = {
      sessionId: 'sess-123',
      manifest: { name: 'test', version: '1.0.0', entryPoint: 'index.js' },
      size: { width: 400, height: 300 },
      setTitle: () => {},
      requestResize: () => {},
      storage: {
        get: async () => undefined,
        set: async () => {},
        delete: async () => {},
      },
      sendMessage: () => {},
      onMessage: () => () => {},
    }

    expect(ctx.sessionId).toBe('sess-123')
    expect(ctx.manifest.name).toBe('test')
    expect(ctx.size).toEqual({ width: 400, height: 300 })
    expect(typeof ctx.setTitle).toBe('function')
    expect(typeof ctx.requestResize).toBe('function')
    expect(typeof ctx.storage.get).toBe('function')
    expect(typeof ctx.storage.set).toBe('function')
    expect(typeof ctx.storage.delete).toBe('function')
    expect(typeof ctx.sendMessage).toBe('function')
    expect(typeof ctx.onMessage).toBe('function')
  })

  it('onMessage returns an unsubscribe function', () => {
    let unsubbed = false
    const ctx: PluginBridgeContext = {
      sessionId: 'sess-123',
      manifest: { name: 'test', version: '1.0.0', entryPoint: 'index.js' },
      size: { width: 400, height: 300 },
      setTitle: () => {},
      requestResize: () => {},
      storage: {
        get: async () => undefined,
        set: async () => {},
        delete: async () => {},
      },
      sendMessage: () => {},
      onMessage: (_type, _handler) => () => {
        unsubbed = true
      },
    }

    const unsub = ctx.onMessage('test', () => {})
    unsub()
    expect(unsubbed).toBe(true)
  })
})

describe('PluginSandboxState', () => {
  it('includes all valid states', () => {
    const states: PluginSandboxState[] = ['loading', 'ready', 'error', 'crashed']
    expect(states).toHaveLength(4)
  })
})

describe('PluginError', () => {
  it('has required message and phase fields', () => {
    const error: PluginError = {
      message: 'Failed to load plugin',
      phase: 'load',
    }
    expect(error.message).toBe('Failed to load plugin')
    expect(error.phase).toBe('load')
    expect(error.stack).toBeUndefined()
  })

  it('supports optional stack field', () => {
    const error: PluginError = {
      message: 'Runtime crash',
      stack: 'Error: Runtime crash\n  at Plugin.render',
      phase: 'runtime',
    }
    expect(error.stack).toContain('Runtime crash')
  })

  it('phase is one of load, render, or runtime', () => {
    const phases: PluginError['phase'][] = ['load', 'render', 'runtime']
    expect(phases).toHaveLength(3)
  })
})

describe('PluginConfigField', () => {
  it('string field has type and label', () => {
    const field: PluginConfigField = {
      type: 'string',
      label: 'API Key',
      description: 'Your API key',
    }
    expect(field.type).toBe('string')
    expect(field.label).toBe('API Key')
  })

  it('number field supports min and max', () => {
    const field: PluginConfigField = {
      type: 'number',
      label: 'Timeout',
      default: 30,
      min: 1,
      max: 120,
    }
    expect(field.min).toBe(1)
    expect(field.max).toBe(120)
  })

  it('select field requires options array', () => {
    const field: PluginConfigField = {
      type: 'select',
      label: 'Mode',
      options: ['auto', 'manual', 'scheduled'],
      default: 'auto',
    }
    expect(field.options).toEqual(['auto', 'manual', 'scheduled'])
  })
})
