import { useEffect, useRef, useCallback } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { canvasStore } from '../stores/canvasStore'
import { gridStore } from '../stores/gridStore'
import type { Layout } from '../../preload/types'

function serializeCurrentLayout(name: string): Layout {
  const { sessions } = sessionStore.getState()
  const { panX, panY, zoom } = canvasStore.getState()
  const { gridSize } = gridStore.getState()

  return {
    name,
    sessions: Array.from(sessions.values()).map((s) => ({
      type: s.type,
      title: s.title,
      cwd: s.type === 'terminal' ? s.cwd : '',
      position: { x: s.position.x, y: s.position.y },
      size: {
        width: s.size.width,
        height: s.size.height,
        cols: s.size.cols,
        rows: s.size.rows,
      },
    })),
    viewport: { panX, panY, zoom },
    gridSize,
  }
}

export { serializeCurrentLayout }

export function useLayoutAutoSave(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubSession = sessionStore.subscribe(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const layout = serializeCurrentLayout('__default__')
        window.smokeAPI?.layout.save('__default__', layout)
      }, 2000)
    })

    const unsubCanvas = canvasStore.subscribe(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const layout = serializeCurrentLayout('__default__')
        window.smokeAPI?.layout.save('__default__', layout)
      }, 2000)
    })

    return () => {
      unsubSession()
      unsubCanvas()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])
}

export function useLayoutRestore(): {
  restoreDefault: () => Promise<void>
  loadLayout: (name: string) => Promise<void>
} {
  const restoreLayout = useCallback(async (layout: Layout) => {
    // Close all existing sessions
    const { sessions } = sessionStore.getState()
    for (const session of sessions.values()) {
      if (session.type === 'terminal') {
        window.smokeAPI?.pty.kill(session.id)
      }
      sessionStore.getState().removeSession(session.id)
    }

    // Restore viewport
    canvasStore.getState().setPan(layout.viewport.panX, layout.viewport.panY)
    canvasStore.getState().setZoom(layout.viewport.zoom)
    gridStore.getState().setGridSize(layout.gridSize)

    // Create sessions from layout
    for (const saved of layout.sessions) {
      const elementType = saved.type ?? 'terminal'
      switch (elementType) {
        case 'terminal': {
          const cwd = saved.cwd
          const session = sessionStore.getState().createSession(cwd, saved.position)
          sessionStore.getState().updateSession(session.id, {
            title: saved.title,
            size: saved.size,
          })
          // Spawn PTY — gracefully fall back if cwd doesn't exist
          window.smokeAPI?.pty.spawn({
            id: session.id,
            cwd,
            cols: saved.size.cols,
            rows: saved.size.rows,
          })
          break
        }
      }
    }
  }, [])

  const restoreDefault = useCallback(async () => {
    const layout = await window.smokeAPI?.layout.load('__default__')
    if (layout) {
      await restoreLayout(layout)
    }
  }, [restoreLayout])

  const loadLayout = useCallback(async (name: string) => {
    const layout = await window.smokeAPI?.layout.load(name)
    if (layout) {
      await restoreLayout(layout)
    }
  }, [restoreLayout])

  return { restoreDefault, loadLayout }
}
