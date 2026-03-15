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
  | 'toggleFileViewerEdit'
  | 'newSnippet'
  | 'duplicateElement'
  | 'splitHorizontal'
  | 'splitVertical'
  | 'navigatePaneLeft'
  | 'navigatePaneRight'
  | 'navigatePaneUp'
  | 'navigatePaneDown'
  | 'closePane'
  | 'terminalSearch'
  | 'escape'

export interface ShortcutBinding {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
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
  toggleFileViewerEdit: 'Toggle File Viewer Edit Mode',
  newSnippet: 'New Snippet',
  duplicateElement: 'Duplicate Element',
  splitHorizontal: 'Split Pane Horizontal',
  splitVertical: 'Split Pane Vertical',
  navigatePaneLeft: 'Navigate Pane Left',
  navigatePaneRight: 'Navigate Pane Right',
  navigatePaneUp: 'Navigate Pane Up',
  navigatePaneDown: 'Navigate Pane Down',
  closePane: 'Close Pane',
  terminalSearch: 'Find in Terminal',
  escape: 'Unfocus Session',
}

export const DEFAULT_BINDINGS: Record<ShortcutAction, ShortcutBinding> = {
  newSession: { key: 'n', mod: true, shift: false, alt: false },
  closeSession: { key: 'w', mod: true, shift: false, alt: false },
  cycleNextSession: { key: 'Tab', mod: true, shift: false, alt: false },
  cyclePrevSession: { key: 'Tab', mod: true, shift: true, alt: false },
  focusSession1: { key: '1', mod: true, shift: false, alt: false },
  focusSession2: { key: '2', mod: true, shift: false, alt: false },
  focusSession3: { key: '3', mod: true, shift: false, alt: false },
  focusSession4: { key: '4', mod: true, shift: false, alt: false },
  focusSession5: { key: '5', mod: true, shift: false, alt: false },
  focusSession6: { key: '6', mod: true, shift: false, alt: false },
  focusSession7: { key: '7', mod: true, shift: false, alt: false },
  focusSession8: { key: '8', mod: true, shift: false, alt: false },
  focusSession9: { key: '9', mod: true, shift: false, alt: false },
  resetZoom: { key: '0', mod: true, shift: false, alt: false },
  zoomIn: { key: '=', mod: true, shift: false, alt: false },
  zoomOut: { key: '-', mod: true, shift: false, alt: false },
  saveLayout: { key: 's', mod: true, shift: false, alt: false },
  openSettings: { key: ',', mod: true, shift: false, alt: false },
  toggleAiPanel: { key: 'l', mod: true, shift: false, alt: false },
  toggleGroupCollapse: { key: 'g', mod: true, shift: true, alt: false },
  toggleBroadcast: { key: 'b', mod: true, shift: true, alt: false },
  autoLayout: { key: 'a', mod: true, shift: true, alt: false },
  canvasSearch: { key: 'f', mod: true, shift: true, alt: false },
  showShortcutsHelp: { key: '/', mod: true, shift: false, alt: false },
  commandPalette: { key: 'p', mod: true, shift: false, alt: false },
  exportCanvasPng: { key: 'e', mod: true, shift: true, alt: false },
  saveBookmark: { key: 'k', mod: true, shift: false, alt: false },
  showDepGraph: { key: 'i', mod: true, shift: true, alt: false },
  openTerminalHere: { key: 't', mod: true, shift: true, alt: false },
  addBookmark: { key: 'b', mod: true, shift: false, alt: false },
  startPresentation: { key: 'F5', mod: false, shift: false, alt: false },
  toggleFileViewerEdit: { key: 'e', mod: true, shift: false, alt: false },
  newSnippet: { key: 'k', mod: true, shift: true, alt: false },
  duplicateElement: { key: 'd', mod: true, shift: false, alt: false },
  splitHorizontal: { key: '\\', mod: true, shift: false, alt: false },
  splitVertical: { key: '\\', mod: true, shift: true, alt: false },
  navigatePaneLeft: { key: 'ArrowLeft', mod: true, shift: false, alt: true },
  navigatePaneRight: { key: 'ArrowRight', mod: true, shift: false, alt: true },
  navigatePaneUp: { key: 'ArrowUp', mod: true, shift: false, alt: true },
  navigatePaneDown: { key: 'ArrowDown', mod: true, shift: false, alt: true },
  closePane: { key: 'w', mod: true, shift: true, alt: false },
  terminalSearch: { key: 'f', mod: true, shift: false, alt: false },
  escape: { key: 'Escape', mod: false, shift: false, alt: false },
}

export interface ShortcutGroupDef {
  title: string
  actions: ShortcutAction[]
}

export const SHORTCUT_GROUPS: ShortcutGroupDef[] = [
  {
    title: 'Session Management',
    actions: ['newSession', 'newSnippet', 'duplicateElement', 'closeSession', 'cycleNextSession', 'cyclePrevSession', 'openTerminalHere', 'terminalSearch'],
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
    title: 'Split Panes',
    actions: ['splitHorizontal', 'splitVertical', 'navigatePaneLeft', 'navigatePaneRight', 'navigatePaneUp', 'navigatePaneDown', 'closePane'],
  },
  {
    title: 'Canvas',
    actions: ['zoomIn', 'zoomOut', 'resetZoom', 'autoLayout', 'canvasSearch', 'exportCanvasPng', 'showDepGraph', 'addBookmark', 'startPresentation', 'toggleFileViewerEdit'],
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
      if (b === null || b.key !== def.key || b.mod !== def.mod || b.shift !== def.shift || b.alt !== def.alt) {
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
  if (binding.alt) parts.push('Alt')
  if (binding.shift) parts.push('Shift')
  let keyLabel = binding.key
  if (keyLabel === 'ArrowLeft') keyLabel = '\u2190'
  else if (keyLabel === 'ArrowRight') keyLabel = '\u2192'
  else if (keyLabel === 'ArrowUp') keyLabel = '\u2191'
  else if (keyLabel === 'ArrowDown') keyLabel = '\u2193'
  else if (keyLabel.length === 1) keyLabel = keyLabel.toUpperCase()
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
      existing.shift === binding.shift &&
      existing.alt === binding.alt
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
  const alt = e.altKey
  const eventKey = normalizeKey(e.key)

  const bindings = shortcutBindingsStore.getState().bindings

  for (const [action, binding] of Object.entries(bindings)) {
    if (!binding) continue
    if (
      normalizeKey(binding.key) === eventKey &&
      binding.mod === mod &&
      binding.shift === shift &&
      binding.alt === alt
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
