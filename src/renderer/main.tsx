import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App'
import { sessionStore } from './stores/sessionStore'
import { connectorStore } from './stores/connectorStore'
import { goToLineStore } from './fileviewer/goToLineStore'
import { toastStore } from './stores/toastStore'
import { shortcutBindingsStore } from './shortcuts/shortcutMap'
import { suggestionStore } from './stores/suggestionStore'
import { splitPaneStore } from './stores/splitPaneStore'
import { regionStore } from './stores/regionStore'

// Expose stores on window for E2E testing
;(window as any).__SMOKE_STORES__ = { sessionStore, connectorStore, goToLineStore, toastStore, shortcutBindingsStore, suggestionStore, splitPaneStore, regionStore }

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
