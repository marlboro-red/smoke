import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App'
import { sessionStore } from './stores/sessionStore'
import { connectorStore } from './stores/connectorStore'

// Expose stores on window for E2E test access
;(window as any).__SMOKE_STORES__ = { sessionStore, connectorStore }

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
