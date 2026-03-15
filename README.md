# Smoke

Infinite canvas workspace for orchestrating terminals, files, code snippets, web views, and AI agents on a spatial 2D surface.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey)

## Features

### Canvas & Navigation
- **Infinite canvas** — pan and zoom freely across a 2D workspace
- **Grid snapping** — align elements to a configurable grid with snap preview overlay
- **Semantic zoom** — elements switch between interactive and thumbnail modes at zoom < 0.4
- **Viewport culling** — only renders visible elements for smooth performance at scale
- **Canvas minimap** — 180x120px preview in the bottom-right corner with click-to-navigate and activity indicators for off-screen terminals
- **Canvas regions** — colored spatial grouping areas to visually organize related elements on the canvas
- **Auto layout** — automatically arrange all unlocked elements in grid, horizontal, or vertical layouts with smooth 400ms transitions

### Terminals
- **Multiple terminals** — spawn terminal windows anywhere on the canvas
- **Real PTY terminals** — full terminal emulation via node-pty and xterm.js with WebGL rendering
- **Terminal groups** — organize terminals into named, colored groups with broadcast mode (send keystrokes to all group members simultaneously)
- **Split panes** — split terminal sessions horizontally or vertically (up to 4 panes) with directional keyboard navigation
- **Terminal search** — find text within terminal buffers (`Cmd/Ctrl+F`)
- **Auto-launch Claude Code** — optionally start Claude Code in every new terminal

### File Viewer & Editor
- **File viewer** — read-only file viewing with Shiki syntax highlighting
- **File editor** — CodeMirror 6 editor with language support for TypeScript, JavaScript, Python, HTML, CSS, JSON, Markdown, Rust, C++, Java, Go, YAML, XML, SQL, PHP
- **File tree panel** — sidebar file browser with lazy-loaded directory expansion, file type icons, and smart filtering

### Code Snippets
- **Snippet editor** — CodeMirror-based code editor windows on the canvas with language selector and syntax highlighting for 16+ languages

### Web Views
- **Embedded web views** — display local web applications (localhost URLs) on the canvas with navigation controls (back, forward, refresh) and URL bar

### Images
- **Image display** — render images on the canvas with aspect-ratio-aware resizing

### Canvas Annotations
- **Sticky notes** — colored notes (yellow, pink, blue, green, purple) that live on the canvas
- **Connectors** — arrow connectors between any canvas elements with bezier curves, optional labels, and custom colors

### Spatial Code Intelligence
- **Dependency graph** — visualize import relationships from any file up to 3 levels deep with auto-created file viewers, arrow connectors, and directory-based region grouping (`Cmd/Ctrl+Shift+I`)
- **Reverse dependency lookup** — find all files that import a given file across the entire project with background index building
- **Import parsing** — language-agnostic extraction of `import`, `require`, and language-specific imports (TypeScript, Python, Go, Rust, etc.) with path alias support (tsconfig/jsconfig)
- **Full-text search** — word-level inverted index across 40+ source file types with regex support and ranked results
- **Structure analysis** — detect project boundaries, monorepo workspaces, entry points, and module types
- **Relevance scoring** — rank files by contextual relevance using path keywords, content matches, import proximity, file type, and recency
- **Task parsing** — extract task intent (fix, add, refactor, test, etc.) and file patterns from natural language descriptions

### AI Integration
- **AI orchestrator chat panel** — streaming chat interface powered by Claude API
- **Multi-agent support** — create multiple independent AI agents with unique names, colors, and roles
- **Agent scoping** — assign agents to terminal groups; tools only operate on sessions within the agent's scope
- **Tool use** — agents can spawn terminals, write to terminals, read/edit files, list sessions, move/resize elements, create notes/arrows/groups, broadcast to groups, and explore import graphs

### Session Recording & Replay
- **Event recording** — captures canvas events (session creation, moves, resizes, terminal snapshots, AI messages)
- **Replay engine** — frame-by-frame playback with speed control (0.5x-2x), seek, and progress tracking
- **Canvas lockdown** — canvas is read-only during replay to prevent interference

### Workspace Management
- **Tabs** — multiple isolated workspaces, each with its own canvas, sessions, zoom/pan state, and persisted layouts; create, rename, close, and switch tabs
- **Layout persistence** — auto-saves your workspace; save/load named layouts
- **Bookmarks** — save and recall canvas view positions (pan and zoom) with smooth animated transitions; bookmarks also serve as slides for presentation mode
- **Command palette** — fuzzy-search overlay (`Cmd/Ctrl+P`) for jumping to sessions, running actions, and opening project files
- **Presentation mode** — full-screen slide navigation through bookmarks with slide controls, dot navigation, and keyboard shortcuts (`F5` to start, arrows to navigate)
- **Canvas export** — export the current canvas viewport as a PNG image (`Cmd/Ctrl+Shift+E`)
- **Element pinning** — pin elements to a fixed viewport position so they stay on screen while panning/zooming (useful for HUDs and controls)
- **Element locking** — lock element positions to prevent accidental dragging; locked elements are skipped by auto layout
- **Focus mode** — dim all elements not connected to the focused element via arrows/connectors for visual concentration (`Cmd/Ctrl+Shift+.`)
- **Status bar** — persistent bottom bar showing zoom level (with presets), element count by type, active terminal count, canvas cursor coordinates, and current git branch
- **Sidebar** — browse, reorder, and focus sessions; access file tree, layouts, bookmarks, groups, and settings
- **Themes** — 6 built-in color schemes: Dark, Light, Catppuccin Mocha, Dracula, Nord, Solarized Dark
- **Configurable** — choose your shell, grid size, sidebar position, theme, default working directory
- **Cross-platform** — packaged for macOS (DMG/ZIP, x64 + arm64) and Windows (NSIS installer)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm

### Install & Run

```bash
git clone <repo-url> smoke
cd smoke
npm install
npm run dev
```

The `postinstall` script automatically builds the project and rebuilds the native `node-pty` module for your platform.

## Usage

### Creating Elements

- **Double-click** on the canvas to create a new terminal at that position
- **Cmd/Ctrl+N** to create a new terminal at the center of the viewport
- **Cmd/Ctrl+Shift+K** to create a new code snippet
- Click **"+ New"** in the sidebar
- Double-click a file in the **File Tree** sidebar panel to open it in a file viewer
- Create sticky notes and connectors from the canvas context menu or AI actions
- Use the **command palette** (`Cmd/Ctrl+P`) to open project files or run any action

### Canvas Navigation

| Action | Input |
|---|---|
| Pan | Scroll, middle-click drag, or Space+drag |
| Zoom | Ctrl+Scroll (zooms toward cursor) |
| New terminal | Double-click empty canvas |
| Command palette | `Cmd/Ctrl+P` |
| Search sessions | `Cmd/Ctrl+Shift+F` |

### Managing Sessions

- Click an element to focus it
- Press **Escape** to unfocus and return to canvas navigation
- Click a session in the sidebar to focus and pan to it
- Double-click a title bar to rename it
- **Cmd/Ctrl+D** to duplicate the focused element

### Window Management

- **Move** — drag the title bar
- **Resize** — drag the edge handles
- **Focus** — click an element or use sidebar/shortcuts
- **Lock** — right-click title bar > Lock Position (prevents dragging)
- **Pin** — right-click title bar > Pin to Viewport (stays fixed on screen)
- All positions and sizes snap to grid on release

### Terminal Groups

- Create named, colored groups to organize related terminals
- **Broadcast mode** (`Cmd/Ctrl+Shift+B`) — send keystrokes to all terminals in the focused group
- **Collapse groups** (`Cmd/Ctrl+Shift+G`) — hide group members into a compact card
- **Group selected** (`Cmd/Ctrl+Alt+G`) — group selected elements together
- Assign AI agents to groups for scoped control

### Split Panes

- **Cmd/Ctrl+\\** — split terminal horizontally
- **Cmd/Ctrl+Shift+\\** — split terminal vertically
- **Cmd/Ctrl+Alt+Arrow** — navigate between panes
- **Cmd/Ctrl+Shift+W** — close current pane

### File Editing

- Open files from the file tree panel in the sidebar
- Toggle between read-only view (Shiki) and edit mode (CodeMirror) with **Cmd/Ctrl+E**
- Save changes with **Cmd/Ctrl+S** in the editor
- Jump to a specific line with **Cmd/Ctrl+G**
- Unsaved changes are tracked with a dirty indicator

### Dependency Graph

- Focus a file viewer and press **Cmd/Ctrl+Shift+I** to visualize its import dependency tree
- The graph creates file viewers for each dependency, arrow connectors for imports, and canvas regions for directory grouping
- Right-click a file viewer title to show reverse dependencies (files that import this file)

### Bookmarks & Presentation

- **Cmd/Ctrl+B** to bookmark the current canvas view
- **Cmd/Ctrl+K** to save a named bookmark
- Press **F5** to start presentation mode using bookmarks as slides
- Navigate slides with arrow keys or Space; press **Escape** to exit

### Layouts

- Layouts auto-save on every change
- Open the **Layouts** panel in the sidebar to save, load, or delete named layouts
- **Cmd/Ctrl+S** to quick-save the current layout

### Auto-Launch Claude Code

1. Open **Settings** in the sidebar
2. Toggle **Auto-Launch Claude** on
3. Optionally change the command (default: `claude`)
4. New terminals will now auto-run the Claude command after shell init

## Keyboard Shortcuts

All shortcuts use `Cmd` on macOS and `Ctrl` on Windows.

### Session Management

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+N` | New terminal session |
| `Cmd/Ctrl+W` | Close focused session |
| `Cmd/Ctrl+Tab` | Cycle to next session |
| `Cmd/Ctrl+Shift+Tab` | Cycle to previous session |
| `Cmd/Ctrl+1`-`9` | Focus session by index |
| `Cmd/Ctrl+D` | Duplicate element |
| `Cmd/Ctrl+Backspace` | Delete selected |
| `Cmd/Ctrl+A` | Select all |

### Split Panes

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+\` | Split horizontal |
| `Cmd/Ctrl+Shift+\` | Split vertical |
| `Cmd/Ctrl+Alt+Arrow` | Navigate panes |
| `Cmd/Ctrl+Shift+W` | Close pane |

### Canvas & Navigation

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+0` | Reset zoom to 100% |
| `Cmd/Ctrl+=` | Zoom in |
| `Cmd/Ctrl+-` | Zoom out |
| `Cmd/Ctrl+P` | Command palette |
| `Cmd/Ctrl+Shift+F` | Search all sessions |
| `Cmd/Ctrl+Shift+A` | Auto layout |
| `Cmd/Ctrl+Shift+E` | Export canvas as PNG |
| `Cmd/Ctrl+Shift+J` | Pin/unpin to viewport |
| `Cmd/Ctrl+Shift+.` | Toggle focus mode |
| `Escape` | Unfocus element |
| `Space+Drag` | Pan canvas |
| `Middle-click+Drag` | Pan canvas |
| `Ctrl+Scroll` | Zoom toward cursor |

### Files & Code

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+E` | Toggle file viewer edit mode |
| `Cmd/Ctrl+G` | Go to line |
| `Cmd/Ctrl+F` | Find in terminal |
| `Cmd/Ctrl+Shift+I` | Show import dependency graph |
| `Cmd/Ctrl+Shift+T` | Open terminal here |
| `Cmd/Ctrl+Shift+K` | New snippet |

### Groups

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Shift+G` | Toggle group collapse |
| `Cmd/Ctrl+Shift+B` | Toggle broadcast mode |
| `Cmd/Ctrl+Alt+G` | Group selected elements |

### Layout & Settings

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+S` | Save layout |
| `Cmd/Ctrl+,` | Open settings |
| `Cmd/Ctrl+/` | Keyboard shortcuts help |
| `Cmd/Ctrl+L` | Toggle AI chat panel |
| `Cmd/Ctrl+B` | Add bookmark |
| `Cmd/Ctrl+K` | Save bookmark |
| `F5` | Start presentation mode |

## Configuration

Settings are accessible from the sidebar's **Settings** panel or via `Cmd/Ctrl+,`.

| Option | Default | Description |
|---|---|---|
| Default Shell | System default | Shell to spawn (e.g., `/bin/zsh`, `powershell.exe`) |
| Auto-Launch Claude | `false` | Run Claude Code command in every new terminal |
| Claude Command | `claude` | Command to execute for Claude Code |
| Grid Size | `20` px | Grid cell size for snapping (10-50 px) |
| Sidebar Position | `left` | Sidebar placement (`left` or `right`) |
| Theme | `dark` | UI color scheme (`dark`, `light`, `catppuccin-mocha`, `dracula`, `nord`, `solarized-dark`) |
| Default CWD | App's CWD | Default working directory for new terminals |

Config is stored as JSON by [electron-store](https://github.com/sindresorhus/electron-store) at:
- **macOS:** `~/Library/Application Support/Smoke/smoke-config.json`
- **Windows:** `%APPDATA%/Smoke/smoke-config.json`

The config file is human-readable and can be edited by hand.

## Architecture

Smoke is an Electron app with three process layers:

```
┌──────────────────────────────────────────────────────────┐
│  Main Process                                            │
│  ├── PtyManager / PtyProcess        (node-pty)           │
│  ├── AiService / AgentManager       (Anthropic SDK)      │
│  ├── ConfigStore                    (electron-store)     │
│  ├── CodeGraph (graphBuilder,       (import analysis,    │
│  │     importParser, importResolver,  reverse index,     │
│  │     ReverseIndex, layoutEngine)    force-directed)    │
│  ├── SearchIndex                    (full-text search)   │
│  ├── StructureAnalyzer              (project analysis)   │
│  ├── RelevanceScorer / TaskParser   (context assembly)   │
│  ├── File system operations + watcher                    │
│  └── IPC Handlers                                        │
├──────────────────────────────────────────────────────────┤
│  Preload (contextBridge → window.smokeAPI)                │
│  Namespaces: pty, layout, bookmark, config, fs, app, ai, │
│    agent, recording, canvas, project, tab, task,          │
│    relevance, codegraph, search, structure                │
├──────────────────────────────────────────────────────────┤
│  Renderer Process                                        │
│  ├── React 18 + Zustand stores (16 stores)               │
│  ├── Canvas (pan/zoom, grid, viewport culling, minimap)  │
│  ├── TerminalWidget (xterm.js + WebGL + split panes)     │
│  ├── FileViewerWidget (Shiki) / FileEditorWidget (CM6)   │
│  ├── SnippetWindow (CodeMirror code editor)              │
│  ├── WebviewWindow (embedded localhost views)            │
│  ├── ImageWindow (canvas image display)                  │
│  ├── NoteWindow (sticky notes)                           │
│  ├── ConnectorLayer (SVG arrows)                         │
│  ├── RegionShape (canvas regions)                        │
│  ├── GroupContainer (terminal groups)                     │
│  ├── AI chat panel (streaming, multi-agent, tools)       │
│  ├── DepGraph (dependency graph visualization)           │
│  ├── CommandPalette (fuzzy search + actions)             │
│  ├── PresentationMode (bookmark-based slides)            │
│  ├── Recording / Replay engine                           │
│  ├── TabBar (multi-workspace tabs)                       │
│  ├── StatusBar (zoom, counts, git branch)                │
│  ├── Sidebar (sessions, file tree, layouts, bookmarks)   │
│  ├── Window chrome (drag, resize, snap, lock, pin)       │
│  └── Config panel + Themes (6 built-in)                  │
└──────────────────────────────────────────────────────────┘
```

### Data Flows

- **Terminal I/O:** `keystroke → xterm.js → IPC → PTY → IPC → xterm.js → screen`
- **AI streaming:** `user message → IPC → Claude API → stream deltas → IPC → chat panel`
- **File editing:** `CodeMirror edit → save (Mod+S) → IPC → fs.writeFile → confirmation`
- **Dependency graph:** `file path → IPC → BFS import parsing → graph data → IPC → file viewers + connectors + regions`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture guide.

### Element Types

The canvas supports six element types, all managed through `sessionStore`:

| Type | Description |
|---|---|
| **Terminal** | PTY-backed interactive shell with split panes, working directory, status tracking, and col/row sizing |
| **File** | File viewer (Shiki) or editor (CodeMirror) with language detection and dirty state |
| **Snippet** | CodeMirror code editor with language selector for quick code editing |
| **Note** | Colored sticky note with resizable textarea |
| **WebView** | Embedded web browser for localhost URLs with navigation controls |
| **Image** | Image display with aspect-ratio-aware resizing |

All elements share: unique ID, title, canvas position (x, y), size (width, height), z-index, optional group membership, lock state, and pin state.

### Key Directories

```
src/
├── main/                 # Electron main process
│   ├── pty/              #   PTY lifecycle management
│   ├── ai/              #   Claude API streaming, multi-agent orchestration, tools
│   ├── codegraph/       #   Dependency graph, import parsing, reverse index,
│   │                    #     search index, structure analysis, relevance scoring
│   ├── ipc/             #   IPC channel definitions & handlers
│   ├── config/          #   Persistent config store
│   └── watcher/         #   File system watcher
├── preload/             # Context bridge (smokeAPI)
└── renderer/            # React application
    ├── canvas/          #   Canvas, grid, viewport culling, minimap, regions,
    │                    #     connectors, groups, export
    ├── terminal/        #   xterm.js widget, registry, thumbnails
    ├── fileviewer/      #   Shiki viewer, CodeMirror editor, language support
    ├── snippet/         #   Code snippet editor windows
    ├── webview/         #   Embedded web view windows
    ├── image/           #   Image display windows
    ├── note/            #   Sticky note windows
    ├── depgraph/        #   Dependency graph visualization + materialization
    ├── ai/              #   AI chat panel, streaming, tool rendering
    ├── palette/         #   Command palette + command registry
    ├── presentation/    #   Presentation mode + slide navigation
    ├── bookmarks/       #   Bookmark save/load panel
    ├── search/          #   Full-text search across canvas elements
    ├── recording/       #   Event recorder
    ├── replay/          #   Replay engine, playback controls
    ├── tabs/            #   Multi-workspace tab bar
    ├── statusbar/       #   Status bar (zoom, counts, git branch)
    ├── window/          #   Window chrome, drag, resize, snap
    ├── session/         #   Session create/close
    ├── sidebar/         #   Session list, file tree, group headers
    ├── layout/          #   Layout save/load panel, auto layout
    ├── config/          #   Settings panel
    ├── themes/          #   6 built-in color schemes
    ├── toast/           #   Toast notification system
    ├── stores/          #   Zustand state (16 stores — see below)
    ├── shortcuts/       #   Keyboard shortcut resolution
    └── styles/          #   CSS
```

### State Management

Zustand stores in `src/renderer/stores/`:

| Store | Purpose |
|---|---|
| `sessionStore` | Session map — all element types, position, size, focus, z-index, lock, pin |
| `canvasStore` | Viewport pan (x, y) and zoom level |
| `gridStore` | Grid size, snap enabled, visibility |
| `groupStore` | Terminal groups — name, color, members, collapse, broadcast |
| `agentStore` | AI agent state — identity, color, role, group assignment |
| `aiStore` | AI panel state and configuration |
| `connectorStore` | Arrow connectors between elements |
| `regionStore` | Canvas regions — name, color, position, size |
| `snapshotStore` | Terminal text snapshots for thumbnail mode |
| `snapPreviewStore` | Grid snap preview overlay during drag/resize |
| `preferencesStore` | User settings (shell, grid, sidebar, theme, etc.) |
| `splitPaneStore` | Split pane tree structure per session |
| `tabStore` | Multi-workspace tab state and switching |
| `activityStore` | Activity indicators for off-screen terminals |
| `focusModeStore` | Focus mode toggle (dim unconnected elements) |
| `toastStore` | Toast notification queue |

### Performance

- **Viewport culling** — elements outside the visible area (+200px margin) are not rendered
- **Semantic zoom** — at zoom < 0.4, elements show static thumbnails instead of interactive widgets
- **Terminal registry** — off-screen terminals keep their scrollback in memory; xterm DOM is detached, not destroyed
- **WebGL rendering** — xterm uses the WebGL addon; GPU contexts are disposed after 60s off-screen
- **Ref-based updates** — pan/zoom during drag uses refs and CSS transforms, debounced sync to Zustand (100ms)
- **Background indexing** — search index, reverse dependency index, and structure analysis build incrementally in batches to avoid blocking

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 33 |
| Build Tool | electron-vite (Vite 5) |
| UI | React 18 |
| State | Zustand 5 |
| Terminal | xterm.js 5 (WebGL + fit + search addons) |
| Code Editor | CodeMirror 6 (oneDark theme) |
| Syntax Highlighting | Shiki 4 |
| Markdown | Marked 17 |
| AI | Anthropic SDK 0.78 (Claude API) |
| PTY | node-pty 1.0 |
| Persistence | electron-store 10 |
| Language | TypeScript 5.7 (strict) |
| Tests | Vitest 4 |
| Packaging | electron-builder 25 |

## Building from Source

### Development

```bash
npm run dev          # Start with HMR (renderer + main hot-reload)
```

### Production Build

```bash
npm run build        # Build main, preload, and renderer bundles
npm run start        # Preview the production build
```

### Packaging

```bash
npm run package:mac  # macOS DMG + ZIP (x64 + arm64)
npm run package:win  # Windows NSIS installer (x64)
npm run package:all  # Both platforms
```

Build artifacts are output to `dist/`.

### Native Module Rebuild

If you switch Node or Electron versions:

```bash
npm run rebuild      # Rebuild node-pty against current Electron headers
```

## Testing

```bash
npx vitest           # Watch mode
npx vitest run       # Run all tests once
```

Tests cover stores, canvas logic, viewport culling, terminal registry, window interactions, layout persistence, config, sidebar, shortcuts, session lifecycle, AI streaming, recording/replay, file viewer, code intelligence, IPC handlers, and search.

## License

MIT
