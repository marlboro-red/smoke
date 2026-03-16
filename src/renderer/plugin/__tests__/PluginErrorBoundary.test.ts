import { describe, it, expect, vi } from 'vitest'
import PluginErrorBoundary from '../PluginErrorBoundary'

describe('PluginErrorBoundary', () => {
  it('getDerivedStateFromError returns hasError true with the error', () => {
    const error = new Error('plugin render crash')
    const state = PluginErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, error })
  })

  it('getDerivedStateFromError captures different error messages', () => {
    const error = new Error('missing dependency')
    const state = PluginErrorBoundary.getDerivedStateFromError(error)
    expect(state.hasError).toBe(true)
    expect(state.error?.message).toBe('missing dependency')
  })

  it('componentDidCatch calls onError with render phase', () => {
    const onError = vi.fn()
    const boundary = new PluginErrorBoundary({
      pluginId: 'test-plugin',
      onError,
      children: null,
    })

    const error = new Error('render exploded')
    const errorInfo = { componentStack: 'at MyComponent\n  at PluginSandbox' } as any

    boundary.componentDidCatch(error, errorInfo)

    expect(onError).toHaveBeenCalledWith({
      message: 'render exploded',
      stack: 'at MyComponent\n  at PluginSandbox',
      phase: 'render',
    })
  })

  it('componentDidCatch falls back to error.stack when componentStack is null', () => {
    const onError = vi.fn()
    const boundary = new PluginErrorBoundary({
      pluginId: 'test-plugin',
      onError,
      children: null,
    })

    const error = new Error('no component stack')
    error.stack = 'Error: no component stack\n  at Object.<anonymous>'
    const errorInfo = { componentStack: null } as any

    boundary.componentDidCatch(error, errorInfo)

    expect(onError).toHaveBeenCalledWith({
      message: 'no component stack',
      stack: 'Error: no component stack\n  at Object.<anonymous>',
      phase: 'render',
    })
  })

  it('initial state has no error', () => {
    const boundary = new PluginErrorBoundary({
      pluginId: 'test-plugin',
      onError: vi.fn(),
      children: null,
    })

    expect(boundary.state).toEqual({ hasError: false, error: null })
  })
})
