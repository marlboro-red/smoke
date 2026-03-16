import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerPluginElementType,
  getPluginElementRegistration,
  isPluginElementType,
  getAllPluginElementTypes,
  subscribeToPluginRegistry,
} from '../pluginElementRegistry'
import type { PluginElementRegistration } from '../pluginElementRegistry'

// ─── Helpers ──────────────────────────────────────────────────────

function makeRegistration(
  name: string,
  overrides?: Partial<PluginElementRegistration>
): PluginElementRegistration {
  return {
    type: `plugin:${name}` as `plugin:${string}`,
    displayName: name,
    WindowComponent: () => null as any,
    ThumbnailComponent: () => null as any,
    defaultSize: { width: 400, height: 300 },
    ...overrides,
  }
}

// Since the registry is a module-level singleton, we need to track
// unregister functions and clean up between tests
let cleanupFns: (() => void)[]

beforeEach(() => {
  cleanupFns = []
})

import { afterEach } from 'vitest'
afterEach(() => {
  for (const fn of cleanupFns) fn()
})

// ─── registerPluginElementType ────────────────────────────────────

describe('registerPluginElementType', () => {
  it('registers a plugin element and returns an unregister function', () => {
    const reg = makeRegistration('test-a')
    const unregister = registerPluginElementType(reg)
    cleanupFns.push(unregister)

    expect(getPluginElementRegistration('plugin:test-a')).toBe(reg)
  })

  it('throws if type does not start with plugin: prefix', () => {
    const reg = makeRegistration('bad')
    ;(reg as any).type = 'bad-type'
    expect(() => registerPluginElementType(reg)).toThrow("must use 'plugin:' prefix")
  })

  it('throws if type is already registered', () => {
    const reg = makeRegistration('dup')
    const unsub = registerPluginElementType(reg)
    cleanupFns.push(unsub)

    expect(() => registerPluginElementType(makeRegistration('dup'))).toThrow('already registered')
  })

  it('unregister function removes the registration', () => {
    const reg = makeRegistration('removable')
    const unregister = registerPluginElementType(reg)

    unregister()

    expect(getPluginElementRegistration('plugin:removable')).toBeUndefined()
  })
})

// ─── getPluginElementRegistration ─────────────────────────────────

describe('getPluginElementRegistration', () => {
  it('returns undefined for unregistered types', () => {
    expect(getPluginElementRegistration('plugin:nonexistent')).toBeUndefined()
  })

  it('returns the exact registration object', () => {
    const reg = makeRegistration('exact')
    const unsub = registerPluginElementType(reg)
    cleanupFns.push(unsub)

    const result = getPluginElementRegistration('plugin:exact')
    expect(result).toBe(reg)
    expect(result?.displayName).toBe('exact')
    expect(result?.defaultSize).toEqual({ width: 400, height: 300 })
  })
})

// ─── isPluginElementType ──────────────────────────────────────────

describe('isPluginElementType', () => {
  it('returns true for plugin: prefixed strings', () => {
    expect(isPluginElementType('plugin:my-widget')).toBe(true)
    expect(isPluginElementType('plugin:x')).toBe(true)
  })

  it('returns false for non-plugin types', () => {
    expect(isPluginElementType('terminal')).toBe(false)
    expect(isPluginElementType('file')).toBe(false)
    expect(isPluginElementType('pluginx:bad')).toBe(false)
    expect(isPluginElementType('')).toBe(false)
  })
})

// ─── getAllPluginElementTypes ──────────────────────────────────────

describe('getAllPluginElementTypes', () => {
  it('returns all registered plugin types', () => {
    const regA = makeRegistration('all-a')
    const regB = makeRegistration('all-b')
    const unsubA = registerPluginElementType(regA)
    const unsubB = registerPluginElementType(regB)
    cleanupFns.push(unsubA, unsubB)

    const all = getAllPluginElementTypes()
    const types = all.map((r) => r.type)
    expect(types).toContain('plugin:all-a')
    expect(types).toContain('plugin:all-b')
  })

  it('reflects unregistrations', () => {
    const reg = makeRegistration('gone')
    const unsub = registerPluginElementType(reg)

    unsub()

    const all = getAllPluginElementTypes()
    expect(all.find((r) => r.type === 'plugin:gone')).toBeUndefined()
  })
})

// ─── subscribeToPluginRegistry ────────────────────────────────────

describe('subscribeToPluginRegistry', () => {
  it('notifies listeners on registration', () => {
    const listener = vi.fn()
    const unsubListener = subscribeToPluginRegistry(listener)
    cleanupFns.push(unsubListener)

    const reg = makeRegistration('notify-reg')
    const unsub = registerPluginElementType(reg)
    cleanupFns.push(unsub)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies listeners on unregistration', () => {
    const reg = makeRegistration('notify-unreg')
    const unsub = registerPluginElementType(reg)
    cleanupFns.push(unsub)

    const listener = vi.fn()
    const unsubListener = subscribeToPluginRegistry(listener)
    cleanupFns.push(unsubListener)

    unsub()
    // Remove from cleanupFns since it's already called
    cleanupFns = cleanupFns.filter((f) => f !== unsub)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe function stops notifications', () => {
    const listener = vi.fn()
    const unsubListener = subscribeToPluginRegistry(listener)

    unsubListener()

    const reg = makeRegistration('no-notify')
    const unsub = registerPluginElementType(reg)
    cleanupFns.push(unsub)

    expect(listener).not.toHaveBeenCalled()
  })
})
