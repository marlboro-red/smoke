import { sessionStore, type Session } from '../stores/sessionStore'
import { preferencesStore } from '../stores/preferencesStore'
import { createNewSession } from '../session/useSessionCreation'
import { closeSession } from '../session/useSessionClose'
import { panToSession } from '../sidebar/useSidebarSync'
import { setZoomTo, zoomIn, zoomOut, getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import { serializeCurrentLayout } from '../layout/useLayoutPersistence'
import { settingsModalStore } from '../config/settingsStore'
import { shortcutsOverlayStore } from '../shortcuts/shortcutsOverlayStore'
import { aiStore } from '../stores/aiStore'
import { performAutoLayout } from '../layout/autoLayout'
import { applyTheme } from '../themes/applyTheme'
import { createFileViewerSession } from '../fileviewer/useFileViewerCreation'
import { getSortedSessionIds } from '../shortcuts/shortcutMap'
import { presentationStore } from '../presentation/presentationStore'
import { regionStore } from '../stores/regionStore'

export interface PaletteItem {
  id: string
  title: string
  category: string
  icon: string
  action: () => void
}

function getTypeIcon(type: Session['type']): string {
  switch (type) {
    case 'terminal':
      return '>'
    case 'file':
      return '#'
    case 'note':
      return '*'
    case 'snippet':
      return '{'
    case 'webview':
      return '@'
  }
}

/**
 * Build the list of session items (jump-to-element commands).
 */
function getSessionItems(): PaletteItem[] {
  const { sessions } = sessionStore.getState()
  const sorted = getSortedSessionIds(sessions)

  return sorted.map((id) => {
    const session = sessions.get(id)!
    return {
      id: `session:${id}`,
      title: session.title,
      category: session.type === 'terminal' ? 'Terminal' : session.type === 'file' ? 'File' : session.type === 'snippet' ? 'Snippet' : session.type === 'webview' ? 'Web' : 'Note',
      icon: getTypeIcon(session.type),
      action: () => panToSession(id),
    }
  })
}

/**
 * Static action commands available in the palette.
 */
function getActionItems(): PaletteItem[] {
  return [
    {
      id: 'action:new-terminal',
      title: 'New Terminal',
      category: 'Action',
      icon: '+',
      action: () => createNewSession(),
    },
    {
      id: 'action:new-snippet',
      title: 'New Snippet',
      category: 'Action',
      icon: '{',
      action: () => {
        const session = sessionStore.getState().createSnippetSession()
        sessionStore.getState().focusSession(session.id)
      },
    },
    {
      id: 'action:new-region',
      title: 'New Region',
      category: 'Canvas',
      icon: '[]',
      action: () => {
        const pan = getCurrentPan()
        const zoom = getCurrentZoom()
        // Place region in the center of the current viewport
        const rootW = window.innerWidth
        const rootH = window.innerHeight
        const centerX = (-pan.x + rootW / 2) / zoom - 300
        const centerY = (-pan.y + rootH / 2) / zoom - 200
        regionStore.getState().createRegion('New Region', { x: centerX, y: centerY })
      },
    },
    {
      id: 'action:close-session',
      title: 'Close Focused Session',
      category: 'Action',
      icon: 'x',
      action: () => {
        const { focusedId } = sessionStore.getState()
        if (focusedId) closeSession(focusedId)
      },
    },
    {
      id: 'action:save-layout',
      title: 'Save Layout',
      category: 'Layout',
      icon: 'S',
      action: () => {
        const layout = serializeCurrentLayout('__default__')
        window.smokeAPI?.layout.save('__default__', layout)
      },
    },
    {
      id: 'action:auto-layout',
      title: 'Auto Layout (Grid)',
      category: 'Layout',
      icon: '#',
      action: () => performAutoLayout('grid'),
    },
    {
      id: 'action:auto-layout-h',
      title: 'Auto Layout (Horizontal)',
      category: 'Layout',
      icon: '-',
      action: () => performAutoLayout('horizontal'),
    },
    {
      id: 'action:auto-layout-v',
      title: 'Auto Layout (Vertical)',
      category: 'Layout',
      icon: '|',
      action: () => performAutoLayout('vertical'),
    },
    {
      id: 'action:toggle-theme',
      title: 'Toggle Theme',
      category: 'Settings',
      icon: '@',
      action: () => {
        const { preferences } = preferencesStore.getState()
        const next = preferences.theme === 'light' ? 'dark' : 'light'
        preferencesStore.getState().setPreferences({ ...preferences, theme: next })
        applyTheme(next)
        window.smokeAPI?.config.set('theme', next)
      },
    },
    {
      id: 'action:open-settings',
      title: 'Open Settings',
      category: 'Settings',
      icon: ',',
      action: () => settingsModalStore.getState().open(),
    },
    {
      id: 'action:toggle-ai',
      title: 'Toggle AI Panel',
      category: 'Tools',
      icon: 'A',
      action: () => aiStore.getState().togglePanel(),
    },
    {
      id: 'action:zoom-in',
      title: 'Zoom In',
      category: 'Canvas',
      icon: '+',
      action: () => zoomIn(),
    },
    {
      id: 'action:zoom-out',
      title: 'Zoom Out',
      category: 'Canvas',
      icon: '-',
      action: () => zoomOut(),
    },
    {
      id: 'action:reset-zoom',
      title: 'Reset Zoom',
      category: 'Canvas',
      icon: '0',
      action: () => setZoomTo(1.0),
    },
    {
      id: 'action:toggle-pin',
      title: 'Pin/Unpin Focused Element to Viewport',
      category: 'Canvas',
      icon: 'P',
      action: () => {
        const { focusedId, sessions } = sessionStore.getState()
        if (focusedId) {
          const session = sessions.get(focusedId)
          if (session && !session.isPinned) {
            const pan = getCurrentPan()
            const z = getCurrentZoom()
            sessionStore.getState().togglePin(focusedId, {
              x: session.position.x * z + pan.x,
              y: session.position.y * z + pan.y,
            })
          } else {
            sessionStore.getState().togglePin(focusedId)
          }
        }
      },
    },
    {
      id: 'action:shortcuts-help',
      title: 'Show Keyboard Shortcuts',
      category: 'Help',
      icon: '?',
      action: () => shortcutsOverlayStore.getState().open(),
    },
    {
      id: 'action:add-bookmark',
      title: 'Add Bookmark at Current View',
      category: 'Presentation',
      icon: 'B',
      action: () => {
        const pan = getCurrentPan()
        const zoom = getCurrentZoom()
        const count = presentationStore.getState().bookmarks.length
        presentationStore.getState().addBookmark({
          name: `Slide ${count + 1}`,
          panX: pan.x,
          panY: pan.y,
          zoom,
        })
      },
    },
    {
      id: 'action:start-presentation',
      title: 'Start Presentation Mode',
      category: 'Presentation',
      icon: 'P',
      action: () => presentationStore.getState().startPresentation(),
    },
    {
      id: 'action:clear-bookmarks',
      title: 'Clear All Bookmarks',
      category: 'Presentation',
      icon: 'X',
      action: () => {
        const { bookmarks } = presentationStore.getState()
        bookmarks.forEach((b) => presentationStore.getState().removeBookmark(b.id))
      },
    },
  ]
}

/**
 * Build file items from a directory listing.
 */
export function buildFileItems(
  files: Array<{ name: string; isDirectory: boolean; path: string }>
): PaletteItem[] {
  return files
    .filter((f) => !f.isDirectory)
    .map((f) => ({
      id: `file:${f.path}`,
      title: f.name,
      category: 'File',
      icon: '#',
      action: () => createFileViewerSession(f.path),
    }))
}

/**
 * Simple fuzzy match: checks if all characters in the pattern appear in order
 * within the text (case-insensitive). Returns a score (lower = better match)
 * or -1 for no match.
 */
export function fuzzyMatch(text: string, pattern: string): number {
  if (pattern.length === 0) return 0

  const lowerText = text.toLowerCase()
  const lowerPattern = pattern.toLowerCase()

  let patternIdx = 0
  let score = 0
  let lastMatchIdx = -1

  for (let i = 0; i < lowerText.length && patternIdx < lowerPattern.length; i++) {
    if (lowerText[i] === lowerPattern[patternIdx]) {
      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        score += 0
      } else {
        score += i - (lastMatchIdx + 1)
      }
      lastMatchIdx = i
      patternIdx++
    }
  }

  // All pattern characters were found
  if (patternIdx === lowerPattern.length) {
    return score
  }

  return -1
}

/**
 * Get all palette items: sessions first, then actions.
 */
export function getAllItems(): PaletteItem[] {
  return [...getSessionItems(), ...getActionItems()]
}

/**
 * Filter and rank items by fuzzy match against a query.
 */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  if (query.length === 0) return items

  const scored = items
    .map((item) => {
      // Match against title and category
      const titleScore = fuzzyMatch(item.title, query)
      const catScore = fuzzyMatch(item.category, query)
      const bestScore = titleScore >= 0 && catScore >= 0
        ? Math.min(titleScore, catScore)
        : titleScore >= 0
          ? titleScore
          : catScore
      return { item, score: bestScore }
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score)

  return scored.map(({ item }) => item)
}
