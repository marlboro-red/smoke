import React, { useRef, useCallback, useMemo } from 'react'
import { useCanvasControls, getCurrentPan, getCurrentZoom } from './useCanvasControls'
import { useRubberBandSelect } from './useRubberBandSelect'
import { useViewportCulling } from './useViewportCulling'
import { useSessionList, sessionStore } from '../stores/sessionStore'
import type { Session, TerminalSession, FileViewerSession } from '../stores/sessionStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useGridStore } from '../stores/gridStore'
import { useSnapshot } from '../stores/snapshotStore'
import { useGroupList } from '../stores/groupStore'
import { useRegionList } from '../stores/regionStore'
import { createNewSession } from '../session/useSessionCreation'
import Grid from './Grid'
import ConnectorLayer from './ConnectorLayer'
import GroupContainer from './GroupContainer'
import RegionShape from './RegionShape'
import TerminalWindow from '../terminal/TerminalWindow'
import TerminalThumbnail from '../terminal/TerminalThumbnail'
import FileViewerWindow from '../fileviewer/FileViewerWindow'
import FileViewerThumbnail from '../fileviewer/FileViewerThumbnail'
import NoteWindow from '../note/NoteWindow'
import NoteThumbnail from '../note/NoteThumbnail'
import WebviewWindow from '../webview/WebviewWindow'
import WebviewThumbnail from '../webview/WebviewThumbnail'
import ImageWindow from '../image/ImageWindow'
import ImageThumbnail from '../image/ImageThumbnail'
import SnippetWindow from '../snippet/SnippetWindow'
import SnippetThumbnail from '../snippet/SnippetThumbnail'
import GroupCollapsedCard from './GroupCollapsedCard'
import DirectoryClusterCard from './DirectoryClusterCard'
import SnapPreview from './SnapPreview'
import Minimap from './Minimap'
import AlignmentToolbar from './AlignmentToolbar'
import { useFileWatchManager } from '../fileviewer/useFileWatcher'
import { useGraphInvalidation } from '../depgraph/useGraphInvalidation'
import { useDirectoryClusters } from './useDirectoryClusters'
import { useConnectorList } from '../stores/connectorStore'
import { useSuggestionEngine } from '../suggestions/useSuggestionEngine'
import { useSuggestions } from '../stores/suggestionStore'
import GhostSuggestion from '../suggestions/GhostSuggestion'
import { getPluginElementRegistration, isPluginElementType } from '../plugin/pluginElementRegistry'
import ComponentErrorBoundary from '../errors/ComponentErrorBoundary'
import type { PluginSession as PluginSessionType } from '../stores/sessionStore'
import '../styles/canvas.css'

function ThumbnailRenderer({ session }: { session: TerminalSession }): JSX.Element {
  const textSnapshot = useSnapshot(session.id)
  return <TerminalThumbnail session={session} textSnapshot={textSnapshot} />
}

interface SessionElementProps {
  session: Session
  isVisible: boolean
  isThumbnailMode: boolean
  getZoom: () => number
  gridSize: number
}

const SessionElement = React.memo(function SessionElement({
  session,
  isVisible,
  isThumbnailMode,
  getZoom,
  gridSize,
}: SessionElementProps): JSX.Element | null {
  let element: React.ReactNode = null

  switch (session.type) {
    case 'terminal':
      if (isThumbnailMode && !session.isPinned) {
        element = isVisible ? <ThumbnailRenderer session={session} /> : null
      } else {
        element = (
          <TerminalWindow
            session={session}
            zoom={getZoom}
            gridSize={gridSize}
            hidden={!isVisible}
          />
        )
      }
      break
    case 'file': {
      const fileSession = session as FileViewerSession
      // When editing, keep mounted but hidden (like terminals) to preserve
      // CodeMirror state (cursor, undo history) across viewport culling.
      if (!isVisible && !fileSession.editing) return null
      element = (
        <>
          <FileViewerThumbnail
            session={session}
            className={isThumbnailMode && !session.isPinned ? 'file-crossfade file-crossfade-active' : 'file-crossfade file-crossfade-inactive'}
          />
          <FileViewerWindow
            session={fileSession}
            zoom={getZoom}
            gridSize={gridSize}
            hidden={!isVisible}
            className={isThumbnailMode && !session.isPinned ? 'file-crossfade file-crossfade-inactive' : 'file-crossfade file-crossfade-active'}
          />
        </>
      )
      break
    }
    case 'note':
      if (!isVisible) return null
      if (isThumbnailMode && !session.isPinned) {
        element = <NoteThumbnail session={session} />
      } else {
        element = (
          <NoteWindow
            session={session}
            zoom={getZoom}
            gridSize={gridSize}
          />
        )
      }
      break
    case 'webview':
      if (!isVisible) return null
      if (isThumbnailMode && !session.isPinned) {
        element = <WebviewThumbnail session={session} />
      } else {
        element = (
          <WebviewWindow
            session={session}
            zoom={getZoom}
            gridSize={gridSize}
          />
        )
      }
      break
    case 'image':
      if (!isVisible) return null
      if (isThumbnailMode && !session.isPinned) {
        element = <ImageThumbnail session={session} />
      } else {
        element = (
          <ImageWindow
            session={session}
            zoom={getZoom}
            gridSize={gridSize}
          />
        )
      }
      break
    case 'snippet':
      if (!isVisible) return null
      if (isThumbnailMode && !session.isPinned) {
        element = <SnippetThumbnail session={session} />
      } else {
        element = (
          <SnippetWindow
            session={session}
            zoom={getZoom}
            gridSize={gridSize}
          />
        )
      }
      break
    default: {
      if (isPluginElementType(session.type)) {
        const reg = getPluginElementRegistration(session.type)
        if (!reg) return null
        const pluginSession = session as PluginSessionType
        if (!isVisible) return null
        if (isThumbnailMode && !session.isPinned) {
          const Thumb = reg.ThumbnailComponent
          element = <Thumb session={pluginSession} />
        } else {
          const Win = reg.WindowComponent
          element = (
            <Win
              session={pluginSession}
              zoom={getZoom}
              gridSize={gridSize}
            />
          )
        }
      }
      break
    }
  }

  if (!element) return null

  return (
    <ComponentErrorBoundary name={`${session.type} session`}>
      {element}
    </ComponentErrorBoundary>
  )
})

/**
 * Compute the viewport (screen) position for a pinned element.
 * If the session has a saved pinnedViewportPos, use that;
 * otherwise derive it from the current canvas→screen transform.
 */
function getPinnedScreenPos(session: Session): { x: number; y: number } {
  if (session.pinnedViewportPos) {
    return session.pinnedViewportPos
  }
  const pan = getCurrentPan()
  const zoom = getCurrentZoom()
  return {
    x: session.position.x * zoom + pan.x,
    y: session.position.y * zoom + pan.y,
  }
}

export default function Canvas({ readOnly = false }: { readOnly?: boolean }): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const { rootRef, panRef, zoomRef } = useCanvasControls(viewportRef)
  const sessions = useSessionList()
  const groups = useGroupList()
  const regions = useRegionList()
  const storeZoom = useCanvasStore((s) => s.zoom)
  const gridSize = useGridStore((s) => s.gridSize)
  const showGrid = useGridStore((s) => s.showGrid)
  const isResnapping = useGridStore((s) => s.isResnapping)

  useRubberBandSelect(rootRef, panRef, zoomRef)

  const connectors = useConnectorList()

  const { visibleIds, isThumbnailMode, isClusterMode } = useViewportCulling(
    panRef,
    zoomRef,
    rootRef
  )

  const directoryClusters = useDirectoryClusters(sessions, connectors, isClusterMode)

  // Build set of session IDs that are hidden because they belong to a directory cluster
  const clusteredSessionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const cluster of directoryClusters) {
      for (const memberId of cluster.memberIds) {
        ids.add(memberId)
      }
    }
    return ids
  }, [directoryClusters])

  useFileWatchManager(visibleIds)
  useGraphInvalidation(visibleIds)
  useSuggestionEngine()
  const suggestions = useSuggestions()

  // Build set of session IDs hidden by collapsed groups
  const collapsedMemberIds = useMemo(() => {
    const hidden = new Set<string>()
    for (const group of groups) {
      if (group.collapsed) {
        for (const memberId of group.memberIds) {
          hidden.add(memberId)
        }
      }
    }
    return hidden
  }, [groups])

  const collapsedGroups = useMemo(
    () => groups.filter((g) => g.collapsed && g.memberIds.length > 0),
    [groups]
  )

  const getZoom = useCallback(() => zoomRef.current, [zoomRef])

  const renderSessionElement = useCallback(
    (session: Session, isVisible: boolean) => (
      <SessionElement
        key={session.id}
        session={session}
        isVisible={isVisible}
        isThumbnailMode={isThumbnailMode}
        getZoom={getZoom}
        gridSize={gridSize}
      />
    ),
    [isThumbnailMode, getZoom, gridSize]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      // Only on empty canvas, not on terminal windows or regions
      if ((e.target as HTMLElement).closest('.terminal-window')) return
      if ((e.target as HTMLElement).closest('.region-shape')) return
      if ((e.target as HTMLElement).closest('.directory-cluster-card')) return

      const root = rootRef.current
      if (!root) return

      // Convert screen -> canvas coordinates
      const rect = root.getBoundingClientRect()
      const canvasX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
      const canvasY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current

      createNewSession({ x: canvasX, y: canvasY })
    },
    [rootRef, panRef, zoomRef, readOnly]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      // Only unfocus when clicking empty canvas, not terminal windows
      if ((e.target as HTMLElement).closest('.terminal-window')) return
      sessionStore.getState().focusSession(null)
      sessionStore.getState().clearSelection()
    },
    [readOnly]
  )

  // Separate pinned and unpinned sessions
  const { pinnedSessions, unpinnedSessions } = useMemo(() => {
    const pinned: Session[] = []
    const unpinned: Session[] = []
    for (const session of sessions) {
      if (session.isPinned) {
        pinned.push(session)
      } else {
        unpinned.push(session)
      }
    }
    return { pinnedSessions: pinned, unpinnedSessions: unpinned }
  }, [sessions])

  return (
    <div
      className="canvas-root"
      ref={rootRef}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
    >
      <AlignmentToolbar />
      <div className={`canvas-viewport${isResnapping ? ' grid-resnapping' : ''}`} ref={viewportRef}>
        {showGrid && <Grid zoom={storeZoom} gridSize={gridSize} />}
        <SnapPreview />
        <ConnectorLayer />
        {regions.map((region) => (
          <RegionShape key={region.id} region={region} zoom={getZoom} gridSize={gridSize} />
        ))}
        {groups.map((group) => (
          <GroupContainer key={group.id} group={group} />
        ))}
        {unpinnedSessions.map((session) => {
          if (collapsedMemberIds.has(session.id)) return null
          if (clusteredSessionIds.has(session.id)) return null
          const isVis = visibleIds.has(session.id)
          return renderSessionElement(session, isVis)
        })}
        {directoryClusters.map((cluster) => (
          <DirectoryClusterCard key={cluster.id} cluster={cluster} />
        ))}
        {collapsedGroups.map((group) => (
          <GroupCollapsedCard key={group.id} group={group} />
        ))}
        {suggestions.map((suggestion) => (
          <GhostSuggestion key={suggestion.id} suggestion={suggestion} />
        ))}
      </div>
      {/* Pinned elements layer — rendered outside the canvas viewport transform */}
      {pinnedSessions.length > 0 && (
        <div className="pinned-layer">
          {pinnedSessions.map((session) => {
            const screenPos = getPinnedScreenPos(session)
            return (
              <div
                key={session.id}
                className="pinned-element-wrapper"
                style={{
                  position: 'absolute',
                  left: screenPos.x,
                  top: screenPos.y,
                  width: session.size.width,
                  height: session.size.height,
                  zIndex: session.zIndex,
                }}
              >
                {renderSessionElement(session, true)}
              </div>
            )
          })}
        </div>
      )}
      <Minimap />
    </div>
  )
}
