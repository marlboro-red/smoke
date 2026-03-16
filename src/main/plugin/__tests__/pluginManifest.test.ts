import { describe, it, expect } from 'vitest'
import { validateManifest, PluginManifest } from '../pluginManifest'

/** A valid manifest to use as a base — tests override individual fields. */
function validManifest(): Record<string, unknown> {
  return {
    name: 'docker-dashboard',
    version: '1.0.0',
    description: 'Monitor Docker containers on your canvas',
    author: 'Jane Smith <jane@example.com>',
    icon: 'icon.png',
    defaultSize: { width: 400, height: 300 },
    entryPoint: 'src/index.tsx',
    permissions: ['network', 'shell'],
    configSchema: {
      refreshInterval: {
        type: 'number',
        label: 'Refresh interval (s)',
        description: 'How often to poll Docker',
        default: 5,
        min: 1,
        max: 60,
      },
      theme: {
        type: 'select',
        label: 'Theme',
        options: ['light', 'dark'],
        default: 'dark',
      },
    },
  }
}

describe('validateManifest', () => {
  // -----------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------
  it('accepts a fully valid manifest', () => {
    const result = validateManifest(validManifest())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.manifest).toBeDefined()
    expect(result.manifest!.name).toBe('docker-dashboard')
    expect(result.manifest!.permissions).toEqual(['network', 'shell'])
  })

  it('accepts a minimal manifest without optional fields', () => {
    const minimal = {
      name: 'my-plugin',
      version: '0.1.0',
      description: 'A simple plugin',
      author: 'Dev',
      defaultSize: { width: 200, height: 100 },
      entryPoint: 'index.js',
      permissions: [],
    }
    const result = validateManifest(minimal)
    expect(result.valid).toBe(true)
    expect(result.manifest!.icon).toBeUndefined()
    expect(result.manifest!.configSchema).toBeUndefined()
  })

  // -----------------------------------------------------------
  // Root-level shape
  // -----------------------------------------------------------
  it('rejects null', () => {
    const result = validateManifest(null)
    expect(result.valid).toBe(false)
    expect(result.errors[0].field).toBe('(root)')
  })

  it('rejects an array', () => {
    const result = validateManifest([])
    expect(result.valid).toBe(false)
  })

  it('rejects a non-object primitive', () => {
    const result = validateManifest('not an object')
    expect(result.valid).toBe(false)
  })

  // -----------------------------------------------------------
  // name
  // -----------------------------------------------------------
  it('rejects missing name', () => {
    const m = validManifest()
    delete m.name
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'name')).toBe(true)
  })

  it('rejects name with uppercase', () => {
    const m = validManifest()
    m.name = 'My-Plugin'
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'name')).toBe(true)
  })

  it('rejects name starting with hyphen', () => {
    const m = validManifest()
    m.name = '-bad-name'
    expect(validateManifest(m).valid).toBe(false)
  })

  it('accepts single-char name', () => {
    const m = validManifest()
    m.name = 'x'
    expect(validateManifest(m).valid).toBe(true)
  })

  // -----------------------------------------------------------
  // version
  // -----------------------------------------------------------
  it('rejects invalid semver', () => {
    const m = validManifest()
    m.version = '1.0'
    expect(validateManifest(m).valid).toBe(false)
  })

  it('accepts semver with pre-release', () => {
    const m = validManifest()
    m.version = '1.0.0-beta.1'
    expect(validateManifest(m).valid).toBe(true)
  })

  // -----------------------------------------------------------
  // description / author
  // -----------------------------------------------------------
  it('rejects empty description', () => {
    const m = validManifest()
    m.description = ''
    expect(validateManifest(m).valid).toBe(false)
  })

  it('rejects missing author', () => {
    const m = validManifest()
    delete m.author
    expect(validateManifest(m).valid).toBe(false)
  })

  // -----------------------------------------------------------
  // icon (optional)
  // -----------------------------------------------------------
  it('rejects icon with wrong extension', () => {
    const m = validManifest()
    m.icon = 'icon.jpg'
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'icon')).toBe(true)
  })

  it('rejects absolute icon path', () => {
    const m = validManifest()
    m.icon = '/usr/share/icon.png'
    expect(validateManifest(m).valid).toBe(false)
  })

  it('rejects icon path escaping directory', () => {
    const m = validManifest()
    m.icon = '../icon.png'
    expect(validateManifest(m).valid).toBe(false)
  })

  it('accepts .svg icon', () => {
    const m = validManifest()
    m.icon = 'assets/icon.svg'
    expect(validateManifest(m).valid).toBe(true)
  })

  // -----------------------------------------------------------
  // defaultSize
  // -----------------------------------------------------------
  it('rejects missing defaultSize', () => {
    const m = validManifest()
    delete m.defaultSize
    expect(validateManifest(m).valid).toBe(false)
  })

  it('rejects zero width', () => {
    const m = validManifest()
    m.defaultSize = { width: 0, height: 100 }
    expect(validateManifest(m).valid).toBe(false)
  })

  it('rejects negative height', () => {
    const m = validManifest()
    m.defaultSize = { width: 100, height: -5 }
    expect(validateManifest(m).valid).toBe(false)
  })

  // -----------------------------------------------------------
  // entryPoint
  // -----------------------------------------------------------
  it('rejects wrong entry extension', () => {
    const m = validManifest()
    m.entryPoint = 'index.py'
    expect(validateManifest(m).valid).toBe(false)
  })

  it('rejects absolute entry path', () => {
    const m = validManifest()
    m.entryPoint = '/app/index.tsx'
    expect(validateManifest(m).valid).toBe(false)
  })

  it('accepts .jsx entry', () => {
    const m = validManifest()
    m.entryPoint = 'src/main.jsx'
    expect(validateManifest(m).valid).toBe(true)
  })

  // -----------------------------------------------------------
  // permissions
  // -----------------------------------------------------------
  it('rejects unknown permission', () => {
    const m = validManifest()
    m.permissions = ['network', 'bitcoin-mining']
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'permissions[1]')).toBe(true)
  })

  it('rejects duplicate permissions', () => {
    const m = validManifest()
    m.permissions = ['network', 'network']
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true)
  })

  it('accepts all valid permissions', () => {
    const m = validManifest()
    m.permissions = [
      'filesystem.read',
      'filesystem.write',
      'network',
      'pty',
      'clipboard',
      'notifications',
      'shell',
    ]
    expect(validateManifest(m).valid).toBe(true)
  })

  it('rejects non-array permissions', () => {
    const m = validManifest()
    m.permissions = 'network'
    expect(validateManifest(m).valid).toBe(false)
  })

  // -----------------------------------------------------------
  // configSchema
  // -----------------------------------------------------------
  it('rejects config field missing label', () => {
    const m = validManifest()
    m.configSchema = {
      foo: { type: 'string' },
    }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'configSchema.foo.label')).toBe(true)
  })

  it('rejects config field with invalid type', () => {
    const m = validManifest()
    m.configSchema = {
      foo: { type: 'date', label: 'A date' },
    }
    expect(validateManifest(m).valid).toBe(false)
  })

  it('rejects select without options', () => {
    const m = validManifest()
    m.configSchema = {
      mode: { type: 'select', label: 'Mode' },
    }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'configSchema.mode.options')).toBe(true)
  })

  it('rejects default value type mismatch', () => {
    const m = validManifest()
    m.configSchema = {
      count: { type: 'number', label: 'Count', default: 'five' },
    }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'configSchema.count.default')).toBe(true)
  })

  it('rejects min/max on non-number field', () => {
    const m = validManifest()
    m.configSchema = {
      name: { type: 'string', label: 'Name', min: 0 },
    }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'configSchema.name.min')).toBe(true)
  })

  it('rejects min > max', () => {
    const m = validManifest()
    m.configSchema = {
      count: { type: 'number', label: 'Count', min: 10, max: 5 },
    }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('min must be'))).toBe(true)
  })

  it('rejects configSchema that is an array', () => {
    const m = validManifest()
    m.configSchema = [] as unknown
    expect(validateManifest(m).valid).toBe(false)
  })

  it('accepts boolean config field', () => {
    const m = validManifest()
    m.configSchema = {
      verbose: { type: 'boolean', label: 'Verbose logging', default: false },
    }
    expect(validateManifest(m).valid).toBe(true)
  })

  // -----------------------------------------------------------
  // Multiple errors
  // -----------------------------------------------------------
  it('reports all errors at once', () => {
    const result = validateManifest({
      name: 'INVALID!',
      version: 'nope',
      // missing description, author, defaultSize, entryPoint, permissions
    })
    expect(result.valid).toBe(false)
    // Should catch at least: name format, version format, description, author,
    // defaultSize, entryPoint, permissions
    expect(result.errors.length).toBeGreaterThanOrEqual(7)
  })
})
