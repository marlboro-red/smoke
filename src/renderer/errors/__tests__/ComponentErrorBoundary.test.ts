import { describe, it, expect } from 'vitest'
import ComponentErrorBoundary from '../ComponentErrorBoundary'

describe('ComponentErrorBoundary', () => {
  it('getDerivedStateFromError returns hasError true and the error', () => {
    const error = new Error('render exploded')
    const state = ComponentErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, error })
  })

  it('getDerivedStateFromError captures different error messages', () => {
    const error = new Error('xterm addon failed')
    const state = ComponentErrorBoundary.getDerivedStateFromError(error)
    expect(state.hasError).toBe(true)
    expect(state.error?.message).toBe('xterm addon failed')
  })
})
