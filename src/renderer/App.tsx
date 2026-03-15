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
import SettingsModal from './config/SettingsModal'
import ShortcutsOverlay from './shortcuts/ShortcutsOverlay'
import SearchModal from './search/SearchModal'
import { applyTheme, applyTerminalOpacity, applyFontSettings } from './themes/applyTheme'

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
        applyTheme(prefs.theme || 'dark')
        applyTerminalOpacity(prefs.terminalOpacity ?? 1)
        if (prefs.fontFamily || prefs.fontSize || prefs.lineHeight) {
          applyFontSettings(
            prefs.fontFamily || '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
            prefs.fontSize || 13,
            prefs.lineHeight || 1.2,
          )
        }
      }
    })
    window.smokeAPI?.app.getLaunchCwd().then((cwd) => {
      if (cwd) {
        preferencesStore.getState().setLaunchCwd(cwd)
      }
    })
  }, [])

  // Watch for theme changes and apply them
  const theme = usePreference('theme')
  useEffect(() => {
    applyTheme(theme || 'dark')
  }, [theme])

  return (
    <div className="app-layout" style={{ flexDirection: sidebarPosition === 'right' ? 'row-reverse' : 'row' }}>
      {!isReplaying && <Sidebar />}
      <Canvas readOnly={isReplaying} />
      {aiPanelOpen && !isReplaying && <AiChatPanel />}
      <SettingsModal />
      <ShortcutsOverlay />
      <SearchModal />
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
