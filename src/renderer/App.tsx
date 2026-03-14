import { useEffect, useRef } from 'react'
import Canvas from './canvas/Canvas'
import Sidebar from './sidebar/Sidebar'
import { useLayoutAutoSave, useLayoutRestore } from './layout/useLayoutPersistence'

function App(): JSX.Element {
  useLayoutAutoSave()
  const { restoreDefault } = useLayoutRestore()
  const restored = useRef(false)

  useEffect(() => {
    if (!restored.current) {
      restored.current = true
      restoreDefault()
    }
  }, [restoreDefault])

  return (
    <div className="app-layout">
      <Sidebar />
      <Canvas />
    </div>
  )
}

export default App
