# Smoke

A spatial terminal canvas. Arrange multiple terminal windows on an infinite 2D plane with pan, zoom, and grid snapping.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey)

## Features

- **Infinite canvas** — pan and zoom freely across a 2D workspace
- **Multiple terminals** — spawn terminal windows anywhere on the canvas
- **Grid snapping** — align windows to a configurable grid
- **Viewport culling** — only renders visible terminals for smooth performance at scale
- **Thumbnail mode** — zoomed-out terminals display text snapshots instead of live renders
- **Layout persistence** — auto-saves your workspace; save/load named layouts
- **Sidebar** — browse, reorder, and focus sessions from a session list
- **Configurable** — choose your shell, grid size, sidebar position, default working directory
- **Cross-platform** — packaged for macOS (DMG/ZIP, x64 + arm64) and Windows (NSIS installer)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm

### Install

```bash
git clone <repo-url>
cd smoke
npm install
```

The `postinstall` script automatically builds the project and rebuilds the native `node-pty` module for your platform.

### Development

```bash
npm run dev
```

Opens the app in development mode with hot reload for the renderer process.

### Build & Package

```bash
# Compile TypeScript
npm run build

# Package for macOS
npm run package:mac

# Package for Windows
npm run package:win

# Package for both
npm run package:all
```

Packaged apps are output to the `dist/` directory.

### Rebuild native modules

If you switch Node or Electron versions:

```bash
npm run rebuild
```

## Usage

### Canvas Navigation

| Action | Input |
|---|---|
| Pan | Click and drag on empty canvas |
| Zoom | Scroll wheel / pinch |
| New terminal | Double-click empty canvas |

### Keyboard Shortcuts

All shortcuts use `Cmd` on macOS and `Ctrl` on Windows/Linux.

| Shortcut | Action |
|---|---|
| `Mod+N` | New session |
| `Mod+W` | Close focused session |
| `Mod+Tab` | Next session |
| `Shift+Mod+Tab` | Previous session |
| `Mod+1` – `Mod+9` | Focus session by index |
| `Mod+0` | Reset zoom |
| `Mod+=` | Zoom in |
| `Mod+-` | Zoom out |
| `Mod+S` | Save layout |
| `Mod+,` | Open settings |
| `Esc` | Unfocus terminal |

### Window Management

- **Move** — drag the title bar
- **Resize** — drag the edge handles
- **Focus** — click a terminal window or use sidebar/shortcuts

### Settings

Open with `Mod+,` or from the sidebar. Configurable options:

- Default shell
- Default working directory
- Grid size (10–50px)
- Sidebar position (left/right)
- Auto-launch Claude on new terminals

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

### Key directories

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
    ├── session/    #   Session create/close/shortcuts
    ├── sidebar/    #   Session list sidebar
    ├── layout/     #   Layout save/load panel
    ├── config/     #   Settings panel
    ├── stores/     #   Zustand state (session, canvas, grid, prefs, snapshots)
    ├── shortcuts/  #   Keyboard shortcut resolution
    └── styles/     #   CSS
```

### State management

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
| Desktop framework | Electron 33 |
| UI | React 18 |
| State | Zustand 5 |
| Terminal emulator | xterm.js 5 (WebGL + fit addons) |
| PTY | node-pty |
| Persistence | electron-store |
| Build | electron-vite + Vite |
| Packaging | electron-builder |
| Language | TypeScript 5.7 |
| Tests | Vitest |

## Testing

```bash
npx vitest
```

Tests cover stores, canvas logic, viewport culling, terminal registry, window interactions, layout persistence, config, sidebar, shortcuts, and session lifecycle.

## License

Private — all rights reserved.
