# Smoke Architecture

## Three-Process Architecture

Smoke follows Electron's standard three-process model with strict isolation:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Main Process                                │
│  ┌──────────┐  ┌───────────────┐  ┌───────────────────────────────┐ │
│  │ PtyManager│  │ ipcHandlers.ts│  │ ConfigStore (electron-store)  │ │
│  │  ├ spawn  │  │  ├ pty:*      │  │  ├ preferences               │ │
│  │  ├ write  │  │  ├ layout:*   │  │  ├ defaultLayout             │ │
│  │  ├ resize │  │  ├ config:*   │  │  └ namedLayouts              │ │
│  │  └ kill   │  │  ├ fs:*       │  └───────────────────────────────┘ │
│  └──────────┘  │  ├ ai:*       │  ┌───────────────────────────────┐ │
│  ┌──────────┐  │  ├ agent:*    │  │ CodeGraph                     │ │
│  │ AiService│  │  ├ codegraph:*│  │  ├ graphBuilder (BFS)         │ │
│  │ ├ stream │  │  ├ search:*   │  │  ├ importParser               │ │
│  │ └ tools  │  │  ├ structure:*│  │  ├ importResolver              │ │
│  │AgentMgr  │  │  ├ bookmark:* │  │  ├ ReverseIndex               │ │
│  │ ├ create │  │  ├ tab:*      │  │  ├ SearchIndex                │ │
│  │ ├ scope  │  │  ├ task:*     │  │  ├ StructureAnalyzer          │ │
│  │ └ remove │  │  └ relevance:*│  │  ├ RelevanceScorer            │ │
│  └──────────┘  └───────────────┘  │  └ layoutEngine               │ │
│                                    └───────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────┴──────────────────────────────────────────┐
│                        Preload Script                                │
│  contextBridge.exposeInMainWorld('smokeAPI', {                       │
│    pty, layout, bookmark, config, fs, app, ai, agent,               │
│    recording, canvas, project, tab, task, relevance,                │
│    codegraph, search, structure                                      │
│  })                                                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ window.smokeAPI
┌──────────────────────────┴──────────────────────────────────────────┐
│                       Renderer Process                               │
│  ┌────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │   Canvas   │ │  Terminals   │ │ Sidebar  │ │ Zustand Stores   │  │
│  │  ├ Grid    │ │  ├ Widget    │ │ ├ Sessions│ │ (16 stores)      │  │
│  │  ├ Pan     │ │  ├ SplitPane │ │ ├ FileTree│ │  ├ sessionStore  │  │
│  │  ├ Zoom    │ │  ├ Chrome    │ │ ├ Layouts │ │  ├ canvasStore   │  │
│  │  ├ Minimap │ │  └ Thumbnail │ │ ├ Bookmark│ │  ├ gridStore     │  │
│  │  ├ Regions │ │              │ │ ├ Groups  │ │  ├ groupStore    │  │
│  │  └ Export  │ │  Files/Code  │ │ └ Config  │ │  ├ agentStore    │  │
│  └────────────┘ │  ├ Viewer    │ └──────────┘ │  ├ connectorStore │  │
│  ┌────────────┐ │  ├ Editor    │ ┌──────────┐ │  ├ regionStore   │  │
│  │ AI Panel   │ │  ├ Snippet   │ │ Overlays │ │  ├ splitPaneStore│  │
│  │  ├ Chat    │ │  ├ WebView   │ │ ├ CmdPal │ │  ├ tabStore     │  │
│  │  ├ Agents  │ │  └ Image     │ │ ├ Present│ │  ├ aiStore      │  │
│  │  └ Tools   │ │              │ │ ├ Toast  │ │  └ ...           │  │
│  └────────────┘ └──────────────┘ │ └ StatusB│ └──────────────────┘  │
│                                   └──────────┘                       │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────────────────────┐   │
│  │ DepGraph   │ │  Recording   │ │ Window Chrome                │   │
│  │  ├ Build   │ │  ├ Recorder  │ │  ├ Drag, Resize, Snap       │   │
│  │  ├ CodeGraph│ │  └ Replay   │ │  ├ Lock, Pin                │   │
│  │  └ Materize│ │              │ │  └ Tabs                      │   │
│  └────────────┘ └──────────────┘ └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Main Process (`src/main/`)

The main process owns all Node.js-level resources:

- **PtyManager / PtyProcess** — Spawns and manages shell processes via `node-pty`. Each PTY gets a unique ID, runs in `xterm-256color` mode, and validates shell paths before launch.
- **AiService / AgentManager** — Per-agent conversation state, streaming responses from Claude API, scope-aware tool execution. Agents can be assigned to canvas groups with restricted tool access.
- **CodeGraph** — Dependency analysis engine:
  - `graphBuilder` — BFS traversal of import relationships up to configurable depth
  - `importParser` — Language-agnostic extraction of imports (TypeScript, Python, Go, Rust, etc.)
  - `importResolver` — Path resolution with tsconfig/jsconfig alias support
  - `ReverseIndex` — Project-wide reverse dependency map built incrementally in background batches
  - `SearchIndex` — Word-level inverted index across 40+ file types with regex support
  - `StructureAnalyzer` — Detects project boundaries, monorepo workspaces, entry points, module types
  - `RelevanceScorer` — Contextual file ranking by keyword match, import proximity, recency, file type
  - `TaskParser` — Extracts task intent and file patterns from natural language
  - `layoutEngine` — Force-directed positioning for graph visualization
- **ipcHandlers** — Registers all IPC channel handlers. Request/response channels use `ipcMain.handle()`, data-streaming channels use `ipcMain.on()`.
- **ConfigStore** — Wraps `electron-store` for JSON-based persistence of preferences, layouts, bookmarks, and tab state.

### Preload (`src/preload/`)

The preload script runs with Node.js APIs but in the renderer's context. It exposes a typed `smokeAPI` object via `contextBridge.exposeInMainWorld()` with 17 namespaces: `pty`, `layout`, `bookmark`, `config`, `fs`, `app`, `ai`, `agent`, `recording`, `canvas`, `project`, `tab`, `task`, `relevance`, `codegraph`, `search`, `structure`.

Security settings:
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: false` (required for preload Node APIs)

### Renderer (`src/renderer/`)

A React 18 application responsible for all UI. Uses Zustand for state management, xterm.js for terminal rendering, CodeMirror 6 for code editing, and Shiki for syntax highlighting.

## Directory Structure

```
src/
├── main/
│   ├── index.ts                 # App entry, window creation, lifecycle
│   ├── ipc/
│   │   ├── channels.ts          # IPC channel constants + message type interfaces
│   │   └── ipcHandlers.ts       # All ipcMain.handle/on registrations
│   ├── pty/
│   │   ├── PtyManager.ts        # PTY process pool management
│   │   └── PtyProcess.ts        # Single PTY wrapper (node-pty)
│   ├── ai/
│   │   ├── AiService.ts         # Per-agent Claude API streaming
│   │   ├── AgentManager.ts      # Multi-agent lifecycle + scope management
│   │   ├── tools.ts             # Scope-aware AI tool definitions
│   │   └── TerminalOutputBuffer.ts  # Buffered terminal output for AI context
│   ├── codegraph/
│   │   ├── graphBuilder.ts      # BFS graph builder + dependents graph
│   │   ├── importParser.ts      # Language-agnostic import extraction
│   │   ├── importResolver.ts    # Path resolution + alias support
│   │   ├── ReverseIndex.ts      # Project-wide reverse dependency index
│   │   ├── SearchIndex.ts       # Full-text inverted index
│   │   ├── StructureAnalyzer.ts # Project boundary + module detection
│   │   ├── RelevanceScorer.ts   # Contextual file ranking
│   │   ├── TaskParser.ts        # Natural language task → intent + files
│   │   └── layoutEngine.ts      # Force-directed graph positioning
│   ├── config/
│   │   └── ConfigStore.ts       # electron-store schema and instance
│   └── watcher/                 # File system watcher for incremental updates
├── preload/
│   ├── index.ts                 # contextBridge API exposure (17 namespaces)
│   └── types.ts                 # SmokeAPI TypeScript interface
└── renderer/
    ├── App.tsx                  # Root: layout, init hooks, sidebar + canvas
    ├── main.tsx                 # React 18 createRoot entry
    ├── canvas/
    │   ├── Canvas.tsx           # Infinite canvas with element rendering
    │   ├── Grid.tsx             # Grid pattern overlay
    │   ├── Minimap.tsx          # 180x120px canvas minimap with activity indicators
    │   ├── RegionShape.tsx      # Colored spatial grouping regions
    │   ├── ConnectorLayer.tsx   # SVG arrow connectors between elements
    │   ├── exportCanvas.ts      # Canvas → PNG export via IPC
    │   ├── useCanvasControls.ts # Pan/zoom/pointer/wheel handling
    │   └── useViewportCulling.ts # Viewport-based visibility filtering
    ├── terminal/
    │   ├── TerminalWindow.tsx   # Draggable/resizable terminal container
    │   ├── TerminalWidget.tsx   # xterm.js integration + PTY bridge
    │   ├── TerminalThumbnail.tsx # Text-based zoomed-out view
    │   ├── useTerminal.ts       # Terminal instance creation/lifecycle
    │   ├── usePty.ts            # PTY I/O bridging (data in/out)
    │   └── terminalRegistry.ts  # Terminal lifecycle + WebGL management
    ├── fileviewer/
    │   ├── FileViewerWindow.tsx # Shiki viewer + CodeMirror editor container
    │   └── ...                  # Language detection, dirty state tracking
    ├── snippet/
    │   └── SnippetWindow.tsx    # CodeMirror code editor with language selector
    ├── webview/
    │   └── WebviewWindow.tsx    # Embedded localhost web views
    ├── image/
    │   └── ImageWindow.tsx      # Canvas image display
    ├── note/
    │   └── NoteWindow.tsx       # Colored sticky notes
    ├── depgraph/
    │   ├── buildDepGraph.ts     # Graph materialization → sessions + connectors
    │   └── CodeGraph.ts         # Pure node/edge data structure
    ├── ai/
    │   ├── AiChatPanel.tsx      # Chat UI, streaming, tool rendering
    │   └── useAgentScopeSync.ts # Syncs group membership to main process
    ├── palette/
    │   ├── CommandPalette.tsx   # Fuzzy-search modal overlay
    │   ├── paletteCommands.ts   # Command registry (sessions + actions + files)
    │   └── commandPaletteStore.ts # Open/close, query, selection state
    ├── presentation/
    │   ├── PresentationMode.tsx # Full-screen slide navigation
    │   └── presentationStore.ts # Bookmark slides, navigation state
    ├── bookmarks/
    │   └── BookmarkPanel.tsx    # Save/load canvas view positions
    ├── search/
    │   └── searchStore.ts       # Full-text search across canvas elements
    ├── recording/               # Event recorder
    ├── replay/                  # Replay engine, playback controls
    ├── tabs/
    │   └── TabBar.tsx           # Multi-workspace tab management
    ├── statusbar/
    │   └── StatusBar.tsx        # Zoom, element counts, git branch
    ├── window/
    │   ├── WindowChrome.tsx     # Title bar, status indicator, close button
    │   ├── ResizeHandle.tsx     # Corner + edge resize handles
    │   ├── useWindowDrag.ts     # Drag-to-move with grid snap
    │   ├── useWindowResize.ts   # Resize with grid snap + PTY resize
    │   └── useSnapping.ts       # Grid snap utilities
    ├── session/
    │   ├── useSessionCreation.ts # New session: store + PTY spawn
    │   └── useSessionClose.ts   # Close: PTY kill + cleanup
    ├── sidebar/
    │   ├── Sidebar.tsx          # Session list, file tree, layout, bookmark panels
    │   ├── SessionListItem.tsx  # Clickable session entry
    │   ├── ContextMenu.tsx      # Right-click: lock, pin, group, delete
    │   └── useSidebarSync.ts    # Pan-to-session animation (easeOut)
    ├── shortcuts/
    │   ├── shortcutMap.ts       # 53 shortcut definitions + resolution
    │   └── useKeyboardShortcuts.ts # Global capture-phase handler
    ├── layout/
    │   ├── LayoutPanel.tsx      # Save/load/delete layout UI
    │   ├── autoLayout.ts        # Grid/horizontal/vertical auto-arrange
    │   └── useLayoutPersistence.ts # Serialize/restore/auto-save
    ├── config/
    │   └── ConfigPanel.tsx      # Settings panel UI
    ├── themes/
    │   └── themes.ts            # 6 built-in color schemes with xterm palettes
    ├── toast/                   # Toast notification system
    ├── stores/
    │   ├── sessionStore.ts      # Session map + focus/z-index/lock/pin
    │   ├── canvasStore.ts       # Pan (x,y) + zoom
    │   ├── gridStore.ts         # Grid size + snap toggle + visibility
    │   ├── groupStore.ts        # Terminal groups + broadcast + collapse
    │   ├── agentStore.ts        # AI agent state + scope
    │   ├── aiStore.ts           # AI panel state
    │   ├── connectorStore.ts    # Arrow connectors between elements
    │   ├── regionStore.ts       # Canvas spatial regions
    │   ├── snapshotStore.ts     # Terminal text captures
    │   ├── snapPreviewStore.ts  # Grid snap preview overlay
    │   ├── preferencesStore.ts  # User preferences mirror
    │   ├── splitPaneStore.ts    # Split pane tree per session
    │   ├── tabStore.ts          # Multi-workspace tabs
    │   ├── activityStore.ts     # Off-screen terminal activity indicators
    │   ├── focusModeStore.ts    # Focus mode toggle
    │   └── toastStore.ts        # Toast notification queue
    └── styles/                  # CSS stylesheets
```

## Data Flow

### Keystroke → Shell Output

```
User types key
    ↓
xterm.js onData callback
    ↓
window.smokeAPI.pty.write(id, data)     ← fire-and-forget (ipcRenderer.send)
    ↓
ipcMain.on('pty:data:to-pty')
    ↓
PtyProcess.write(data)                  ← node-pty writes to shell stdin
    ↓
Shell processes input, produces output
    ↓
PtyProcess 'data' event                 ← node-pty reads from shell stdout
    ↓
win.webContents.send('pty:data:from-pty', { id, data })
    ↓
ipcRenderer.on callback → usePty hook
    ↓
terminal.write(data)                    ← xterm.js renders to screen
```

### Session Creation

```
User action (double-click / Cmd+N / sidebar button / command palette)
    ↓
useSessionCreation.createNewSession()
    ↓
sessionStore.createSession()            ← Zustand state update
    ↓
window.smokeAPI.pty.spawn({ id, cwd, shell })
    ↓
ipcMain.handle('pty:spawn')
    ↓
PtyManager.spawn()
    ↓
new PtyProcess(options)                 ← node-pty.spawn()
    ↓
If autoLaunchClaude: setTimeout → PtyProcess.write(claudeCommand + '\n')
    ↓
Returns { id, pid }
```

### Dependency Graph Build

```
User presses Cmd+Shift+I on focused file
    ↓
window.smokeAPI.codegraph.build(filePath, projectRoot, maxDepth)
    ↓
ipcMain.handle('codegraph:build')
    ↓
graphBuilder: BFS from root file
  ├── importParser: extract imports from source
  ├── importResolver: resolve specifiers to absolute paths
  └── layoutEngine: force-directed positioning
    ↓
Returns { nodes[], edges[] }
    ↓
buildDepGraph (renderer): materialize on canvas
  ├── Create file viewer sessions for each node
  ├── Create arrow connectors for each edge
  └── Create regions for directories with 2+ files
```

### AI Agent Tool Execution

```
User sends message to agent in chat panel
    ↓
window.smokeAPI.ai.send(agentId, message)
    ↓
AiService: build messages with tool definitions
    ↓
Claude API: streaming response with tool_use blocks
    ↓
AgentManager: execute tool with scope check
  ├── Verify target session is in agent's allowed scope
  ├── Execute tool (spawn terminal, write, read file, etc.)
  └── Auto-add newly spawned sessions to agent's scope
    ↓
Stream tool results + assistant text back to renderer
```

## State Management

### Zustand Stores

Smoke uses Zustand with the vanilla store API for performance. Each store exposes both direct getters (for non-React code) and React hooks (for components).

| Store | Purpose | Update Frequency |
|---|---|---|
| `sessionStore` | Session CRUD, focus, z-index, lock, pin | On user interaction |
| `canvasStore` | Pan position, zoom level | Every frame during pan/zoom |
| `gridStore` | Grid size, snap toggle, visibility | On settings change |
| `groupStore` | Terminal groups, broadcast, collapse | On group interaction |
| `agentStore` | AI agent state, scope, messages | On AI interaction |
| `aiStore` | AI panel open/close, configuration | On panel toggle |
| `connectorStore` | Arrow connectors between elements | On connector CRUD |
| `regionStore` | Canvas spatial regions | On region CRUD |
| `splitPaneStore` | Split pane tree per session | On split/close |
| `tabStore` | Workspace tabs and active tab | On tab switch |
| `snapshotStore` | Terminal text captures | Every 5 seconds per terminal |
| `snapPreviewStore` | Grid snap preview overlay | During drag/resize |
| `preferencesStore` | User preferences mirror | On settings change |
| `activityStore` | Off-screen terminal activity | On terminal output |
| `focusModeStore` | Focus mode toggle | On toggle |
| `toastStore` | Toast notification queue | On notification |

### When to Use Refs vs State

- **Refs** for values that change every frame (pan/zoom coordinates during drag, pointer position). Writing to Zustand on every mousemove would cause excessive re-renders.
- **State** (Zustand) for values that trigger UI updates (session list, focus, preferences). Debounced sync from refs → state (typically 100ms).

Pattern used in `useCanvasControls`:
```
pointer move → update ref → apply CSS transform directly
                              ↓ (debounced 100ms)
                           canvasStore.setPan()
```

## Canvas Rendering

### CSS Transform3D Approach

The canvas uses a single CSS `transform: translate3d(x, y, 0) scale(zoom)` on the content container. This approach:

- Leverages GPU compositing (translate3d promotes to its own layer)
- Avoids re-laying-out children on pan/zoom
- Allows smooth 60fps panning via direct DOM manipulation (refs)

```
┌─ Viewport (fixed, overflow: hidden) ─────────────────┐
│                                                       │
│   ┌─ Canvas Container (transform: translate3d+scale) ┐│
│   │                                                   ││
│   │   [Terminal A]     [Terminal B]                    ││
│   │        ↕ connector                                ││
│   │   ┌─ Region ──────────────────┐                   ││
│   │   │  [File C]    [File D]     │                   ││
│   │   └───────────────────────────┘                   ││
│   │            [Note E]     [Snippet F]               ││
│   │                                                   ││
│   └───────────────────────────────────────────────────┘│
│                                              [Minimap] │
│  [StatusBar: 100% | 6 elements | main]                 │
└───────────────────────────────────────────────────────┘
```

### Pinned Elements

Pinned elements render in a separate overlay `div` at fixed viewport coordinates, outside the canvas transform. This keeps them stationary on screen while the canvas pans and zooms beneath them.

## Performance Strategy

### Viewport Culling

Only sessions within the visible viewport (+ 200px margin) are rendered. `useViewportCulling` recalculates visibility on:
- Session create/delete/move
- Pan or zoom change
- Debounced at 100ms

### Thumbnail Mode

At zoom < 0.4, full xterm.js terminals are replaced with lightweight `TerminalThumbnail` components that render pre-captured text snapshots. This avoids maintaining dozens of WebGL contexts at once.

### WebGL Addon Management

Each xterm.js terminal can optionally use a WebGL addon for GPU-accelerated rendering. The `terminalRegistry` manages addon lifecycle:

1. **Load**: WebGL addon created after terminal attaches to DOM
2. **Hide**: When terminal leaves viewport, WebGL disposal is scheduled after 60 seconds
3. **Reattach**: When terminal re-enters viewport, a new WebGL addon is created if the old one was disposed
4. **Fallback**: If WebGL context creation fails, terminal falls back to canvas rendering

### Background Indexing

Search index, reverse dependency index, and structure analysis build incrementally:
- Files are processed in batches (100 at a time) to avoid blocking the main process
- Only the first 4KB of each file is read for import extraction
- File watcher triggers incremental updates on changes

### Debouncing

| Operation | Debounce | Why |
|---|---|---|
| Pan/zoom → Zustand sync | 100ms | Avoid re-renders during interaction |
| Viewport culling recalc | 100ms | Avoid thrashing on rapid changes |
| Layout auto-save | 2s | Avoid excessive disk writes |
| Snapshot capture | 5s interval | Balance freshness vs CPU |
| Auto layout transitions | 400ms | Smooth CSS transitions |

## IPC Channel Reference

### Request/Response (ipcMain.handle → ipcRenderer.invoke)

| Channel | Direction | Purpose |
|---|---|---|
| `pty:spawn` | Renderer → Main | Spawn new PTY process |
| `pty:resize` | Renderer → Main | Resize PTY terminal |
| `pty:kill` | Renderer → Main | Kill PTY process |
| `layout:save` | Renderer → Main | Save named layout |
| `layout:load` | Renderer → Main | Load named layout |
| `layout:list` | Renderer → Main | List saved layouts |
| `layout:delete` | Renderer → Main | Delete named layout |
| `config:get` | Renderer → Main | Get preferences |
| `config:set` | Renderer → Main | Set preference value |
| `bookmark:save` | Renderer → Main | Save named bookmark |
| `bookmark:list` | Renderer → Main | List all bookmarks |
| `bookmark:delete` | Renderer → Main | Delete bookmark |
| `fs:readdir` | Renderer → Main | List directory contents |
| `fs:readfile` | Renderer → Main | Read text file |
| `fs:writefile` | Renderer → Main | Write text file |
| `ai:send` | Renderer → Main | Send message to AI agent |
| `ai:abort` | Renderer → Main | Abort AI response |
| `agent:create` | Renderer → Main | Create new agent |
| `agent:remove` | Renderer → Main | Remove agent |
| `agent:assign-group` | Renderer → Main | Assign agent to group with scope |
| `agent:update-scope` | Renderer → Main | Update agent's session scope |
| `codegraph:build` | Renderer → Main | Build dependency graph |
| `codegraph:expand` | Renderer → Main | Expand existing graph |
| `codegraph:get-imports` | Renderer → Main | List imports for file |
| `codegraph:get-dependents` | Renderer → Main | Get reverse dependencies |
| `codegraph:build-dependents` | Renderer → Main | Build dependents graph |
| `search:build` | Renderer → Main | Build search index |
| `search:query` | Renderer → Main | Search indexed code |
| `structure:analyze` | Renderer → Main | Analyze code structure |
| `relevance:score` | Renderer → Main | Score file relevance |
| `task:parse` | Renderer → Main | Parse task description |
| `tab:getState` | Renderer → Main | Get tab state |
| `tab:saveState` | Renderer → Main | Save tab state |
| `canvas:export-png` | Renderer → Main | Export canvas as PNG |

### Fire-and-Forget (ipcMain.on / webContents.send)

| Channel | Direction | Purpose |
|---|---|---|
| `pty:data:to-pty` | Renderer → Main | User keystrokes |
| `pty:data:from-pty` | Main → Renderer | Shell output |
| `pty:exit` | Main → Renderer | PTY process exited |
| `ai:stream` | Main → Renderer | AI streaming response deltas |
| `ai:canvas-action` | Main → Renderer | AI-triggered canvas actions |
| `fs:file-changed` | Main → Renderer | File watcher notifications |
| `search:progress` | Main → Renderer | Search indexing progress |
| `project:index-updated` | Main → Renderer | Project index rebuilt |

Data channels use fire-and-forget (`send`/`on`) rather than request/response (`invoke`/`handle`) for performance — no await overhead on every keystroke or streaming delta.

## Configuration Schema

Stored in `~/Library/Application Support/Smoke/smoke-config.json` (macOS) or `%APPDATA%/Smoke/smoke-config.json` (Windows).

```typescript
interface SmokeConfig {
  defaultLayout: Layout | null
  namedLayouts: Record<string, Layout>
  preferences: Preferences
  bookmarks: Record<string, Bookmark>
  tabState: TabState | null
}

interface Preferences {
  defaultShell: string        // '' = system default
  autoLaunchClaude: boolean   // false
  claudeCommand: string       // 'claude'
  gridSize: number            // 20 (pixels, range 10–50)
  sidebarPosition: 'left' | 'right'  // 'left'
  sidebarWidth: number        // 240 (pixels)
  theme: string               // 'dark'
  defaultCwd: string          // '' = app's working directory
}

interface Layout {
  name: string
  sessions: LayoutSession[]
  viewport: { panX: number; panY: number; zoom: number }
  gridSize: number
}

interface LayoutSession {
  title: string
  cwd: string
  type: 'terminal' | 'file' | 'note' | 'snippet' | 'webview' | 'image'
  position: { x: number; y: number }
  size: { width: number; height: number; cols: number; rows: number }
  locked?: boolean
  isPinned?: boolean
  pinnedViewportPos?: { x: number; y: number }
}

interface Bookmark {
  id: string
  name: string
  panX: number
  panY: number
  zoom: number
}
```
