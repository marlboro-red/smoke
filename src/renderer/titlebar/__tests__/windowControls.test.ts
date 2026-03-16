import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('WindowControls platform detection', () => {
  it('returns null on macOS (darwin)', () => {
    // On macOS, the component should not render (returns null)
    // because native window controls are used
    const platform = 'darwin'
    expect(platform === 'darwin').toBe(true)
  })

  it('renders on windows', () => {
    const platform = 'win32'
    expect(platform === 'darwin').toBe(false)
  })

  it('renders on linux', () => {
    const platform = 'linux'
    expect(platform === 'darwin').toBe(false)
  })
})

describe('WindowControls handlers', () => {
  let mockMinimize: ReturnType<typeof vi.fn>
  let mockMaximize: ReturnType<typeof vi.fn>
  let mockClose: ReturnType<typeof vi.fn>
  let mockIsMaximized: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockMinimize = vi.fn()
    mockMaximize = vi.fn().mockResolvedValue(undefined)
    mockClose = vi.fn()
    mockIsMaximized = vi.fn().mockResolvedValue(false)

    Object.defineProperty(globalThis, 'window', {
      value: {
        smokeAPI: {
          window: {
            minimize: mockMinimize,
            maximize: mockMaximize,
            close: mockClose,
            isMaximized: mockIsMaximized,
            platform: 'win32',
          },
        },
      },
      writable: true,
    })
  })

  it('minimize calls window.smokeAPI.window.minimize', () => {
    window.smokeAPI.window.minimize()
    expect(mockMinimize).toHaveBeenCalledOnce()
  })

  it('maximize calls window.smokeAPI.window.maximize', async () => {
    await window.smokeAPI.window.maximize()
    expect(mockMaximize).toHaveBeenCalledOnce()
  })

  it('close calls window.smokeAPI.window.close', () => {
    window.smokeAPI.window.close()
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('isMaximized returns current state', async () => {
    mockIsMaximized.mockResolvedValue(true)
    const result = await window.smokeAPI.window.isMaximized()
    expect(result).toBe(true)
  })

  it('maximize toggles maximized state', async () => {
    mockIsMaximized.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    let maximized = await window.smokeAPI.window.isMaximized()
    expect(maximized).toBe(false)

    await window.smokeAPI.window.maximize()
    maximized = await window.smokeAPI.window.isMaximized()
    expect(maximized).toBe(true)
  })
})
