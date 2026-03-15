import { getTheme } from './themes'
import type { ThemeDefinition } from './themes'
import { getAllTerminals } from '../terminal/terminalRegistry'

let currentThemeId: string = 'dark'

export function getCurrentThemeId(): string {
  return currentThemeId
}

export function getCurrentTheme(): ThemeDefinition {
  return getTheme(currentThemeId)
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
  for (const entry of getAllTerminals()) {
    entry.terminal.options.theme = theme.xtermTheme
  }
}
