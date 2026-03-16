import { useCallback, useState } from 'react'
import { getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  useSelectedIds,
  type PluginSession,
} from '../stores/sessionStore'
import { useFocusModeActiveIds } from '../stores/focusModeStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from '../fileviewer/useFileViewerResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import PluginSandbox from './PluginSandbox'
import type { PluginManifest, PluginError } from './pluginTypes'
import type { PluginWindowProps } from './pluginElementRegistry'
import '../styles/plugin.css'

export default function PluginWindow({
  session,
  zoom,
  gridSize,
}: PluginWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const selectedIds = useSelectedIds()
  const focusModeActiveIds = useFocusModeActiveIds()
  const [pluginStatus, setPluginStatus] = useState<'running' | 'exited'>('running')

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id
  const isSelected = selectedIds.has(session.id)
  const isDimmedByFocusMode =
    focusModeActiveIds !== null && !focusModeActiveIds.has(session.id)

  const { onDragStart } = useWindowDrag({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const { onResizeStart } = useFileViewerResize({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isMod = e.metaKey || e.ctrlKey || e.shiftKey
      if (isMod) {
        e.stopPropagation()
        sessionStore.getState().toggleSelectSession(session.id)
        return
      }
      if (selectedIds.has(session.id) && selectedIds.size > 1) {
        sessionStore.getState().bringToFront(session.id)
        sessionStore.getState().focusSession(session.id)
        return
      }
      sessionStore.getState().clearSelection()
      sessionStore.getState().bringToFront(session.id)
      sessionStore.getState().focusSession(session.id)
    },
    [session.id, selectedIds]
  )

  const handleTitleChange = useCallback(
    (title: string) => {
      sessionStore.getState().updateSession(session.id, { title })
    },
    [session.id]
  )

  const handleClose = useCallback(() => {
    closeSession(session.id)
  }, [session.id])

  const handleToggleLock = useCallback(() => {
    sessionStore.getState().toggleLock(session.id)
  }, [session.id])

  const handleTogglePin = useCallback(() => {
    if (!session.isPinned) {
      const pan = getCurrentPan()
      const z = getCurrentZoom()
      sessionStore.getState().togglePin(session.id, {
        x: session.position.x * z + pan.x,
        y: session.position.y * z + pan.y,
      })
    } else {
      sessionStore.getState().togglePin(session.id)
    }
  }, [session.id, session.isPinned, session.position.x, session.position.y])

  const handlePluginTitleChange = useCallback(
    (title: string) => {
      sessionStore.getState().updateSession(session.id, { title })
    },
    [session.id]
  )

  const handlePluginResizeRequest = useCallback(
    (width: number, height: number) => {
      sessionStore.getState().updateSession(session.id, {
        size: {
          ...session.size,
          width,
          height,
        },
      })
    },
    [session.id, session.size]
  )

  const handlePluginError = useCallback(
    (error: PluginError) => {
      console.error(`Plugin ${session.pluginId} error:`, error)
      setPluginStatus('exited')
    },
    [session.pluginId]
  )

  const handlePluginMessage = useCallback(
    (type: string, payload: unknown) => {
      // Store plugin messages as pluginData for persistence
      if (type === 'state') {
        sessionStore.getState().updateSession(session.id, {
          pluginData: payload as Record<string, unknown>,
        })
      }
    },
    [session.id]
  )

  // Build a full PluginManifest from the session's partial manifest
  const sandboxManifest: PluginManifest = {
    name: session.pluginManifest.name,
    version: session.pluginManifest.version,
    entryPoint: session.pluginManifest.entryPoint,
    defaultSize: session.pluginManifest.defaultSize,
    description: '',
    author: '',
    permissions: [],
  }

  const classNames = [
    'terminal-window',
    'plugin-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
    isSelected && 'multi-selected',
    isDimmedByFocusMode && 'focus-mode-dimmed',
    session.locked && 'locked',
    session.isPinned && 'pinned',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classNames}
      data-session-id={session.id}
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height,
        zIndex: session.zIndex,
      }}
      onPointerDown={handlePointerDown}
    >
      <WindowChrome
        title={session.title}
        status={pluginStatus}
        isLocked={session.locked}
        isPinned={session.isPinned}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
        onToggleLock={handleToggleLock}
        onTogglePin={handleTogglePin}
      />
      <div
        className="plugin-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <PluginSandbox
          sessionId={session.id}
          manifest={sandboxManifest}
          source={session.pluginSource}
          width={session.size.width}
          height={session.size.height - CHROME_HEIGHT}
          onTitleChange={handlePluginTitleChange}
          onResizeRequest={handlePluginResizeRequest}
          onError={handlePluginError}
          onPluginMessage={handlePluginMessage}
        />
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
