import { describe, it, expect } from 'vitest'
import { getTheme, themes, THEME_IDS, type ThemeDefinition } from '../themes'

describe('themes registry', () => {
  it('has an entry for every THEME_ID', () => {
    for (const id of THEME_IDS) {
      expect(themes[id]).toBeDefined()
      expect(themes[id].id).toBe(id)
    }
  })

  it('defines exactly 6 themes', () => {
    expect(THEME_IDS.length).toBe(6)
    expect(Object.keys(themes).length).toBe(6)
  })

  it('each theme has required properties', () => {
    for (const theme of Object.values(themes)) {
      expect(theme.id).toBeTruthy()
      expect(theme.label).toBeTruthy()
      expect(typeof theme.isDark).toBe('boolean')
      expect(typeof theme.cssVars).toBe('object')
      expect(typeof theme.xtermTheme).toBe('object')
      expect(theme.shikiTheme).toBeTruthy()
    }
  })

  it('each theme provides core CSS variables', () => {
    const requiredVars = [
      '--bg-base', '--bg-sidebar', '--bg-window',
      '--accent', '--text-primary', '--text-secondary',
      '--border-subtle', '--border-default',
    ]
    for (const theme of Object.values(themes)) {
      for (const varName of requiredVars) {
        expect(theme.cssVars[varName]).toBeDefined()
      }
    }
  })

  it('each theme provides xterm terminal colors', () => {
    const requiredColors: (keyof NonNullable<ThemeDefinition['xtermTheme']>)[] = [
      'background', 'foreground', 'cursor',
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    ]
    for (const theme of Object.values(themes)) {
      for (const color of requiredColors) {
        expect(theme.xtermTheme[color]).toBeDefined()
      }
    }
  })

  it('light theme is the only non-dark theme', () => {
    const lightThemes = Object.values(themes).filter((t) => !t.isDark)
    expect(lightThemes.length).toBe(1)
    expect(lightThemes[0].id).toBe('light')
  })
})

describe('getTheme', () => {
  it('returns theme by id', () => {
    const dark = getTheme('dark')
    expect(dark.id).toBe('dark')

    const nord = getTheme('nord')
    expect(nord.id).toBe('nord')
  })

  it('returns dark theme as fallback for unknown id', () => {
    const fallback = getTheme('nonexistent-theme')
    expect(fallback.id).toBe('dark')
  })

  it('returns dark theme for empty string', () => {
    const fallback = getTheme('')
    expect(fallback.id).toBe('dark')
  })

  it('returns the correct theme for each known id', () => {
    for (const id of THEME_IDS) {
      const theme = getTheme(id)
      expect(theme.id).toBe(id)
    }
  })
})
