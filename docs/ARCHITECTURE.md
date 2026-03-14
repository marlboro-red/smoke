# Smoke Architecture

## Three-Process Architecture

Smoke follows Electron's standard three-process model with strict isolation:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Process                              │
│  ┌──────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │ PtyManager│  │ ipcHandlers.ts│  │ ConfigStore (electron-store)│ │
│  │  ├ spawn  │  │  ├ pty:*      │  │  ├ preferences            │ │
│  │  ├ write  │  │  ├ layout:*   │  │  ├ defaultLayout          │ │
│  │  ├ resize │  │  └ config:*   │  │  └ namedLayouts           │ │
│  │  └ kill   │  └───────────────┘  └───────────────────────────┘ │
│  └──────────┘                                                    │
└──────────────────────────┬───────────────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────┴───────────────────────────────────────┐
│                      Preload Script                               │
│  contextBridge.exposeInMainWorld('smokeAPI', {                    │
│    pty:    { spawn, write, resize, kill, onData, onExit }        │
│    layout: { save, load, list, delete }                          │
│    config: { get, set }                                          │
│  })                                                              │
└──────────────────────────┬───────────────────────────────────────┘
                           │ window.smokeAPI
┌──────────────────────────┴───────────────────────────────────────┐
│                     Renderer Process                              │
│  ┌────────┐ ┌──────────┐ ┌────────────┐ ┌────────────────────┐  │
│  │ Canvas │ │ Terminal  │ │ Sidebar    │ │ Zustand Stores     │  │
│  │  ├ Grid│ │  ├ Widget │ │  ├ Sessions│ │  ├ sessionStore    │  │
│  │  ├ Pan │ │  ├ Chrome │ │  ├ Layouts │ │  ├ canvasStore     │  │
│  │  └ Zoom│ │  └ Thumb  │ │  └ Config  │ │  ├ preferencesStore│  │
│  └────────┘ └──────────┘ └────────────┘ │  ├ gridStore       │  │
│                                          │  └ snapshotStore   │  │
│                                          └────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Main Process (`src/main/`)

The main process owns all Node.js-level resources:

- **PtyManager / PtyProcess** — Spawns and manages shell processes via `node-pty`. Each PTY gets a unique ID, runs in `xterm-256color` mode, and validates shell paths before launch.
- **ipcHandlers** — Registers all IPC channel handlers. Request/response channels use `ipcMain.handle()`, data-streaming channels use `ipcMain.on()`.
- **ConfigStore** — Wraps `electron-store` for JSON-based persistence of preferences and layouts.

### Preload (`src/preload/`)

The preload script runs with Node.js APIs but in the renderer's context. It exposes a typed `smokeAPI` object via `contextBridge.exposeInMainWorld()`. The renderer never accesses Node.js or Electron APIs directly.

Security settings:
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: false` (required for preload Node APIs)

### Renderer (`src/renderer/`)

A React 18 application responsible for all UI. Uses Zustand for state management and xterm.js for terminal rendering.

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
│   └── config/
│       └── ConfigStore.ts       # electron-store schema and instance
├── preload/
│   ├── index.ts                 # contextBridge API exposure
│   └── types.ts                 # SmokeAPI TypeScript interface
└── renderer/
    ├── App.tsx                  # Root: layout, init hooks, sidebar + canvas
    ├── main.tsx                 # React 18 createRoot entry
    ├── index.html               # HTML mount point
    ├── canvas/
    │   ├── Canvas.tsx           # Infinite canvas with session rendering
    │   ├── Grid.tsx             # Grid pattern overlay
    │   ├── useCanvasControls.ts # Pan/zoom/pointer/wheel handling
    │   └── useViewportCulling.ts # Viewport-based visibility filtering
    ├── terminal/
    │   ├── TerminalWindow.tsx   # Draggable/resizable terminal container
    │   ├── TerminalWidget.tsx   # xterm.js integration + PTY bridge
    │   ├── TerminalThumbnail.tsx # Text-based zoomed-out view
    │   ├── useTerminal.ts       # Terminal instance creation/lifecycle
    │   ├── usePty.ts            # PTY I/O bridging (data in/out)
    │   └── terminalRegistry.ts  # Terminal lifecycle + WebGL management
    ├── window/
    │   ├── WindowChrome.tsx     # Title bar, status indicator, close button
    │   ├── ResizeHandle.tsx     # Corner + edge resize handles
    │   ├── useWindowDrag.ts     # Drag-to-move with grid snap
    │   ├── useWindowResize.ts   # Resize with grid snap + PTY resize
    │   └── useSnapping.ts       # Grid snap utilities
    ├── session/
    │   ├── useSessionCreation.ts # New session: store + PTY spawn
    │   ├── useSessionClose.ts   # Close: PTY kill + cleanup
    │   └── useSessionShortcuts.ts # (legacy, replaced by shortcuts/)
    ├── sidebar/
    │   ├── Sidebar.tsx          # Session list + layout + config panels
    │   ├── SessionListItem.tsx  # Clickable session entry
    │   └── useSidebarSync.ts    # Pan-to-session animation (easeOut)
    ├── shortcuts/
    │   ├── shortcutMap.ts       # Shortcut resolution + definitions
    │   └── useKeyboardShortcuts.ts # Global capture-phase handler
    ├── layout/
    │   ├── LayoutPanel.tsx      # Save/load/delete layout UI
    │   └── useLayoutPersistence.ts # Serialize/restore/auto-save
    ├── config/
    │   └── ConfigPanel.tsx      # Settings panel UI
    ├── stores/
    │   ├── sessionStore.ts      # Session map + focus/highlight
    │   ├── canvasStore.ts       # Pan (x,y) + zoom + gridSize
    │   ├── preferencesStore.ts  # Preferences mirror
    │   ├── gridStore.ts         # Grid size + snap toggle + visibility
    │   └── snapshotStore.ts     # Terminal text snapshots
    └── styles/                  # CSS stylesheets
        ├── canvas.css
        ├── terminal.css
        ├── window.css
        ├── sidebar.css
        ├── layout.css
        ├── config.css
        └── thumbnail.css
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
User action (double-click / Cmd+N / sidebar button)
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

## State Management

### Zustand Stores

Smoke uses Zustand with the vanilla store API for performance. Each store exposes both direct getters (for non-React code) and React hooks (for components).

| Store | Purpose | Update Frequency |
|---|---|---|
| `sessionStore` | Session CRUD, focus, z-index | On user interaction |
| `canvasStore` | Pan position, zoom level | Every frame during pan/zoom |
| `preferencesStore` | User preferences mirror | On settings change |
| `gridStore` | Grid size, snap toggle, visibility | On settings change |
| `snapshotStore` | Terminal text captures | Every 5 seconds per terminal |

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
│   │                                                   ││
│   │            [Terminal C]                            ││
│   │                                                   ││
│   └───────────────────────────────────────────────────┘│
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Why Refs Over State for Canvas

Pan and zoom change on every frame during interaction. Writing these to Zustand state would cause React to re-render the entire component tree on every mousemove. Instead:

1. Store current pan/zoom in `useRef`
2. Apply CSS transform directly to the DOM node
3. Debounce sync to Zustand (100ms) for other consumers

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

### Debouncing

| Operation | Debounce | Why |
|---|---|---|
| Pan/zoom → Zustand sync | 100ms | Avoid re-renders during interaction |
| Viewport culling recalc | 100ms | Avoid thrashing on rapid changes |
| Layout auto-save | 2s | Avoid excessive disk writes |
| Snapshot capture | 5s interval | Balance freshness vs CPU |

## IPC Channel Reference

### Request/Response (ipcMain.handle → ipcRenderer.invoke)

| Channel | Direction | Request Type | Response Type |
|---|---|---|---|
| `pty:spawn` | Renderer → Main | `PtySpawnRequest` | `PtySpawnResponse` |
| `pty:resize` | Renderer → Main | `PtyResizeMessage` | `void` |
| `pty:kill` | Renderer → Main | `PtyKillMessage` | `void` |
| `layout:save` | Renderer → Main | `LayoutSaveRequest` | `void` |
| `layout:load` | Renderer → Main | `LayoutLoadRequest` | `Layout \| null` |
| `layout:list` | Renderer → Main | `void` | `string[]` |
| `layout:delete` | Renderer → Main | `LayoutDeleteRequest` | `void` |
| `config:get` | Renderer → Main | `void` | `Preferences` |
| `config:set` | Renderer → Main | `ConfigSetRequest` | `void` |

### Fire-and-Forget (ipcMain.on / webContents.send)

| Channel | Direction | Message Type | Notes |
|---|---|---|---|
| `pty:data:to-pty` | Renderer → Main | `PtyDataToPty` | User keystrokes |
| `pty:data:from-pty` | Main → Renderer | `PtyDataToRenderer` | Shell output |
| `pty:exit` | Main → Renderer | `PtyExitMessage` | PTY process exited |

Data channels use fire-and-forget (`send`/`on`) rather than request/response (`invoke`/`handle`) for performance — no await overhead on every keystroke.

## Configuration Schema

Stored in `~/Library/Application Support/Smoke/smoke-config.json` (macOS) or `%APPDATA%/Smoke/smoke-config.json` (Windows).

```typescript
interface SmokeConfig {
  defaultLayout: Layout | null
  namedLayouts: Record<string, Layout>
  preferences: Preferences
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
  position: { x: number; y: number }
  size: { width: number; height: number; cols: number; rows: number }
}
```
