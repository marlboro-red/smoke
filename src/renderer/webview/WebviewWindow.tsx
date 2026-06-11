import React, { useCallback, useRef, useState, useEffect } from 'react'
import { getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import {
  sessionStore,
  useIsFocused,
  useIsHighlighted,
  useIsSelected,
  type WebviewSession,
} from '../stores/sessionStore'
import { useIsDimmedByFocusMode } from '../stores/focusModeStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useWebviewResize } from './useWebviewResize'
import { CHROME_HEIGHT } from '../window/useSnapping'
import { closeSession } from '../session/useSessionClose'
import WindowChrome from '../window/WindowChrome'
import ResizeHandle from '../window/ResizeHandle'
import { isAllowedUrl, normalizeUrl } from './urlValidation'
import '../styles/webview.css'

const NAV_BAR_HEIGHT = 32

interface WebviewWindowProps {
  session: WebviewSession
  zoom: () => number
  gridSize: number
}

export default React.memo(function WebviewWindow({
  session,
  zoom,
  gridSize,
}: WebviewWindowProps): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  // The webview src attribute is intentionally uncontrolled: it holds the
  // initial URL only. Re-assigning src on every store update would force a
  // full page reload on each navigation/SPA route change (the did-navigate
  // handler writes the new URL back to the store, which would loop).
  const initialUrlRef = useRef(session.url)
  const [urlInput, setUrlInput] = useState(session.url)
  const [isLoading, setIsLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const isFocused = useIsFocused(session.id)
  const isHighlighted = useIsHighlighted(session.id)
  const isDimmedByFocusMode = useIsDimmedByFocusMode(session.id)
  const isSelected = useIsSelected(session.id)

  const { onDragStart } = useWindowDrag({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const { onResizeStart } = useWebviewResize({
    sessionId: session.id,
    zoom,
    gridSize,
  })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const isMod = e.metaKey || e.ctrlKey || e.shiftKey
    if (isMod) {
      e.stopPropagation()
      sessionStore.getState().toggleSelectSession(session.id)
      return
    }
    const { selectedIds } = sessionStore.getState()
    if (selectedIds.has(session.id) && selectedIds.size > 1) {
      sessionStore.getState().bringToFront(session.id)
      sessionStore.getState().focusSession(session.id)
      return
    }
    sessionStore.getState().clearSelection()
    sessionStore.getState().bringToFront(session.id)
    sessionStore.getState().focusSession(session.id)
  }, [session.id])

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

  const navigateTo = useCallback(
    (rawUrl: string) => {
      const url = normalizeUrl(rawUrl)
      if (!url) return

      if (!isAllowedUrl(url)) {
        setUrlError('Only http:// and https:// URLs are allowed')
        return
      }

      setUrlError(null)
      setUrlInput(url)
      sessionStore.getState().updateSession(session.id, { url, title: url })

      const wv = webviewRef.current
      if (wv) {
        wv.src = url
      }
    },
    [session.id]
  )

  const handleUrlSubmit = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        navigateTo(urlInput)
      }
    },
    [urlInput, navigateTo]
  )

  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload()
  }, [])

  const handleGoBack = useCallback(() => {
    webviewRef.current?.goBack()
  }, [])

  const handleGoForward = useCallback(() => {
    webviewRef.current?.goForward()
  }, [])

  // Attach webview event listeners
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onDidNavigate = (): void => {
      const currentUrl = wv.getURL()
      setUrlInput(currentUrl)
      setIsLoading(false)
      sessionStore.getState().updateSession(session.id, {
        url: currentUrl,
        title: wv.getTitle() || currentUrl,
        canGoBack: wv.canGoBack(),
        canGoForward: wv.canGoForward(),
      })
    }

    const onDidStartLoading = (): void => {
      setIsLoading(true)
    }

    const onDidStopLoading = (): void => {
      setIsLoading(false)
      if (wv.getTitle()) {
        sessionStore.getState().updateSession(session.id, {
          title: wv.getTitle(),
          canGoBack: wv.canGoBack(),
          canGoForward: wv.canGoForward(),
        })
      }
    }

    // Navigation/popup blocking is enforced in the main process
    // (web-contents-created + will-attach-webview in src/main/index.ts).
    // The renderer-side will-navigate listener only surfaces feedback —
    // preventDefault here is a no-op, and the 'new-window' webview event
    // no longer exists in modern Electron.
    const onWillNavigate = (e: Electron.WillNavigateEvent): void => {
      if (!isAllowedUrl(e.url)) {
        setUrlError('Blocked: only http:// and https:// URLs are allowed')
      }
    }

    wv.addEventListener('did-navigate', onDidNavigate)
    wv.addEventListener('did-navigate-in-page', onDidNavigate)
    wv.addEventListener('did-start-loading', onDidStartLoading)
    wv.addEventListener('did-stop-loading', onDidStopLoading)
    wv.addEventListener('will-navigate', onWillNavigate as EventListener)

    return () => {
      wv.removeEventListener('did-navigate', onDidNavigate)
      wv.removeEventListener('did-navigate-in-page', onDidNavigate)
      wv.removeEventListener('did-start-loading', onDidStartLoading)
      wv.removeEventListener('did-stop-loading', onDidStopLoading)
      wv.removeEventListener('will-navigate', onWillNavigate as EventListener)
    }
  }, [session.id])

  const classNames = [
    'terminal-window',
    'webview-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
    isDimmedByFocusMode && 'focus-mode-dimmed',
    isSelected && 'multi-selected',
    session.locked && 'locked',
    session.isPinned && 'pinned',
  ]
    .filter(Boolean)
    .join(' ')

  const bodyHeight = `calc(100% - ${CHROME_HEIGHT + NAV_BAR_HEIGHT}px)`

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
        status="running"
        isLocked={session.locked}
        isPinned={session.isPinned}
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
        onToggleLock={handleToggleLock}
        onTogglePin={handleTogglePin}
      />
      <div className="webview-nav-bar" style={{ height: NAV_BAR_HEIGHT }}>
        <button
          className="webview-nav-btn"
          onClick={handleGoBack}
          disabled={!session.canGoBack}
          title="Back"
        >
          &#8592;
        </button>
        <button
          className="webview-nav-btn"
          onClick={handleGoForward}
          disabled={!session.canGoForward}
          title="Forward"
        >
          &#8594;
        </button>
        <button
          className="webview-nav-btn"
          onClick={handleRefresh}
          title="Refresh"
        >
          {isLoading ? '\u25A0' : '\u21BB'}
        </button>
        <input
          className={`webview-url-input ${urlError ? 'webview-url-error' : ''}`}
          value={urlInput}
          onChange={(e) => {
            setUrlInput(e.target.value)
            setUrlError(null)
          }}
          onKeyDown={handleUrlSubmit}
          placeholder="https://example.com"
          spellCheck={false}
          title={urlError || undefined}
        />
      </div>
      <div className="webview-body" style={{ height: bodyHeight }}>
        {/* No allowpopups attribute: it is a boolean attribute, so even
            allowpopups="false" would ENABLE popups. */}
        <webview
          ref={webviewRef as React.Ref<Electron.WebviewTag>}
          src={initialUrlRef.current}
          className="webview-frame"
        />
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
})
