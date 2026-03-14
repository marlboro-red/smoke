import Canvas from './canvas/Canvas'
import Sidebar from './sidebar/Sidebar'

function App(): JSX.Element {
  return (
    <div className="app-layout">
      <Sidebar />
      <Canvas />
    </div>
  )
}

export default App
