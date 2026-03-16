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
  | 'goToLine'
  | 'togglePin'
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
  | 'toggleFocusMode'
  | 'deleteSelected'
  | 'selectAll'
  | 'groupSelected'
  | 'assembleWorkspace'
  | 'openWorkspace'
  | 'extractToNote'
  | 'toggleSidebar'
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
  goToLine: 'Go to Line',
  togglePin: 'Pin/Unpin to Viewport',
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
  toggleFocusMode: 'Toggle Focus Mode',
  deleteSelected: 'Delete Selected',
  selectAll: 'Select All',
  groupSelected: 'Group Selected',
  assembleWorkspace: 'Assemble Workspace',
  openWorkspace: 'Open Workspace',
  extractToNote: 'Extract Selection to Note',
  toggleSidebar: 'Toggle Sidebar',
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
  autoLayout: { key: 'l', mod: true, shift: true, alt: true },
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
  goToLine: { key: 'g', mod: true, shift: false, alt: false },
  togglePin: { key: 'j', mod: true, shift: true, alt: false },
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
  toggleFocusMode: { key: '.', mod: true, shift: true, alt: false },
  deleteSelected: { key: 'Backspace', mod: true, shift: false, alt: false },
  selectAll: { key: 'a', mod: true, shift: false, alt: false },
  groupSelected: { key: 'g', mod: true, shift: false, alt: true },
  assembleWorkspace: { key: 'a', mod: true, shift: true, alt: false },
  openWorkspace: { key: 'o', mod: true, shift: true, alt: false },
  extractToNote: { key: 'n', mod: true, shift: false, alt: true },
  toggleSidebar: { key: '\\', mod: true, shift: false, alt: true },
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
    actions: ['zoomIn', 'zoomOut', 'resetZoom', 'autoLayout', 'canvasSearch', 'selectAll', 'deleteSelected', 'groupSelected', 'exportCanvasPng', 'showDepGraph', 'addBookmark', 'startPresentation', 'toggleFileViewerEdit', 'goToLine', 'togglePin', 'toggleFocusMode', 'extractToNote'],
  },
  {
    title: 'Groups',
    actions: ['toggleGroupCollapse', 'toggleBroadcast'],
  },
  {
    title: 'Layout & Settings',
    actions: ['toggleSidebar', 'saveLayout', 'saveBookmark', 'openSettings', 'openWorkspace'],
  },
  {
    title: 'AI & Tools',
    actions: ['toggleAiPanel', 'assembleWorkspace'],
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

// --- System shortcuts (cannot be overridden) ---

interface SystemShortcut {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
  label: string
}

const SYSTEM_SHORTCUTS: SystemShortcut[] = isMac
  ? [
      { key: 'q', mod: true, shift: false, alt: false, label: 'Quit (⌘Q)' },
      { key: 'h', mod: true, shift: false, alt: false, label: 'Hide (⌘H)' },
      { key: 'h', mod: true, shift: false, alt: true, label: 'Hide Others (⌘⌥H)' },
      { key: 'm', mod: true, shift: false, alt: false, label: 'Minimize (⌘M)' },
      { key: 'Tab', mod: false, shift: false, alt: true, label: 'Switch App (⌥Tab)' },
    ]
  : [
      { key: 'F4', mod: false, shift: false, alt: true, label: 'Close Window (Alt+F4)' },
      { key: 'Tab', mod: false, shift: false, alt: true, label: 'Switch App (Alt+Tab)' },
    ]

function bindingsMatch(a: ShortcutBinding, b: { key: string; mod: boolean; shift: boolean; alt: boolean }): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    a.mod === b.mod &&
    a.shift === b.shift &&
    a.alt === b.alt
  )
}

/**
 * Check if a binding conflicts with a built-in system/Electron shortcut.
 * Returns the human-readable label of the system shortcut, or null if no conflict.
 */
export function findSystemConflict(binding: ShortcutBinding): string | null {
  for (const sys of SYSTEM_SHORTCUTS) {
    if (bindingsMatch(binding, sys)) {
      return sys.label
    }
  }
  return null
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

// --- Startup validation ---

export interface ShortcutConflictWarning {
  type: 'duplicate' | 'system'
  actions: ShortcutAction[]
  detail: string
}

/**
 * Validate current shortcut bindings for conflicts.
 * Called on app startup to catch issues from manual config edits.
 * Returns an array of warnings (empty if no conflicts).
 */
export function validateBindings(): ShortcutConflictWarning[] {
  const warnings: ShortcutConflictWarning[] = []
  const bindings = shortcutBindingsStore.getState().bindings

  // Check for duplicate bindings (two actions with the same key combo)
  const seen = new Map<string, ShortcutAction>()
  for (const [action, binding] of Object.entries(bindings)) {
    if (!binding) continue
    const fingerprint = `${normalizeKey(binding.key)}|${binding.mod}|${binding.shift}|${binding.alt}`
    const existing = seen.get(fingerprint)
    if (existing) {
      warnings.push({
        type: 'duplicate',
        actions: [existing, action as ShortcutAction],
        detail: `"${ACTION_LABELS[existing]}" and "${ACTION_LABELS[action as ShortcutAction]}" share the same binding (${formatBindingParts(binding).join('+')})`,
      })
    } else {
      seen.set(fingerprint, action as ShortcutAction)
    }
  }

  // Check for system shortcut conflicts
  for (const [action, binding] of Object.entries(bindings)) {
    if (!binding) continue
    const sysLabel = findSystemConflict(binding)
    if (sysLabel) {
      warnings.push({
        type: 'system',
        actions: [action as ShortcutAction],
        detail: `"${ACTION_LABELS[action as ShortcutAction]}" conflicts with system shortcut ${sysLabel}`,
      })
    }
  }

  return warnings
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
