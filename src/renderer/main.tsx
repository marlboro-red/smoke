import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App'
import { sessionStore } from './stores/sessionStore'
import { connectorStore } from './stores/connectorStore'
import { goToLineStore } from './fileviewer/goToLineStore'
import { agentStore } from './stores/agentStore'
import { groupStore } from './stores/groupStore'

// Expose stores on window for E2E testing
;(window as any).__SMOKE_STORES__ = { sessionStore, connectorStore, goToLineStore, agentStore, groupStore }

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
