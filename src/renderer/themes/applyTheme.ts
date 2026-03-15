import { getTheme } from './themes'
import type { ThemeDefinition } from './themes'
import { getAllTerminals } from '../terminal/terminalRegistry'

let currentThemeId: string = 'dark'
let currentTerminalOpacity: number = 1

export function getCurrentThemeId(): string {
  return currentThemeId
}

export function getCurrentTheme(): ThemeDefinition {
  return getTheme(currentThemeId)
}

/**
 * Parse an rgba/rgb CSS color string and return its r, g, b, a components.
 * Handles: rgba(r, g, b, a), rgb(r, g, b), #rrggbb
 */
function parseRgba(color: string): { r: number; g: number; b: number; a: number } | null {
  const rgbaMatch = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/)
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    }
  }
  return null
}

export function applyTerminalOpacity(opacity: number): void {
  currentTerminalOpacity = opacity
  const root = document.documentElement
  const theme = getCurrentTheme()

  const bgWindow = theme.cssVars['--bg-window'] || 'rgba(22, 22, 40, 0.96)'
  const parsed = parseRgba(bgWindow)

  if (parsed) {
    // Multiply the theme's base alpha by the user's opacity setting
    const finalAlpha = opacity < 1 ? opacity : parsed.a
    root.style.setProperty('--bg-terminal', `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${finalAlpha})`)
  }

  // Add frosted glass blur when translucent
  root.style.setProperty('--terminal-backdrop', opacity < 1 ? 'blur(12px)' : 'none')

  // Update xterm.js terminals
  const transparent = opacity < 1
  for (const entry of getAllTerminals()) {
    entry.terminal.options.allowTransparency = transparent
    entry.terminal.options.theme = {
      ...theme.xtermTheme,
      background: transparent ? 'transparent' : theme.xtermTheme.background,
    }
  }
}

export function applyFontSettings(fontFamily: string, fontSize: number, lineHeight: number): void {
  const root = document.documentElement
  root.style.setProperty('--font-mono', fontFamily)
  root.style.setProperty('--font-size-lg', `${fontSize}px`)
  root.style.setProperty('--line-height-code', String(lineHeight))

  // Update all existing xterm.js terminal instances
  for (const entry of getAllTerminals()) {
    entry.terminal.options.fontFamily = fontFamily
    entry.terminal.options.fontSize = fontSize
    entry.terminal.options.lineHeight = lineHeight
  }
}

export function applyTheme(themeId: string): void {
  const theme = getTheme(themeId)
  currentThemeId = theme.id

  // Apply CSS variables to the document root
  const root = document.documentElement
  root.dataset.theme = theme.id
  for (const [key, value] of Object.entries(theme.cssVars)) {
    root.style.setProperty(key, value)
  }

  // Update all existing terminal instances
  const transparent = currentTerminalOpacity < 1
  for (const entry of getAllTerminals()) {
    entry.terminal.options.theme = {
      ...theme.xtermTheme,
      background: transparent ? 'transparent' : theme.xtermTheme.background,
    }
  }

  // Re-apply terminal opacity with the new theme
  applyTerminalOpacity(currentTerminalOpacity)
}
