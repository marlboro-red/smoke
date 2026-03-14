# Smoke

Infinite canvas terminal manager for orchestrating multiple Claude Code sessions.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey)

<!-- TODO: Add screenshot/GIF showing the canvas with multiple terminals -->

## Features

- **Infinite canvas** — pan and zoom freely across a 2D workspace
- **Multiple terminals** — spawn terminal windows anywhere on the canvas
- **Grid snapping** — align windows to a configurable grid
- **Real PTY terminals** — full terminal emulation via node-pty and xterm.js with WebGL rendering
- **Viewport culling** — only renders visible terminals for smooth performance at scale
- **Thumbnail mode** — zoomed-out terminals display text snapshots instead of live renders
- **Layout persistence** — auto-saves your workspace; save/load named layouts
- **Sidebar** — browse, reorder, and focus sessions from a session list
- **Auto-launch Claude Code** — optionally start Claude Code in every new terminal
- **Configurable** — choose your shell, grid size, sidebar position, default working directory
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

### Creating Terminals

- **Double-click** on the canvas to create a new terminal at that position
- **Cmd/Ctrl+N** to create a new terminal at the center of the viewport
- Click **"+ New"** in the sidebar

### Canvas Navigation

| Action | Input |
|---|---|
| Pan | Scroll, middle-click drag, or Space+drag |
| Zoom | Ctrl+Scroll (zooms toward cursor) |
| New terminal | Double-click empty canvas |

### Managing Sessions

- Click a terminal to focus it — keystrokes go to that terminal's shell
- Press **Escape** to unfocus and return to canvas navigation
- Click a session in the sidebar to focus and pan to it
- Double-click a terminal's title bar to rename it

### Window Management

- **Move** — drag the title bar
- **Resize** — drag the edge handles
- **Focus** — click a terminal window or use sidebar/shortcuts

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
| `Escape` | Unfocus terminal (return to canvas) |
| `Space+Drag` | Pan canvas (when no terminal focused) |
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
| Default CWD | App's CWD | Default working directory for new terminals |

Config is stored as JSON by [electron-store](https://github.com/sindresorhus/electron-store) at:
- **macOS:** `~/Library/Application Support/Smoke/smoke-config.json`
- **Windows:** `%APPDATA%/Smoke/smoke-config.json`

The config file is human-readable and can be edited by hand.

## Architecture

Smoke is an Electron app with three process layers:

```
┌─────────────────────────────────────────────────┐
│  Main Process                                   │
│  ├── PtyManager / PtyProcess  (node-pty)        │
│  ├── ConfigStore              (electron-store)  │
│  └── IPC Handlers                               │
├─────────────────────────────────────────────────┤
│  Preload (contextBridge → window.smokeAPI)       │
├─────────────────────────────────────────────────┤
│  Renderer Process                               │
│  ├── React + Zustand stores                     │
│  ├── Canvas (pan/zoom, grid, viewport culling)  │
│  ├── TerminalWidget (xterm.js + WebGL)          │
│  ├── Window chrome (drag, resize, snap)         │
│  ├── Sidebar + Layout panel                     │
│  └── Config panel                               │
└─────────────────────────────────────────────────┘
```

Data flows: `keystroke → xterm.js → IPC → PTY → IPC → xterm.js → screen`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture guide.

### Key Directories

```
src/
├── main/           # Electron main process
│   ├── pty/        #   PTY lifecycle management
│   ├── ipc/        #   IPC channel definitions & handlers
│   └── config/     #   Persistent config store
├── preload/        # Context bridge (smokeAPI)
└── renderer/       # React application
    ├── canvas/     #   Canvas, grid, viewport culling
    ├── terminal/   #   xterm.js widget, registry, thumbnails
    ├── window/     #   Window chrome, drag, resize, snap
    ├── session/    #   Session create/close
    ├── sidebar/    #   Session list sidebar
    ├── layout/     #   Layout save/load panel
    ├── config/     #   Settings panel
    ├── stores/     #   Zustand state (session, canvas, grid, prefs, snapshots)
    ├── shortcuts/  #   Keyboard shortcut resolution
    └── styles/     #   CSS
```

### State Management

Zustand stores in `src/renderer/stores/`:

| Store | Purpose |
|---|---|
| `sessionStore` | Session map (position, size, focus, z-index) |
| `canvasStore` | Viewport pan (x, y) and zoom level |
| `gridStore` | Grid size, snap enabled, visibility |
| `preferencesStore` | User settings (shell, grid, sidebar, etc.) |
| `snapshotStore` | Terminal text snapshots for thumbnail mode |

### Performance

- **Viewport culling** — terminals outside the visible area (+200px margin) are not rendered
- **Thumbnail mode** — at zoom < 0.4, terminals show a static text snapshot instead of a live xterm instance
- **Terminal registry** — off-screen terminals keep their scrollback in memory; xterm DOM is detached, not destroyed
- **WebGL rendering** — xterm uses the WebGL addon; GPU contexts are disposed after 60s off-screen

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 33 |
| Build Tool | electron-vite (Vite 5) |
| UI | React 18 |
| State | Zustand 5 |
| Terminal | xterm.js 5 (WebGL + fit addons) |
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

Tests cover stores, canvas logic, viewport culling, terminal registry, window interactions, layout persistence, config, sidebar, shortcuts, and session lifecycle.

## License

MIT
