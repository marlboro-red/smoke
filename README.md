# Smoke

Infinite canvas workspace for orchestrating terminals, files, notes, and AI agents on a spatial 2D surface.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey)

<!-- TODO: Add screenshot/GIF showing the canvas with multiple terminals -->

## Features

### Canvas & Navigation
- **Infinite canvas** — pan and zoom freely across a 2D workspace
- **Grid snapping** — align elements to a configurable grid with snap preview overlay
- **Semantic zoom** — elements switch between interactive and thumbnail modes at zoom < 0.4
- **Viewport culling** — only renders visible elements for smooth performance at scale

### Terminals
- **Multiple terminals** — spawn terminal windows anywhere on the canvas
- **Real PTY terminals** — full terminal emulation via node-pty and xterm.js with WebGL rendering
- **Terminal groups** — organize terminals into named, colored groups with broadcast mode (send keystrokes to all group members simultaneously)
- **Auto-launch Claude Code** — optionally start Claude Code in every new terminal

### File Viewer & Editor
- **File viewer** — read-only file viewing with Shiki syntax highlighting
- **File editor** — CodeMirror 6 editor with language support for TypeScript, JavaScript, Python, HTML, CSS, JSON, Markdown, Rust, C++, Java, Go, YAML, XML, SQL, PHP
- **File tree panel** — sidebar file browser with lazy-loaded directory expansion, file type icons, and smart filtering

### Canvas Annotations
- **Sticky notes** — colored notes (yellow, pink, blue, green, purple) that live on the canvas
- **Connectors** — arrow connectors between any canvas elements with bezier curves, optional labels, and custom colors

### AI Integration
- **AI orchestrator chat panel** — streaming chat interface powered by Claude API
- **Multi-agent support** — create multiple independent AI agents with unique names, colors, and roles
- **Agent scoping** — assign agents to terminal groups to restrict their access
- **Tool use** — agents can spawn terminals, write to terminals, read files, list sessions, move/resize elements, and inspect canvas state

### Session Recording & Replay
- **Event recording** — captures canvas events (session creation, moves, resizes, terminal snapshots, AI messages)
- **Replay engine** — frame-by-frame playback with speed control (0.5x–2x), seek, and progress tracking
- **Canvas lockdown** — canvas is read-only during replay to prevent interference

### Workspace Management
- **Layout persistence** — auto-saves your workspace; save/load named layouts
- **Sidebar** — browse, reorder, and focus sessions; access file tree, layouts, and settings
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
- Click **"+ New"** in the sidebar
- Double-click a file in the **File Tree** sidebar panel to open it in a file viewer
- Create sticky notes and connectors from the canvas context menu or AI actions

### Canvas Navigation

| Action | Input |
|---|---|
| Pan | Scroll, middle-click drag, or Space+drag |
| Zoom | Ctrl+Scroll (zooms toward cursor) |
| New terminal | Double-click empty canvas |

### Managing Sessions

- Click an element to focus it
- Press **Escape** to unfocus and return to canvas navigation
- Click a session in the sidebar to focus and pan to it
- Double-click a title bar to rename it

### Window Management

- **Move** — drag the title bar
- **Resize** — drag the edge handles
- **Focus** — click an element or use sidebar/shortcuts
- All positions and sizes snap to grid on release

### Terminal Groups

- Create named, colored groups to organize related terminals
- **Broadcast mode** (`Cmd/Ctrl+Shift+B`) — send keystrokes to all terminals in the focused group
- **Collapse groups** (`Cmd/Ctrl+Shift+G`) — hide group members into a compact card
- Assign AI agents to groups for scoped control

### File Editing

- Open files from the file tree panel in the sidebar
- Toggle between read-only view (Shiki) and edit mode (CodeMirror)
- Save changes with **Mod+S** in the editor
- Unsaved changes are tracked with a dirty indicator

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

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+N` | New session |
| `Cmd/Ctrl+W` | Close focused session |
| `Cmd/Ctrl+Tab` | Cycle to next session |
| `Cmd/Ctrl+Shift+Tab` | Cycle to previous session |
| `Cmd/Ctrl+1`–`9` | Focus session by index (creation order) |
| `Cmd/Ctrl+0` | Reset zoom to 100% |
| `Cmd/Ctrl+=` | Zoom in |
| `Cmd/Ctrl+-` | Zoom out |
| `Cmd/Ctrl+S` | Save layout |
| `Cmd/Ctrl+,` | Open settings |
| `Cmd/Ctrl+L` | Toggle AI chat panel |
| `Cmd/Ctrl+Shift+G` | Toggle group collapse |
| `Cmd/Ctrl+Shift+B` | Toggle broadcast mode |
| `Escape` | Unfocus element (return to canvas) |
| `Space+Drag` | Pan canvas (when no element focused) |
| `Middle-click+Drag` | Pan canvas |
| `Ctrl+Scroll` | Zoom toward cursor |

## Configuration

Settings are accessible from the sidebar's **Settings** panel or via `Cmd/Ctrl+,`.

| Option | Default | Description |
|---|---|---|
| Default Shell | System default | Shell to spawn (e.g., `/bin/zsh`, `powershell.exe`) |
| Auto-Launch Claude | `false` | Run Claude Code command in every new terminal |
| Claude Command | `claude` | Command to execute for Claude Code |
| Grid Size | `20` px | Grid cell size for snapping (10–50 px) |
| Sidebar Position | `left` | Sidebar placement (`left` or `right`) |
| Theme | `dark` | UI theme |
| Default CWD | App's CWD | Default working directory for new terminals |

Config is stored as JSON by [electron-store](https://github.com/sindresorhus/electron-store) at:
- **macOS:** `~/Library/Application Support/Smoke/smoke-config.json`
- **Windows:** `%APPDATA%/Smoke/smoke-config.json`

The config file is human-readable and can be edited by hand.

## Architecture

Smoke is an Electron app with three process layers:

```
┌──────────────────────────────────────────────────────┐
│  Main Process                                        │
│  ├── PtyManager / PtyProcess    (node-pty)           │
│  ├── AiService / AgentManager   (Anthropic SDK)      │
│  ├── ConfigStore                (electron-store)     │
│  ├── File system operations                          │
│  └── IPC Handlers                                    │
├──────────────────────────────────────────────────────┤
│  Preload (contextBridge → window.smokeAPI)            │
│  Namespaces: pty, layout, config, fs, app, ai, agent,│
│              recording                               │
├──────────────────────────────────────────────────────┤
│  Renderer Process                                    │
│  ├── React + Zustand stores                          │
│  ├── Canvas (pan/zoom, grid, viewport culling)       │
│  ├── TerminalWidget (xterm.js + WebGL)               │
│  ├── FileViewerWidget (Shiki) / FileEditorWidget     │
│  │   (CodeMirror)                                    │
│  ├── NoteWindow (sticky notes)                       │
│  ├── ConnectorLayer (SVG arrows)                     │
│  ├── GroupContainer (terminal groups)                 │
│  ├── AI chat panel (streaming, multi-agent)           │
│  ├── Recording / Replay engine                       │
│  ├── Sidebar (sessions, file tree, layouts)           │
│  ├── Window chrome (drag, resize, snap)              │
│  └── Config panel                                    │
└──────────────────────────────────────────────────────┘
```

### Data Flows

- **Terminal I/O:** `keystroke → xterm.js → IPC → PTY → IPC → xterm.js → screen`
- **AI streaming:** `user message → IPC → Claude API → stream deltas → IPC → chat panel`
- **File editing:** `CodeMirror edit → save (Mod+S) → IPC → fs.writeFile → confirmation`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture guide.

### Element Types

The canvas supports three element types, all managed through `sessionStore`:

| Type | Description |
|---|---|
| **Terminal** | PTY-backed interactive shell with working directory, status tracking, and col/row sizing |
| **File** | File viewer (Shiki) or editor (CodeMirror) with language detection and dirty state |
| **Note** | Colored sticky note with resizable textarea |

All elements share: unique ID, title, canvas position (x, y), size (width, height), z-index, and optional group membership.

### Key Directories

```
src/
├── main/               # Electron main process
│   ├── pty/            #   PTY lifecycle management
│   ├── ai/             #   Claude API streaming, multi-agent orchestration, tools
│   ├── ipc/            #   IPC channel definitions & handlers
│   └── config/         #   Persistent config store
├── preload/            # Context bridge (smokeAPI)
└── renderer/           # React application
    ├── canvas/         #   Canvas, grid, viewport culling, connectors, groups
    ├── terminal/       #   xterm.js widget, registry, thumbnails
    ├── fileviewer/     #   Shiki viewer, CodeMirror editor, language support
    ├── note/           #   Sticky note windows
    ├── ai/             #   AI chat panel, streaming, tool rendering
    ├── recording/      #   Event recorder
    ├── replay/         #   Replay engine, playback controls
    ├── window/         #   Window chrome, drag, resize, snap
    ├── session/        #   Session create/close
    ├── sidebar/        #   Session list, file tree, group headers
    ├── layout/         #   Layout save/load panel
    ├── config/         #   Settings panel
    ├── stores/         #   Zustand state (session, canvas, grid, group, agent,
    │                   #     connector, snapshot, snapPreview, preferences, ai)
    ├── shortcuts/      #   Keyboard shortcut resolution
    └── styles/         #   CSS
```

### State Management

Zustand stores in `src/renderer/stores/`:

| Store | Purpose |
|---|---|
| `sessionStore` | Session map — all element types (terminal, file, note), position, size, focus, z-index |
| `canvasStore` | Viewport pan (x, y) and zoom level |
| `gridStore` | Grid size, snap enabled, visibility |
| `groupStore` | Terminal groups — name, color, members, collapse, broadcast |
| `agentStore` | AI agent state — identity, color, role, group assignment |
| `connectorStore` | Arrow connectors between elements |
| `snapshotStore` | Terminal text snapshots for thumbnail mode |
| `snapPreviewStore` | Grid snap preview overlay during drag/resize |
| `preferencesStore` | User settings (shell, grid, sidebar, theme, etc.) |

### Performance

- **Viewport culling** — elements outside the visible area (+200px margin) are not rendered
- **Semantic zoom** — at zoom < 0.4, elements show static thumbnails instead of interactive widgets
- **Terminal registry** — off-screen terminals keep their scrollback in memory; xterm DOM is detached, not destroyed
- **WebGL rendering** — xterm uses the WebGL addon; GPU contexts are disposed after 60s off-screen
- **Ref-based updates** — pan/zoom during drag uses refs and CSS transforms, debounced sync to Zustand (100ms)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 33 |
| Build Tool | electron-vite (Vite 5) |
| UI | React 18 |
| State | Zustand 5 |
| Terminal | xterm.js 5 (WebGL + fit addons) |
| Code Editor | CodeMirror 6 (oneDark theme) |
| Syntax Highlighting | Shiki 4 |
| AI | Anthropic SDK (Claude API) |
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

Tests cover stores, canvas logic, viewport culling, terminal registry, window interactions, layout persistence, config, sidebar, shortcuts, session lifecycle, AI streaming, recording/replay, and file viewer.

## License

MIT
