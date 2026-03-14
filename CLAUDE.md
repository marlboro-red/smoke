# Smoke — AI Agent Guide

Infinite canvas terminal manager built with Electron + React + xterm.js.

## Architecture

Three-process Electron app:
- **Main** (`src/main/`): PTY management (node-pty), IPC handlers, config persistence (electron-store)
- **Preload** (`src/preload/`): Typed `window.smokeAPI` bridge via contextBridge
- **Renderer** (`src/renderer/`): React 18 UI, Zustand state, xterm.js terminals

## Key Files

| File | Purpose |
|---|---|
| `src/main/index.ts` | App entry, BrowserWindow creation, lifecycle |
| `src/main/ipc/channels.ts` | IPC channel constants + message type interfaces |
| `src/main/ipc/ipcHandlers.ts` | All IPC handler registrations |
| `src/main/pty/PtyManager.ts` | PTY process pool (spawn/write/resize/kill) |
| `src/main/pty/PtyProcess.ts` | Single PTY wrapper around node-pty |
| `src/main/config/ConfigStore.ts` | Preferences + layout schema, electron-store instance |
| `src/preload/index.ts` | smokeAPI exposure: pty, layout, config namespaces |
| `src/renderer/App.tsx` | Root component: sidebar + canvas, init hooks |
| `src/renderer/canvas/Canvas.tsx` | Infinite canvas with viewport culling |
| `src/renderer/canvas/useCanvasControls.ts` | Pan/zoom via refs + CSS transform3d |
| `src/renderer/canvas/useViewportCulling.ts` | Only render visible sessions |
| `src/renderer/terminal/TerminalWidget.tsx` | xterm.js integration + PTY I/O |
| `src/renderer/terminal/terminalRegistry.ts` | Terminal lifecycle + WebGL addon management |
| `src/renderer/stores/sessionStore.ts` | Session CRUD, focus, z-index |
| `src/renderer/stores/canvasStore.ts` | Pan, zoom, grid size |
| `src/renderer/stores/preferencesStore.ts` | User preferences mirror |
| `src/renderer/shortcuts/shortcutMap.ts` | Shortcut definitions + resolution |
| `src/renderer/shortcuts/useKeyboardShortcuts.ts` | Global capture-phase keyboard handler |
| `src/renderer/layout/useLayoutPersistence.ts` | Auto-save + named layout save/restore |
| `src/renderer/config/ConfigPanel.tsx` | Settings panel UI |

## Commands

```bash
npm run dev              # Development with HMR
npm run build            # Production build
npm run start            # Preview production build
npm run rebuild          # Rebuild node-pty for Electron
npm run package:mac      # Package for macOS (DMG + ZIP)
npm run package:win      # Package for Windows (NSIS)
npx vitest run           # Run all tests
npx vitest run <path>    # Run specific test file
```

## Important Conventions

### Performance-Critical Paths
- **Use refs, not state**, for values that change every frame (pan/zoom during drag)
- Apply CSS transforms directly to DOM nodes, then debounce sync to Zustand (100ms)
- Use **fire-and-forget IPC** (`send`/`on`) for data channels (keystrokes, shell output) — never `invoke`/`handle`
- Viewport culling: only render sessions within viewport + 200px margin
- Thumbnail mode at zoom < 0.4: swap xterm.js for text snapshots
- WebGL addons: dispose after 60s off-screen, recreate on re-enter

### IPC Patterns
- Request/response: `ipcRenderer.invoke()` ↔ `ipcMain.handle()` — for spawn, resize, kill, layout, config
- Fire-and-forget: `ipcRenderer.send()` ↔ `ipcMain.on()` — for `pty:data:to-pty`
- Push from main: `webContents.send()` — for `pty:data:from-pty`, `pty:exit`

### Zustand Stores
- Use vanilla `createStore()` with React hook wrappers
- Define selector hooks next to the store (`useSessionList`, `useFocusedId`, etc.)
- For non-React code, use `store.getState()` directly

### Terminal Lifecycle
- `terminalRegistry` keeps terminals alive when they leave the viewport
- Terminals are reattached to new DOM elements (not recreated) when re-entering viewport
- WebGL addon is disposed after 60s hidden, recreated on reattach

### Grid Snapping
- All positions and sizes snap to grid on release (not during drag)
- Grid size is configurable (10–50px, default 20)
- Snap utilities in `src/renderer/window/useSnapping.ts`

### node-pty
- Must be externalized from Vite bundle (native C++ addon)
- `npm run rebuild` recompiles against Electron's Node headers
- Listed in `asarUnpack` for electron-builder

## Testing

Tests use Vitest. Test files in `__tests__/` directories alongside source.
Mock `window.smokeAPI` for renderer tests that call IPC.

## Config

Preferences stored via electron-store at:
- macOS: `~/Library/Application Support/Smoke/smoke-config.json`
- Windows: `%APPDATA%/Smoke/smoke-config.json`

Key preferences: `defaultShell`, `autoLaunchClaude`, `claudeCommand`, `gridSize`, `sidebarPosition`, `sidebarWidth`, `theme`, `defaultCwd`.
