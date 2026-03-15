import { useEffect } from 'react'
import { resolveShortcut, getSortedSessionIds, type ShortcutAction } from './shortcutMap'
import { sessionStore } from '../stores/sessionStore'
import { aiStore } from '../stores/aiStore'
import { findGroupByElementId, groupStore } from '../stores/groupStore'
import { createNewSession } from '../session/useSessionCreation'
import { closeSession } from '../session/useSessionClose'
import { panToSession } from '../sidebar/useSidebarSync'
import { setZoomTo, zoomIn, zoomOut } from '../canvas/useCanvasControls'
import { serializeCurrentLayout } from '../layout/useLayoutPersistence'

function executeShortcut(action: ShortcutAction): void {
  const state = sessionStore.getState()

  switch (action) {
    case 'newSession':
      createNewSession()
      break

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
      // Settings panel not yet implemented — shortcut reserved
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
