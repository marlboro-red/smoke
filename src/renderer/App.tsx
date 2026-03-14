import { useEffect, useRef } from 'react'
import Canvas from './canvas/Canvas'
import Sidebar from './sidebar/Sidebar'
import { useLayoutAutoSave, useLayoutRestore } from './layout/useLayoutPersistence'
import { preferencesStore, usePreference } from './stores/preferencesStore'
import { gridStore } from './stores/gridStore'
import { canvasStore } from './stores/canvasStore'
import { useSessionShortcuts } from './session/useSessionShortcuts'

function App(): JSX.Element {
  useLayoutAutoSave()
  useSessionShortcuts()
  const { restoreDefault } = useLayoutRestore()
  const restored = useRef(false)
  const sidebarPosition = usePreference('sidebarPosition')

  useEffect(() => {
    if (!restored.current) {
      restored.current = true
      restoreDefault()
    }
  }, [restoreDefault])

  // Load preferences on mount and apply grid size
  useEffect(() => {
    window.smokeAPI?.config.get().then((prefs) => {
      if (prefs) {
        preferencesStore.getState().setPreferences(prefs)
        gridStore.getState().setGridSize(prefs.gridSize)
        canvasStore.getState().setGridSize(prefs.gridSize)
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
