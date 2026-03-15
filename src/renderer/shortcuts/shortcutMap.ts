export type ShortcutAction =
  | 'newSession'
  | 'closeSession'
  | 'cycleNextSession'
  | 'cyclePrevSession'
  | 'focusSession1'
  | 'focusSession2'
  | 'focusSession3'
  | 'focusSession4'
  | 'focusSession5'
  | 'focusSession6'
  | 'focusSession7'
  | 'focusSession8'
  | 'focusSession9'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'saveLayout'
  | 'openSettings'
  | 'toggleAiPanel'
  | 'toggleGroupCollapse'
  | 'toggleBroadcast'
  | 'autoLayout'
  | 'showShortcutsHelp'
  | 'commandPalette'
  | 'escape'

export interface ShortcutDef {
  action: ShortcutAction
  key: string
  mod: boolean
  shift?: boolean
}

export const isMac =
  typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

/**
 * Resolve a keyboard event to a shortcut action.
 * Returns the action name or null if no match.
 */
export function resolveShortcut(e: KeyboardEvent): ShortcutAction | null {
  const mod = isMac ? e.metaKey : e.ctrlKey

  // Escape — no modifier required
  if (e.key === 'Escape') return 'escape'

  if (!mod) return null

  switch (e.key) {
    case 'p':
      return 'commandPalette'
    case 'n':
      return 'newSession'
    case 'w':
      return 'closeSession'
    case 'Tab':
      return e.shiftKey ? 'cyclePrevSession' : 'cycleNextSession'
    case '0':
      return 'resetZoom'
    case '=':
      return 'zoomIn'
    case '-':
      return 'zoomOut'
    case 's':
      return 'saveLayout'
    case ',':
      return 'openSettings'
    case 'l':
      return 'toggleAiPanel'
    case 'g':
      if (e.shiftKey) return 'toggleGroupCollapse'
      break
    case 'b':
      if (e.shiftKey) return 'toggleBroadcast'
      break
    case 'a':
      if (e.shiftKey) return 'autoLayout'
      break
    case '/':
      return 'showShortcutsHelp'
    default:
      break
  }

  // Cmd/Ctrl+1-9: focus session by index
  const digit = parseInt(e.key, 10)
  if (digit >= 1 && digit <= 9) {
    return `focusSession${digit}` as ShortcutAction
  }

  return null
}

/**
 * Get sorted session list (by createdAt) for cycling and index operations.
 */
export function getSortedSessionIds(
  sessions: Map<string, { createdAt: number }>
): string[] {
  return Array.from(sessions.entries())
    .sort((a, b) => a[1].createdAt - b[1].createdAt)
    .map(([id]) => id)
}
