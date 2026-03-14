import { useEffect, useRef } from 'react'
import Canvas from './canvas/Canvas'
import Sidebar from './sidebar/Sidebar'
import { useLayoutAutoSave, useLayoutRestore } from './layout/useLayoutPersistence'
import { preferencesStore, usePreference } from './stores/preferencesStore'
import { gridStore } from './stores/gridStore'
import { canvasStore } from './stores/canvasStore'
import { useKeyboardShortcuts } from './shortcuts/useKeyboardShortcuts'

function App(): JSX.Element {
  useLayoutAutoSave()
  useKeyboardShortcuts()
  const { restoreDefault } = useLayoutRestore()
  const restored = useRef(false)
  const sidebarPosition = usePreference('sidebarPosition')

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
      <Sidebar />
      <Canvas />
    </div>
  )
}

export default App
