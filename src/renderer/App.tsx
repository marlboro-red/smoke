import { useEffect, useRef } from 'react'
import Canvas from './canvas/Canvas'
import Sidebar from './sidebar/Sidebar'
import TabBar from './tabs/TabBar'
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
import ComponentErrorBoundary from './errors/ComponentErrorBoundary'
import { useIsReplaying } from './replay/replayStore'
import ReplayControls from './replay/ReplayControls'
import SettingsModal from './config/SettingsModal'
import ShortcutsOverlay from './shortcuts/ShortcutsOverlay'
import CommandPalette from './palette/CommandPalette'
import SearchModal from './search/SearchModal'
import PresentationMode from './presentation/PresentationMode'
import AssemblyPreview from './assembly/AssemblyPreview'
import TaskInput from './assembly/TaskInput'
import ToastContainer from './toast/ToastContainer'
import StatusBar from './statusbar/StatusBar'
import { useIndexingProgress } from './statusbar/useIndexingProgress'
import { applyTheme, applyTerminalOpacity, applyFontSettings } from './themes/applyTheme'
import { pluginStore } from './stores/pluginStore'
import { addToast } from './stores/toastStore'
import { openWorkspaceDialog, openWorkspacePath } from './workspace/openWorkspace'
import './styles/error-boundary.css'

function App(): JSX.Element {
  useLayoutAutoSave()
  useKeyboardShortcuts()
  useAiCanvasActions()
  useAiStream()
  useEventRecording()
  useIndexingProgress()
  const { restoreDefault } = useLayoutRestore()
  const restored = useRef(false)
  const sidebarPosition = usePreference('sidebarPosition')
  const sidebarCollapsed = usePreference('sidebarCollapsed')
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
    }).catch((err) => {
      console.error('Failed to load preferences:', err)
      addToast('Failed to load preferences', 'error')
    })
    window.smokeAPI?.app.getLaunchCwd().then((cwd) => {
      if (cwd) {
        preferencesStore.getState().setLaunchCwd(cwd)
      }
    }).catch((err) => {
      console.error('Failed to get launch cwd:', err)
    })
    // Load available plugins
    pluginStore.getState().loadPlugins().catch((err) => {
      console.error('Failed to load plugins:', err)
    })
    // Listen for plugin hot-reload changes (dev mode)
    const unsubPlugins = window.smokeAPI?.plugin.onChanged?.((event) => {
      pluginStore.setState({ plugins: event.plugins })
    })
    // Listen for workspace:opened events from the main process (menu triggers)
    const unsubWorkspace = window.smokeAPI?.workspace.onOpened((path) => {
      if (path === '__dialog__') {
        openWorkspaceDialog()
      } else {
        openWorkspacePath(path)
      }
    })
    return () => {
      unsubPlugins?.()
      unsubWorkspace?.()
    }
  }, [])

  // Set window title from current workspace on mount
  useEffect(() => {
    const { preferences, launchCwd } = preferencesStore.getState()
    const cwd = preferences.defaultCwd || launchCwd
    if (cwd) {
      const dirName = cwd.split('/').pop() || cwd
      window.smokeAPI?.workspace.setTitle(`${dirName} — Smoke`)
    }
  }, [])

  // Drag-and-drop a folder onto the app to open as workspace
  useEffect(() => {
    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    const handleDrop = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      // Electron exposes .path on File objects
      const file = files[0] as File & { path?: string }
      if (file.path) {
        // Check if it's a directory by trying to read it
        window.smokeAPI?.fs.readdir(file.path).then(() => {
          openWorkspacePath(file.path!)
        }).catch(() => {
          // Not a directory — ignore
        })
      }
    }
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  // Watch for theme changes and apply them
  const theme = usePreference('theme')
  useEffect(() => {
    applyTheme(theme || 'dark')
  }, [theme])

  return (
    <div className="app-shell">
      <div className="app-layout" style={{ flexDirection: sidebarPosition === 'right' ? 'row-reverse' : 'row' }}>
        {!isReplaying && (
          <div className={`sidebar-region${sidebarCollapsed ? ' collapsed' : ''}${sidebarPosition === 'right' ? ' position-right' : ''}`}>
            <div className="sidebar-wrapper">
              <ComponentErrorBoundary name="Sidebar">
                <Sidebar />
              </ComponentErrorBoundary>
            </div>
            <button
              className="sidebar-collapse-btn"
              onClick={() => {
                const next = !sidebarCollapsed
                preferencesStore.getState().updatePreference('sidebarCollapsed', next)
                window.smokeAPI?.config.set('sidebarCollapsed', next)
              }}
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              <span className="sidebar-collapse-icon">
                {sidebarPosition === 'right'
                  ? (sidebarCollapsed ? '\u25C0' : '\u25B6')
                  : (sidebarCollapsed ? '\u25B6' : '\u25C0')}
              </span>
            </button>
          </div>
        )}
        <div className="canvas-with-tabs">
          {!isReplaying && <TabBar />}
          <ComponentErrorBoundary name="Canvas">
            <Canvas readOnly={isReplaying} />
          </ComponentErrorBoundary>
        </div>
        {aiPanelOpen && !isReplaying && (
          <ComponentErrorBoundary name="AI Chat">
            <AiChatPanel />
          </ComponentErrorBoundary>
        )}
        <ComponentErrorBoundary name="Settings">
          <SettingsModal />
        </ComponentErrorBoundary>
        <ShortcutsOverlay />
        <CommandPalette />
        <SearchModal />
        <TaskInput />
        <AssemblyPreview />
        <PresentationMode />
        <ToastContainer />
        {isReplaying && (
          <>
            <div className="replay-read-only-overlay">
              <div className="replay-read-only-badge">READ-ONLY</div>
            </div>
            <ReplayControls />
          </>
        )}
      </div>
      <StatusBar />
    </div>
  )
}

export default App
