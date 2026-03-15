import { useEffect, useRef } from 'react'
import Canvas from './canvas/Canvas'
import Sidebar from './sidebar/Sidebar'
import AiChatPanel from './ai/AiChatPanel'
import { useLayoutAutoSave, useLayoutRestore } from './layout/useLayoutPersistence'
import { preferencesStore, usePreference } from './stores/preferencesStore'
import { useAiPanelOpen } from './stores/aiStore'
import { gridStore } from './stores/gridStore'
import { canvasStore } from './stores/canvasStore'
import { useKeyboardShortcuts } from './shortcuts/useKeyboardShortcuts'
import { useAiCanvasActions } from './ai/useAiCanvasActions'
import { useAiStream } from './ai/useAiStream'
import { useEventRecording } from './recording/useEventRecording'
import { useIsReplaying } from './replay/replayStore'
import ReplayControls from './replay/ReplayControls'

function App(): JSX.Element {
  useLayoutAutoSave()
  useKeyboardShortcuts()
  useAiCanvasActions()
  useAiStream()
  useEventRecording()
  const { restoreDefault } = useLayoutRestore()
  const restored = useRef(false)
  const sidebarPosition = usePreference('sidebarPosition')
  const aiPanelOpen = useAiPanelOpen()
  const isReplaying = useIsReplaying()

  useEffect(() => {
    if (!restored.current) {
      restored.current = true
      restoreDefault()
    }
  }, [restoreDefault])

  // Prevent Ctrl+scroll from triggering native Chromium zoom anywhere in the app
  useEffect(() => {
    const preventNativeZoom = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }
    document.addEventListener('wheel', preventNativeZoom, { passive: false })
    return () => document.removeEventListener('wheel', preventNativeZoom)
  }, [])

  // Load preferences and launch cwd on mount
  useEffect(() => {
    window.smokeAPI?.config.get().then((prefs) => {
      if (prefs) {
        preferencesStore.getState().setPreferences(prefs)
        gridStore.getState().setGridSize(prefs.gridSize)
        canvasStore.getState().setGridSize(prefs.gridSize)
      }
    })
    window.smokeAPI?.app.getLaunchCwd().then((cwd) => {
      if (cwd) {
        preferencesStore.getState().setLaunchCwd(cwd)
      }
    })
  }, [])

  return (
    <div className="app-layout" style={{ flexDirection: sidebarPosition === 'right' ? 'row-reverse' : 'row' }}>
      {!isReplaying && <Sidebar />}
      <Canvas readOnly={isReplaying} />
      {aiPanelOpen && !isReplaying && <AiChatPanel />}
      {isReplaying && (
        <>
          <div className="replay-read-only-overlay">
            <div className="replay-read-only-badge">READ-ONLY</div>
          </div>
          <ReplayControls />
        </>
      )}
    </div>
  )
}

export default App
