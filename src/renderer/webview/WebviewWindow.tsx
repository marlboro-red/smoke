import { useCallback, useRef, useState, useEffect } from 'react'
import {
  sessionStore,
  useFocusedId,
  useHighlightedId,
  useSelectedIds,
  type WebviewSession,
} from '../stores/sessionStore'
import { useFocusModeActiveIds } from '../stores/focusModeStore'
import { useWindowDrag } from '../window/useWindowDrag'
import { useFileViewerResize } from '../fileviewer/useFileViewerResize'
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

export default function WebviewWindow({
  session,
  zoom,
  gridSize,
}: WebviewWindowProps): JSX.Element {
  const focusedId = useFocusedId()
  const highlightedId = useHighlightedId()
  const selectedIds = useSelectedIds()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [urlInput, setUrlInput] = useState(session.url)
  const [isLoading, setIsLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const focusModeActiveIds = useFocusModeActiveIds()

  const isFocused = focusedId === session.id
  const isHighlighted = highlightedId === session.id
  const isDimmedByFocusMode = focusModeActiveIds !== null && !focusModeActiveIds.has(session.id)
  const isSelected = selectedIds.has(session.id)

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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
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
  }, [session.id, selectedIds])

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

  const navigateTo = useCallback(
    (rawUrl: string) => {
      const url = normalizeUrl(rawUrl)
      if (!url) return

      if (!isAllowedUrl(url)) {
        setUrlError('Only localhost URLs are allowed')
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

    const onWillNavigate = (e: Electron.WillNavigateEvent): void => {
      if (!isAllowedUrl(e.url)) {
        e.preventDefault()
        setUrlError('Blocked: only localhost URLs are allowed')
      }
    }

    const onNewWindow = (e: Electron.NewWindowEvent): void => {
      e.preventDefault()
      // Navigate in the same webview if it's an allowed URL, otherwise block
      if (isAllowedUrl(e.url)) {
        navigateTo(e.url)
      } else {
        setUrlError('Blocked: only localhost URLs are allowed')
      }
    }

    wv.addEventListener('did-navigate', onDidNavigate)
    wv.addEventListener('did-navigate-in-page', onDidNavigate)
    wv.addEventListener('did-start-loading', onDidStartLoading)
    wv.addEventListener('did-stop-loading', onDidStopLoading)
    wv.addEventListener('will-navigate', onWillNavigate as EventListener)
    wv.addEventListener('new-window', onNewWindow as EventListener)

    return () => {
      wv.removeEventListener('did-navigate', onDidNavigate)
      wv.removeEventListener('did-navigate-in-page', onDidNavigate)
      wv.removeEventListener('did-start-loading', onDidStartLoading)
      wv.removeEventListener('did-stop-loading', onDidStopLoading)
      wv.removeEventListener('will-navigate', onWillNavigate as EventListener)
      wv.removeEventListener('new-window', onNewWindow as EventListener)
    }
  }, [session.id, navigateTo])

  const classNames = [
    'terminal-window',
    'webview-window',
    isFocused && 'focused',
    isHighlighted && 'highlighted',
    isDimmedByFocusMode && 'focus-mode-dimmed',
    isSelected && 'multi-selected',
    session.locked && 'locked',
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
        onTitleChange={handleTitleChange}
        onClose={handleClose}
        onDragStart={onDragStart}
        onToggleLock={handleToggleLock}
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
          placeholder="http://localhost:3000"
          spellCheck={false}
          title={urlError || undefined}
        />
      </div>
      <div className="webview-body" style={{ height: bodyHeight }}>
        <webview
          ref={webviewRef as React.Ref<Electron.WebviewTag>}
          src={session.url}
          className="webview-frame"
          /* @ts-expect-error -- Electron webview attributes not in React typings */
          allowpopups="false"
        />
      </div>
      <ResizeHandle direction="e" onResizeStart={onResizeStart} />
      <ResizeHandle direction="s" onResizeStart={onResizeStart} />
      <ResizeHandle direction="se" onResizeStart={onResizeStart} />
    </div>
  )
}
