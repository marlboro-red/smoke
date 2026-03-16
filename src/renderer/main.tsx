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
import { indexingStore } from './stores/indexingStore'
import { agentStore } from './stores/agentStore'
import { groupStore } from './stores/groupStore'
import { focusModeStore } from './stores/focusModeStore'
import { canvasSearchStore } from './search/searchStore'

// Expose stores on window for E2E testing
;(window as any).__SMOKE_STORES__ = { sessionStore, connectorStore, goToLineStore, toastStore, shortcutBindingsStore, suggestionStore, splitPaneStore, indexingStore, agentStore, groupStore, focusModeStore, canvasSearchStore }

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
