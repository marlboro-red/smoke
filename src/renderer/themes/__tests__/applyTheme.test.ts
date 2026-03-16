import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock terminalRegistry before importing applyTheme
vi.mock('../../terminal/terminalRegistry', () => ({
  getAllTerminals: vi.fn(() => []),
}))

// Mock document for Node environment
const mockStyle = {
  setProperty: vi.fn(),
  getPropertyValue: vi.fn(),
}
const mockDocumentElement = {
  style: mockStyle,
  dataset: {} as Record<string, string>,
}
vi.stubGlobal('document', { documentElement: mockDocumentElement })

import { applyTheme, applyFontSettings, getCurrentThemeId, getCurrentTheme } from '../applyTheme'
import { getTheme } from '../themes'
import { getAllTerminals } from '../../terminal/terminalRegistry'

describe('applyTheme', () => {
  beforeEach(() => {
    vi.mocked(getAllTerminals).mockReturnValue([])
    mockStyle.setProperty.mockClear()
    mockStyle.getPropertyValue.mockClear()
    mockDocumentElement.dataset = {}
    // Reset to dark theme
    applyTheme('dark')
    // Clear mock counts from the reset call
    mockStyle.setProperty.mockClear()
    mockDocumentElement.dataset = {}
  })

  it('sets the current theme id', () => {
    applyTheme('nord')
    expect(getCurrentThemeId()).toBe('nord')
  })

  it('sets data-theme attribute on document root', () => {
    applyTheme('dracula')
    expect(mockDocumentElement.dataset.theme).toBe('dracula')
  })

  it('applies CSS variables to document root', () => {
    applyTheme('nord')
    const theme = getTheme('nord')
    expect(mockStyle.setProperty).toHaveBeenCalledWith('--bg-base', theme.cssVars['--bg-base'])
    expect(mockStyle.setProperty).toHaveBeenCalledWith('--accent', theme.cssVars['--accent'])
  })

  it('falls back to dark theme for unknown id', () => {
    applyTheme('nonexistent')
    expect(getCurrentThemeId()).toBe('dark')
  })

  it('getCurrentTheme returns the full ThemeDefinition', () => {
    applyTheme('catppuccin-mocha')
    const theme = getCurrentTheme()
    expect(theme.id).toBe('catppuccin-mocha')
    expect(theme.label).toBe('Catppuccin Mocha')
    expect(theme.isDark).toBe(true)
  })

  it('updates terminal themes when terminals exist', () => {
    const mockTerminal = {
      terminal: { options: { theme: {}, allowTransparency: false } },
    }
    vi.mocked(getAllTerminals).mockReturnValue([mockTerminal as any])

    applyTheme('dracula')

    const theme = getTheme('dracula')
    expect(mockTerminal.terminal.options.theme).toMatchObject({
      background: theme.xtermTheme.background,
      foreground: theme.xtermTheme.foreground,
    })
  })
})

describe('applyFontSettings', () => {
  beforeEach(() => {
    vi.mocked(getAllTerminals).mockReturnValue([])
    mockStyle.setProperty.mockClear()
  })

  it('sets CSS custom properties for fonts', () => {
    applyFontSettings('JetBrains Mono', 14, 1.4)
    expect(mockStyle.setProperty).toHaveBeenCalledWith('--font-mono', 'JetBrains Mono')
    expect(mockStyle.setProperty).toHaveBeenCalledWith('--font-size-lg', '14px')
    expect(mockStyle.setProperty).toHaveBeenCalledWith('--line-height-code', '1.4')
  })

  it('updates terminal font options', () => {
    const mockTerminal = {
      terminal: { options: { fontFamily: '', fontSize: 0, lineHeight: 0 } },
    }
    vi.mocked(getAllTerminals).mockReturnValue([mockTerminal as any])

    applyFontSettings('Fira Code', 16, 1.5)

    expect(mockTerminal.terminal.options.fontFamily).toBe('Fira Code')
    expect(mockTerminal.terminal.options.fontSize).toBe(16)
    expect(mockTerminal.terminal.options.lineHeight).toBe(1.5)
  })
})
