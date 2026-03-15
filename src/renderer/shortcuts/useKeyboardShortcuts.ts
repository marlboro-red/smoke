import { useEffect } from 'react'
import { resolveShortcut, getSortedSessionIds, type ShortcutAction } from './shortcutMap'
import { sessionStore } from '../stores/sessionStore'
import { splitPaneStore } from '../stores/splitPaneStore'
import { aiStore } from '../stores/aiStore'
import { findGroupByElementId, groupStore } from '../stores/groupStore'
import { createNewSession, createTerminalAtFileDir, duplicateSession } from '../session/useSessionCreation'
import { closeSession, closeSplitPane } from '../session/useSessionClose'
import { panToSession } from '../sidebar/useSidebarSync'
import { setZoomTo, zoomIn, zoomOut, getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import { serializeCurrentLayout } from '../layout/useLayoutPersistence'
import { settingsModalStore } from '../config/settingsStore'
import { shortcutsOverlayStore } from './shortcutsOverlayStore'
import { commandPaletteStore } from '../palette/commandPaletteStore'
import { canvasSearchStore } from '../search/searchStore'
import { performAutoLayout } from '../layout/autoLayout'
import { presentationStore } from '../presentation/presentationStore'
import { exportCanvasPng } from '../canvas/exportCanvas'
import { buildDepGraph } from '../depgraph/buildDepGraph'
import { goToLineStore } from '../fileviewer/goToLineStore'
import type { FileViewerSession } from '../stores/sessionStore'
import { preferencesStore } from '../stores/preferencesStore'

function executeShortcut(action: ShortcutAction): void {
  const state = sessionStore.getState()

  switch (action) {
    case 'newSession':
      createNewSession()
      break

    case 'newSnippet': {
      const session = sessionStore.getState().createSnippetSession()
      sessionStore.getState().focusSession(session.id)
      break
    }

    case 'closeSession': {
      if (state.focusedId) {
        closeSession(state.focusedId)
      }
      break
    }

    case 'cycleNextSession':
    case 'cyclePrevSession': {
      const sorted = getSortedSessionIds(state.sessions)
      if (sorted.length === 0) break
      const currentIdx = state.focusedId ? sorted.indexOf(state.focusedId) : -1
      let nextIdx: number
      if (action === 'cycleNextSession') {
        nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % sorted.length
      } else {
        nextIdx =
          currentIdx < 0
            ? sorted.length - 1
            : (currentIdx - 1 + sorted.length) % sorted.length
      }
      panToSession(sorted[nextIdx])
      break
    }

    case 'focusSession1':
    case 'focusSession2':
    case 'focusSession3':
    case 'focusSession4':
    case 'focusSession5':
    case 'focusSession6':
    case 'focusSession7':
    case 'focusSession8':
    case 'focusSession9': {
      const idx = parseInt(action.replace('focusSession', ''), 10) - 1
      const sorted = getSortedSessionIds(state.sessions)
      if (idx < sorted.length) {
        panToSession(sorted[idx])
      }
      break
    }

    case 'resetZoom':
      setZoomTo(1.0)
      break

    case 'zoomIn':
      zoomIn()
      break

    case 'zoomOut':
      zoomOut()
      break

    case 'saveLayout': {
      const layout = serializeCurrentLayout('__default__')
      window.smokeAPI?.layout.save('__default__', layout)
      break
    }

    case 'openSettings':
      settingsModalStore.getState().toggle()
      break

    case 'toggleAiPanel':
      aiStore.getState().togglePanel()
      break

    case 'toggleGroupCollapse': {
      if (state.focusedId) {
        const group = findGroupByElementId(state.focusedId)
        if (group) {
          groupStore.getState().toggleCollapsed(group.id)
        }
      }
      break
    }

    case 'toggleBroadcast': {
      if (state.focusedId) {
        const group = findGroupByElementId(state.focusedId)
        if (group) {
          sessionStore.getState().toggleBroadcast(group.id)
        }
      }
      break
    }

    case 'autoLayout':
      performAutoLayout()
      break

    case 'canvasSearch':
      canvasSearchStore.getState().toggle()
      break

    case 'saveBookmark': {
      const name = prompt('Bookmark name:')
      if (name?.trim()) {
        const pan = getCurrentPan()
        const zoom = getCurrentZoom()
        window.smokeAPI?.bookmark.save(name.trim(), {
          name: name.trim(),
          panX: pan.x,
          panY: pan.y,
          zoom,
        })
      }
      break
    }

    case 'showShortcutsHelp':
      shortcutsOverlayStore.getState().toggle()
      break

    case 'commandPalette':
      commandPaletteStore.getState().toggle()
      break

    case 'exportCanvasPng':
      exportCanvasPng()
      break

    case 'showDepGraph': {
      if (state.focusedId) {
        const session = state.sessions.get(state.focusedId)
        if (session?.type === 'file') {
          buildDepGraph(session as FileViewerSession)
        }
      }
      break
    }

    case 'openTerminalHere': {
      if (state.focusedId) {
        const focused = state.sessions.get(state.focusedId)
        if (focused && focused.type === 'file') {
          createTerminalAtFileDir(focused)
        }
      }
      break
    }

    case 'toggleFileViewerEdit': {
      if (state.focusedId) {
        const session = state.sessions.get(state.focusedId)
        if (session?.type === 'file') {
          const fileSession = session as FileViewerSession
          sessionStore.getState().updateSession(state.focusedId, {
            editing: !fileSession.editing,
          })
        }
      }
      break
    }

    case 'goToLine': {
      if (state.focusedId) {
        const session = state.sessions.get(state.focusedId)
        if (session?.type === 'file') {
          goToLineStore.getState().open(state.focusedId)
        }
      }
      break
    }

    case 'addBookmark': {
      const pan = getCurrentPan()
      const zoom = getCurrentZoom()
      const count = presentationStore.getState().bookmarks.length
      presentationStore.getState().addBookmark({
        name: `Slide ${count + 1}`,
        panX: pan.x,
        panY: pan.y,
        zoom,
      })
      break
    }

    case 'startPresentation':
      presentationStore.getState().startPresentation()
      break

    case 'duplicateElement': {
      if (state.focusedId) {
        duplicateSession(state.focusedId)
      }
      break
    }

    case 'splitHorizontal':
    case 'splitVertical': {
      if (state.focusedId) {
        const session = state.sessions.get(state.focusedId)
        if (session?.type === 'terminal') {
          const direction = action === 'splitHorizontal' ? 'horizontal' : 'vertical'
          const newPaneId = splitPaneStore.getState().split(state.focusedId, direction)
          if (newPaneId) {
            const cwd = (session as { cwd: string }).cwd ||
              preferencesStore.getState().preferences.defaultCwd ||
              preferencesStore.getState().launchCwd || ''
            window.smokeAPI?.pty.spawn({ id: newPaneId, cwd })
          }
        }
      }
      break
    }

    case 'navigatePaneLeft':
    case 'navigatePaneRight':
    case 'navigatePaneUp':
    case 'navigatePaneDown': {
      if (state.focusedId) {
        const dirMap = {
          navigatePaneLeft: 'left' as const,
          navigatePaneRight: 'right' as const,
          navigatePaneUp: 'up' as const,
          navigatePaneDown: 'down' as const,
        }
        splitPaneStore.getState().navigate(state.focusedId, dirMap[action])
      }
      break
    }

    case 'closePane': {
      if (state.focusedId) {
        closeSplitPane(state.focusedId)
      }
      break
    }

    case 'escape':
      sessionStore.getState().focusSession(null)
      break
  }
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const action = resolveShortcut(e)
      if (!action) return

      e.preventDefault()
      executeShortcut(action)
    }

    // Capture phase intercepts before xterm.js bubble-phase handlers
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [])
}
