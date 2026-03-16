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
import { taskInputStore } from './assembly/taskInputStore'
import { assemblyPreviewStore } from './assembly/assemblyPreviewStore'
import { presentationStore } from './presentation/presentationStore'
import { preferencesStore } from './stores/preferencesStore'
import { canvasStore } from './stores/canvasStore'
import { setPanTo, setZoomTo } from './canvas/useCanvasControls'
import { buildDepGraph, expandDepGraph, buildDependentsGraph } from './depgraph/buildDepGraph'
import { canvasSearchStore } from './search/searchStore'
import { regionStore } from './stores/regionStore'
import { replayStore } from './replay/replayStore'

// Expose stores on window for E2E testing
;(window as any).__SMOKE_STORES__ = { sessionStore, connectorStore, goToLineStore, toastStore, shortcutBindingsStore, suggestionStore, splitPaneStore, indexingStore, agentStore, groupStore, focusModeStore, taskInputStore, assemblyPreviewStore, presentationStore, preferencesStore, canvasStore, canvasControls: { setPanTo, setZoomTo }, depgraph: { buildDepGraph, expandDepGraph, buildDependentsGraph }, canvasSearchStore, regionStore, replayStore }

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
