import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Minimal DOM mock ──
// applyTheme.ts reads/writes document.documentElement. Since jsdom is not
// available in this project's test environment, provide a lightweight stub.

const styleProps = new Map<string, string>()
const mockRoot = {
  dataset: {} as Record<string, string>,
  style: {
    setProperty: (key: string, value: string) => styleProps.set(key, value),
    getPropertyValue: (key: string) => styleProps.get(key) ?? '',
  },
  removeAttribute: (attr: string) => {
    if (attr === 'style') styleProps.clear()
    if (attr === 'data-theme') delete mockRoot.dataset.theme
  },
}

vi.stubGlobal('document', {
  documentElement: mockRoot,
})

import { themes, getTheme, THEME_IDS, type ThemeDefinition } from '../themes'
import {
  applyTheme,
  applyTerminalOpacity,
  applyFontSettings,
  getCurrentThemeId,
  getCurrentTheme,
} from '../applyTheme'

// Mock terminalRegistry so applyTheme/applyTerminalOpacity can iterate terminals
const mockTerminals: Array<{
  terminal: {
    options: Record<string, unknown>
  }
}> = []

vi.mock('../../terminal/terminalRegistry', () => ({
  getAllTerminals: () => mockTerminals,
}))

// ── Theme Definitions ──

describe('theme definitions', () => {
  it('THEME_IDS lists all registered themes', () => {
    expect(THEME_IDS).toEqual([
      'dark',
      'light',
      'catppuccin-mocha',
      'dracula',
      'nord',
      'solarized-dark',
    ])
  })

  it('themes registry has an entry for every THEME_ID', () => {
    for (const id of THEME_IDS) {
      expect(themes[id]).toBeDefined()
      expect(themes[id].id).toBe(id)
    }
  })

  it('every theme has a non-empty label', () => {
    for (const id of THEME_IDS) {
      expect(themes[id].label.length).toBeGreaterThan(0)
    }
  })

  it('light theme has isDark false, all others have isDark true', () => {
    expect(themes.light.isDark).toBe(false)
    for (const id of THEME_IDS) {
      if (id !== 'light') {
        expect(themes[id].isDark).toBe(true)
      }
    }
  })

  describe('CSS variable completeness', () => {
    const requiredVars = [
      '--bg-base',
      '--bg-sidebar',
      '--bg-window',
      '--bg-chrome',
      '--bg-thumbnail',
      '--bg-elevated',
      '--bg-hover',
      '--bg-active',
      '--accent',
      '--accent-hover',
      '--accent-dim',
      '--accent-muted',
      '--accent-strong',
      '--accent-text',
      '--color-success',
      '--color-error',
      '--color-info',
      '--color-warning',
      '--color-neutral',
      '--text-primary',
      '--text-secondary',
      '--text-tertiary',
      '--text-muted',
      '--text-placeholder',
      '--border-subtle',
      '--border-default',
      '--border-strong',
      '--shadow-window',
      '--shadow-window-focus',
      '--shadow-dropdown',
      '--scrollbar-thumb',
      '--scrollbar-thumb-hover',
      '--selection-text',
    ]

    for (const id of THEME_IDS) {
      it(`${id} theme defines all required CSS variables`, () => {
        const cssVars = themes[id].cssVars
        for (const varName of requiredVars) {
          expect(cssVars[varName], `${id} missing ${varName}`).toBeDefined()
          expect(cssVars[varName].length).toBeGreaterThan(0)
        }
      })
    }
  })

  describe('xterm theme color mapping', () => {
    const requiredXtermKeys: Array<keyof NonNullable<ThemeDefinition['xtermTheme']>> = [
      'background',
      'foreground',
      'cursor',
      'selectionBackground',
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ]

    for (const id of THEME_IDS) {
      it(`${id} theme has all xterm color properties`, () => {
        const xt = themes[id].xtermTheme
        for (const key of requiredXtermKeys) {
          expect(xt[key], `${id} missing xtermTheme.${key}`).toBeDefined()
          expect(String(xt[key]).length).toBeGreaterThan(0)
        }
      })
    }
  })

  describe('shiki theme mapping', () => {
    const expectedShikiThemes: Record<string, string> = {
      dark: 'github-dark',
      light: 'github-light',
      'catppuccin-mocha': 'catppuccin-mocha',
      dracula: 'dracula',
      nord: 'nord',
      'solarized-dark': 'solarized-dark',
    }

    for (const id of THEME_IDS) {
      it(`${id} maps to shiki theme "${expectedShikiThemes[id]}"`, () => {
        expect(themes[id].shikiTheme).toBe(expectedShikiThemes[id])
      })
    }
  })
})

// ── getTheme ──

describe('getTheme', () => {
  it('returns the requested theme by id', () => {
    expect(getTheme('dark').id).toBe('dark')
    expect(getTheme('light').id).toBe('light')
    expect(getTheme('dracula').id).toBe('dracula')
  })

  it('falls back to dark theme for unknown id', () => {
    expect(getTheme('nonexistent').id).toBe('dark')
    expect(getTheme('').id).toBe('dark')
  })
})

// ── applyTheme ──

describe('applyTheme', () => {
  beforeEach(() => {
    mockTerminals.length = 0
    styleProps.clear()
    delete mockRoot.dataset.theme
  })

  it('sets data-theme attribute on document root', () => {
    applyTheme('dark')
    expect(mockRoot.dataset.theme).toBe('dark')

    applyTheme('light')
    expect(mockRoot.dataset.theme).toBe('light')
  })

  it('applies all CSS variables from the theme', () => {
    applyTheme('dracula')
    const draculaVars = themes.dracula.cssVars

    for (const [key, value] of Object.entries(draculaVars)) {
      expect(styleProps.get(key)).toBe(value)
    }
  })

  it('switching theme replaces CSS variables', () => {
    applyTheme('dark')
    expect(styleProps.get('--bg-base')).toBe(themes.dark.cssVars['--bg-base'])

    applyTheme('light')
    expect(styleProps.get('--bg-base')).toBe(themes.light.cssVars['--bg-base'])
  })

  it('updates currentThemeId', () => {
    applyTheme('nord')
    expect(getCurrentThemeId()).toBe('nord')
    expect(getCurrentTheme().id).toBe('nord')
  })

  it('falls back to dark for invalid theme id', () => {
    applyTheme('invalid-theme')
    expect(getCurrentThemeId()).toBe('dark')
    expect(mockRoot.dataset.theme).toBe('dark')
  })

  it('updates xterm theme on existing terminals', () => {
    const mockTerminal = { options: {} as Record<string, unknown> }
    mockTerminals.push({ terminal: mockTerminal })

    applyTheme('catppuccin-mocha')
    const applied = mockTerminal.options.theme as Record<string, string>
    expect(applied.foreground).toBe(themes['catppuccin-mocha'].xtermTheme.foreground)
    expect(applied.background).toBe(themes['catppuccin-mocha'].xtermTheme.background)
  })

  it('uses transparent background when terminal opacity < 1', () => {
    const mockTerminal = { options: {} as Record<string, unknown> }
    mockTerminals.push({ terminal: mockTerminal })

    // Set opacity to < 1 first, then apply theme
    applyTerminalOpacity(0.8)
    applyTheme('dark')

    const applied = mockTerminal.options.theme as Record<string, string>
    expect(applied.background).toBe('transparent')
  })
})

// ── applyTerminalOpacity ──

describe('applyTerminalOpacity', () => {
  beforeEach(() => {
    mockTerminals.length = 0
    styleProps.clear()
    delete mockRoot.dataset.theme
    // Reset to known theme
    applyTheme('dark')
  })

  it('sets --bg-terminal CSS variable with adjusted alpha', () => {
    applyTerminalOpacity(0.5)
    const bgTerminal = styleProps.get('--bg-terminal') ?? ''
    expect(bgTerminal).toContain('rgba')
    expect(bgTerminal).toContain('0.5')
  })

  it('applies frosted glass blur when opacity < 1', () => {
    applyTerminalOpacity(0.7)
    expect(styleProps.get('--terminal-backdrop')).toBe('blur(12px)')
  })

  it('removes blur when opacity is 1', () => {
    applyTerminalOpacity(1)
    expect(styleProps.get('--terminal-backdrop')).toBe('none')
  })

  it('sets transparent background on terminals when opacity < 1', () => {
    const mockTerminal = { options: {} as Record<string, unknown> }
    mockTerminals.push({ terminal: mockTerminal })

    applyTerminalOpacity(0.5)
    const applied = mockTerminal.options.theme as Record<string, string>
    expect(applied.background).toBe('transparent')
  })

  it('sets theme background on terminals when opacity is 1', () => {
    const mockTerminal = { options: {} as Record<string, unknown> }
    mockTerminals.push({ terminal: mockTerminal })

    applyTerminalOpacity(1)
    const applied = mockTerminal.options.theme as Record<string, string>
    expect(applied.background).toBe(themes.dark.xtermTheme.background)
  })

  it('enables allowTransparency on all terminals', () => {
    const mockTerminal = { options: {} as Record<string, unknown> }
    mockTerminals.push({ terminal: mockTerminal })

    applyTerminalOpacity(0.8)
    expect(mockTerminal.options.allowTransparency).toBe(true)
  })
})

// ── applyFontSettings ──

describe('applyFontSettings', () => {
  beforeEach(() => {
    mockTerminals.length = 0
    styleProps.clear()
  })

  it('sets font CSS variables', () => {
    applyFontSettings('JetBrains Mono', 14, 1.4)
    expect(styleProps.get('--font-mono')).toBe('JetBrains Mono')
    expect(styleProps.get('--font-size-lg')).toBe('14px')
    expect(styleProps.get('--line-height-code')).toBe('1.4')
  })

  it('updates font settings on existing terminals', () => {
    const mockTerminal = { options: {} as Record<string, unknown> }
    mockTerminals.push({ terminal: mockTerminal })

    applyFontSettings('Fira Code', 16, 1.6)
    expect(mockTerminal.options.fontFamily).toBe('Fira Code')
    expect(mockTerminal.options.fontSize).toBe(16)
    expect(mockTerminal.options.lineHeight).toBe(1.6)
  })
})

// ── Theme persistence via preferencesStore ──

describe('theme persistence', () => {
  it('preferencesStore defaults to dark theme', async () => {
    const { preferencesStore } = await import('../../stores/preferencesStore')
    expect(preferencesStore.getState().preferences.theme).toBe('dark')
  })

  it('updatePreference changes theme in store', async () => {
    const { preferencesStore } = await import('../../stores/preferencesStore')
    preferencesStore.getState().updatePreference('theme', 'light')
    expect(preferencesStore.getState().preferences.theme).toBe('light')

    // Restore default
    preferencesStore.getState().updatePreference('theme', 'dark')
  })

  it('setPreferences sets theme alongside other prefs', async () => {
    const { preferencesStore } = await import('../../stores/preferencesStore')
    const original = { ...preferencesStore.getState().preferences }

    preferencesStore.getState().setPreferences({
      ...original,
      theme: 'nord',
    })
    expect(preferencesStore.getState().preferences.theme).toBe('nord')

    // Restore
    preferencesStore.getState().setPreferences(original)
  })
})
