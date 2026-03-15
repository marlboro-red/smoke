import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

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
  | 'canvasSearch'
  | 'showShortcutsHelp'
  | 'commandPalette'
  | 'exportCanvasPng'
  | 'saveBookmark'
  | 'showDepGraph'
  | 'openTerminalHere'
  | 'addBookmark'
  | 'startPresentation'
  | 'escape'

export interface ShortcutBinding {
  key: string
  mod: boolean
  shift: boolean
}

export const isMac =
  typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

const MOD_LABEL = isMac ? '\u2318' : 'Ctrl'

export const ACTION_LABELS: Record<ShortcutAction, string> = {
  newSession: 'New Session',
  closeSession: 'Close Session',
  cycleNextSession: 'Next Session',
  cyclePrevSession: 'Previous Session',
  focusSession1: 'Focus Session 1',
  focusSession2: 'Focus Session 2',
  focusSession3: 'Focus Session 3',
  focusSession4: 'Focus Session 4',
  focusSession5: 'Focus Session 5',
  focusSession6: 'Focus Session 6',
  focusSession7: 'Focus Session 7',
  focusSession8: 'Focus Session 8',
  focusSession9: 'Focus Session 9',
  resetZoom: 'Reset Zoom',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  saveLayout: 'Save Layout',
  openSettings: 'Open Settings',
  toggleAiPanel: 'Toggle AI Panel',
  toggleGroupCollapse: 'Toggle Group Collapse',
  toggleBroadcast: 'Toggle Broadcast',
  autoLayout: 'Auto Layout',
  canvasSearch: 'Search All Sessions',
  showShortcutsHelp: 'Keyboard Shortcuts',
  commandPalette: 'Command Palette',
  exportCanvasPng: 'Export Canvas as PNG',
  saveBookmark: 'Save Bookmark',
  showDepGraph: 'Show Import Dependency Graph',
  openTerminalHere: 'Open Terminal Here',
  addBookmark: 'Add Bookmark',
  startPresentation: 'Start Presentation',
  escape: 'Unfocus Session',
}

export const DEFAULT_BINDINGS: Record<ShortcutAction, ShortcutBinding> = {
  newSession: { key: 'n', mod: true, shift: false },
  closeSession: { key: 'w', mod: true, shift: false },
  cycleNextSession: { key: 'Tab', mod: true, shift: false },
  cyclePrevSession: { key: 'Tab', mod: true, shift: true },
  focusSession1: { key: '1', mod: true, shift: false },
  focusSession2: { key: '2', mod: true, shift: false },
  focusSession3: { key: '3', mod: true, shift: false },
  focusSession4: { key: '4', mod: true, shift: false },
  focusSession5: { key: '5', mod: true, shift: false },
  focusSession6: { key: '6', mod: true, shift: false },
  focusSession7: { key: '7', mod: true, shift: false },
  focusSession8: { key: '8', mod: true, shift: false },
  focusSession9: { key: '9', mod: true, shift: false },
  resetZoom: { key: '0', mod: true, shift: false },
  zoomIn: { key: '=', mod: true, shift: false },
  zoomOut: { key: '-', mod: true, shift: false },
  saveLayout: { key: 's', mod: true, shift: false },
  openSettings: { key: ',', mod: true, shift: false },
  toggleAiPanel: { key: 'l', mod: true, shift: false },
  toggleGroupCollapse: { key: 'g', mod: true, shift: true },
  toggleBroadcast: { key: 'b', mod: true, shift: true },
  autoLayout: { key: 'a', mod: true, shift: true },
  canvasSearch: { key: 'f', mod: true, shift: true },
  showShortcutsHelp: { key: '/', mod: true, shift: false },
  commandPalette: { key: 'p', mod: true, shift: false },
  exportCanvasPng: { key: 'e', mod: true, shift: true },
  saveBookmark: { key: 'd', mod: true, shift: false },
  showDepGraph: { key: 'd', mod: true, shift: true },
  openTerminalHere: { key: 't', mod: true, shift: true },
  addBookmark: { key: 'b', mod: true, shift: false },
  startPresentation: { key: 'F5', mod: false, shift: false },
  escape: { key: 'Escape', mod: false, shift: false },
}

export interface ShortcutGroupDef {
  title: string
  actions: ShortcutAction[]
}

export const SHORTCUT_GROUPS: ShortcutGroupDef[] = [
  {
    title: 'Session Management',
    actions: ['newSession', 'closeSession', 'cycleNextSession', 'cyclePrevSession', 'openTerminalHere'],
  },
  {
    title: 'Session Focus',
    actions: [
      'focusSession1', 'focusSession2', 'focusSession3',
      'focusSession4', 'focusSession5', 'focusSession6',
      'focusSession7', 'focusSession8', 'focusSession9',
    ],
  },
  {
    title: 'Canvas',
    actions: ['zoomIn', 'zoomOut', 'resetZoom', 'autoLayout', 'canvasSearch', 'exportCanvasPng', 'showDepGraph', 'addBookmark', 'startPresentation'],
  },
  {
    title: 'Groups',
    actions: ['toggleGroupCollapse', 'toggleBroadcast'],
  },
  {
    title: 'Layout & Settings',
    actions: ['saveLayout', 'saveBookmark', 'openSettings'],
  },
  {
    title: 'AI & Tools',
    actions: ['toggleAiPanel'],
  },
  {
    title: 'General',
    actions: ['commandPalette', 'showShortcutsHelp'],
  },
]

// --- Bindings store ---

interface ShortcutBindingsState {
  bindings: Record<ShortcutAction, ShortcutBinding | null>
  setCustomBindings: (custom: Record<string, ShortcutBinding | null>) => void
  updateBinding: (action: ShortcutAction, binding: ShortcutBinding | null) => Record<string, ShortcutBinding | null>
  resetToDefaults: () => void
}

export const shortcutBindingsStore = createStore<ShortcutBindingsState>((set, get) => ({
  bindings: { ...DEFAULT_BINDINGS },

  setCustomBindings: (custom) =>
    set({ bindings: { ...DEFAULT_BINDINGS, ...custom } as Record<ShortcutAction, ShortcutBinding | null> }),

  updateBinding: (action, binding) => {
    const next = { ...get().bindings, [action]: binding }
    set({ bindings: next })
    // Return only entries that differ from defaults (the custom overrides)
    const custom: Record<string, ShortcutBinding | null> = {}
    for (const [a, b] of Object.entries(next)) {
      const def = DEFAULT_BINDINGS[a as ShortcutAction]
      if (b === null || b.key !== def.key || b.mod !== def.mod || b.shift !== def.shift) {
        custom[a] = b
      }
    }
    return custom
  },

  resetToDefaults: () =>
    set({ bindings: { ...DEFAULT_BINDINGS } }),
}))

export const useShortcutBindings = (): Record<ShortcutAction, ShortcutBinding | null> =>
  useStore(shortcutBindingsStore, (s) => s.bindings)

// --- Capturing flag (disables global shortcuts during rebinding) ---

let _capturing = false
export function setShortcutCapturing(v: boolean): void {
  _capturing = v
}

// --- Key normalization ---

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

// --- Display formatting ---

export function formatBindingParts(binding: ShortcutBinding): string[] {
  const parts: string[] = []
  if (binding.mod) parts.push(MOD_LABEL)
  if (binding.shift) parts.push('Shift')
  let keyLabel = binding.key
  if (keyLabel.length === 1) keyLabel = keyLabel.toUpperCase()
  parts.push(keyLabel)
  return parts
}

// --- Conflict detection ---

export function findConflict(
  binding: ShortcutBinding,
  excludeAction: ShortcutAction
): ShortcutAction | null {
  const bindings = shortcutBindingsStore.getState().bindings
  const normKey = normalizeKey(binding.key)

  for (const [action, existing] of Object.entries(bindings)) {
    if (action === excludeAction || !existing) continue
    if (
      normalizeKey(existing.key) === normKey &&
      existing.mod === binding.mod &&
      existing.shift === binding.shift
    ) {
      return action as ShortcutAction
    }
  }
  return null
}

/**
 * Resolve a keyboard event to a shortcut action.
 * Returns the action name or null if no match.
 */
export function resolveShortcut(e: KeyboardEvent): ShortcutAction | null {
  if (_capturing) return null

  const mod = isMac ? e.metaKey : e.ctrlKey
  const shift = e.shiftKey
  const eventKey = normalizeKey(e.key)

  const bindings = shortcutBindingsStore.getState().bindings

  for (const [action, binding] of Object.entries(bindings)) {
    if (!binding) continue
    if (
      normalizeKey(binding.key) === eventKey &&
      binding.mod === mod &&
      binding.shift === shift
    ) {
      return action as ShortcutAction
    }
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
