# Performance Audit — June 2026

Deep static audit across six subsystems: canvas/render hot paths, terminal data
pipeline, state architecture, main process, memory, and startup. Findings are
ranked by user-perceived impact within each tier. `file:line` references are
approximate (audit snapshot at commit `0fd5a2f`).

## Tier 1 — Highest impact (jank you can feel)

### 1. Layout restore is fully sequential
`src/renderer/layout/useLayoutPersistence.ts:326-486` — `restoreLayout` awaits
each file read and image decode **inside** the session loop. 5 files + 2 images
≈ 550ms serialized; one missing image blocks everything behind it. PTY spawns
are already fire-and-forget; file/image sessions should load with bounded
concurrency (e.g., 4 parallel) and create sessions as results land.
**Est. win: 400–1500ms time-to-interactive.**

### 2. Auto-save double-serializes and double-writes every 2s
`src/renderer/layout/useLayoutPersistence.ts:260-264` — every session/canvas
change schedules a save that serializes the entire layout and issues **two**
IPC saves (`__tab__<id>` + `__default__`), each a synchronous electron-store
disk write **on the main process** — blocking all IPC (keystrokes, PTY output)
for the duration. Fix: write one key (keep `__default__` as a pointer or write
it only on quit), and batch electron-store writes (see #3).

### 3. electron-store writes are synchronous on the main thread
`src/main/ipc/handlers/configHandlers.ts` — `LAYOUT_SAVE`, `CONFIG_SET`,
`BOOKMARK_SAVE`, `TAB_SAVE_STATE` all call `configStore.set()` which writes the
whole JSON file synchronously. With layout autosave every 2s this is a recurring
5–50ms main-process stall. Fix: a write-behind queue (collect mutations, flush
every ~500ms with `atomically`-style async write, flush on quit).

### 4. Every window subscribes to every selection-ish store
`TerminalWindow.tsx:35-48` (and FileViewer/Note/Webview/Image/Snippet windows) —
each window subscribes to `useFocusedId`, `useHighlightedId`, `useSelectedIds`,
`useFocusModeActiveIds`, `useBroadcastGroupId`. One focus change re-runs
selectors in all N windows; with 30+ windows each click pays N re-render checks.
Fix: a per-session derived hook (`useWindowFlags(sessionId)`) returning a small
stable object via `useShallow`, or compute flags in Canvas and pass primitives.

### 5. updateSession clones the whole sessions Map per mutation
`src/renderer/stores/sessionStore.ts:335-344` — every position/title/status
update allocates a new Map of all sessions and notifies every subscriber.
Cascades into: viewport-culling index rebuild (`useViewportCulling.ts:124`,
O(n) per change), file-watch re-sync, event recording, group validation — all
subscribed at store level with no selector filtering. Fix: immer middleware (or
mutative), plus selector-scoped subscriptions (`subscribeWithSelector`) so
position-only changes don't run file-watcher/group logic.

### 6. PTY batching window too small under load
`src/main/pty/PtyDataBatcher.ts` — `BATCH_MS = 4`, `MAX_PENDING = 8`. Heavy
output produces 250+ IPC messages/sec and frequent pause/resume backpressure
cycles. Raising to ~16ms / 16 pending cuts IPC ~75% with imperceptible echo
latency. Pair with renderer-side write coalescing in `usePty` (queue chunks,
flush per tick) so xterm.js parses fewer, larger writes.

## Tier 2 — High impact

### 7. ConnectorLayer rebuilds its session map per session change
`ConnectorLayer.tsx:96-100` — `useSessionList()` returns a fresh array each
store tick, so the memoized Map rebuilds on every mutation (60×/s during a
drag). Pass the store's stable `sessions` Map (or subscribe to position slices).

### 8. SnapPreview: five separate store subscriptions
`SnapPreview.tsx` — five `useSnapPreview` selectors, updated per pointer-move
during drags. Collapse to one `useShallow` selector.

### 9. useWindowDrag queries the DOM per selected peer at drag start
`useWindowDrag.ts:211` — `querySelector('[data-session-id=…]')` per selected
session. Cache element refs (WeakMap keyed by session id, registered by each
window on mount).

### 10. WebGL addon thrash on culling boundaries
`terminalRegistry.ts` — addon disposed after 60s hidden, recreated on re-enter;
context creation is 10–50ms and visible as jank when panning back and forth.
Consider 5-minute timeout + cap on simultaneously-live WebGL contexts (LRU).

### 11. Broadcast mode scans all sessions per keystroke
`usePty.ts` + `sessionStore.getGroupSessionIds` — O(all sessions) Map iteration
on every keystroke while broadcasting. Maintain a `groupId → Set<sessionId>`
reverse index in the store.

### 12. Hidden-buffer flush does one giant join+write
`terminalRegistry.ts:flushHiddenBuffer` — up to 5MB joined and written in one
synchronous xterm parse on reattach (100–300ms stall). Write in slices across
frames, or trim to the last N lines the user can actually scroll to.

### 13. Main process: three separate full-repo walks + two recursive watchers
`FilenameIndex`, `SearchIndex` (worker), `StructureAnalyzer` each walk the tree
on workspace open; `SearchIndex` and `FilenameIndex` both hold recursive
`fs.watch`ers with separate debounces. Fuse into one walk that feeds all three,
and one shared watcher service.

### 14. SearchIndex holds the entire repo text in main-process RAM
`SearchIndex.ts` `fileLines` — ~repo-size memory held forever, scanned with
per-line `toLowerCase()` per query. Options: store lazily (read matched files
on demand for context), keep only token index in memory, or move search itself
into the worker and keep nothing on main.

### 15. assertReadAllowed does multiple realpath walks per FS read
`fsHandlers.ts` — every readfile/readdir resolves realpath for target + home +
each boundary. Memoize the realpaths of home/launchCwd/defaultCwd (they don't
change mid-session) and only resolve the target per call.

### 16. RelevanceScorer re-reads each candidate file 2–3×
`RelevanceScorer.ts:177-207,351-365` — content keyword scoring, recency stat,
and import proximity each open the file. 50–200 candidates → up to 600 reads
per context-collect. Read once into a shared map for the scoring pass.

## Tier 3 — Worth doing

- **MCP bridge + plugin scan block window creation** (`ipcHandlers.ts:32-57`):
  `mcpBridge.start()` and `pluginLoader.loadAll()` are awaited before
  `createWindow()`. Start both lazily/after `ready-to-show`. ~150–500ms.
- **PresentationMode rAF guard is dead code** (`PresentationMode.tsx:21,40`):
  `frame` is function-local so concurrent slide animations fight each other.
  Hoist the frame handle so a new animation cancels the previous one.
- **Resize drag sends 10–20 PTY resize IPCs** (`useTerminal.ts` ResizeObserver
  debounce 50ms): debounce harder during drag, send final on pointer-up.
- **Terminal registry never evicts** — every terminal ever opened stays alive
  with full scrollback (+ up to 5MB hidden buffer). Add an LRU cap.
- **focusModeStore.useFocusModeActiveIds** allocates a new Set per call and
  subscribes to all connectors. Memoize on (focusedId, connectors) identity.
- **aiStore.appendText maps the whole message array per stream chunk** — use a
  Map or immer; streams emit many chunks/sec.
- **SearchIndex.search has no per-file early cap** — O(candidates × lines) with
  per-line lowercase; cap matches per file and lowercase lazily.
- **FilenameIndex.scanDirectory unbounded parallel recursion** — bound it.
- **NoteWindow re-runs Shiki highlight on every content change** — debounce.
- **Layout serialization spreads per session** (`serializeCurrentLayout`) —
  cheap individually, runs every autosave; tidy when touching #2.

## Round 2 findings — compositing, xterm config, IPC payloads

### Compositing & CSS (paint cost while panning N windows)

- ~~`backdrop-filter` on every `.terminal-window`~~ **CORRECTED**: the
  `--terminal-backdrop` token defaults to `none` and only becomes
  `blur(12px)` when the user sets terminal opacity < 1 — already gated.
  Translucent mode is still expensive by design; acceptable.
- ~~xterm `allowTransparency: true` unconditionally~~ **CORRECTED**: this
  is an intentional, documented tradeoff (`applyTheme.ts`) so opacity can
  change at runtime without recreating every terminal's WebGL context.
  Leave as-is.
- **Grid re-snap animates `left/top/width/height`** (`styles/canvas.css:79-84`):
  layout+paint per frame for 300ms across all windows. Animate `transform`
  instead, or accept a snap without transition.
- **No `contain` on window elements**: add `contain: paint` (or
  `layout paint`) to `.terminal-window` so the compositor can skip subtree
  walks during viewport pans.
- **Heavy multi-layer `box-shadow`s** on window base/focused/highlighted/
  broadcasting states (`window.css`, `canvas.css:71`): rasterized per state
  change; simplify to outline + small shadow.
- **`filter: grayscale(0.6)` on focus-mode-dimmed windows**
  (`window.css:30-32`): per-pixel filter on up to N-1 windows; opacity alone
  reads nearly the same.
- **Sidebar collapse transitions `width`** (`sidebar.css:13`): full app
  re-layout per frame; use `transform: translateX`.
- **xterm options** (`useTerminal.ts:18-26`): `scrollback: 10000` (memory +
  canvas-search cost per terminal — consider 5000), `cursorBlink: true`
  (steady repaint per visible terminal — consider default off/configurable).
- **`backdrop-filter` on minimap and toasts** — small but constant; solid
  backgrounds suffice.

### IPC payloads & protocols

- **`codegraph.resolveImport` called per import in loops**
  (`useGraphInvalidation.ts:131-140`, `useSuggestionEngine.ts:75-89`): 20-50
  round-trips per file change. Add a batched `resolveImports(specifiers[],
  importer, root)` channel.
- **Graph expand ships the whole graph both ways**
  (`buildDepGraph.ts:expandDepGraph` + `expandCodeGraph`): renderer
  reconstructs and uploads the full graph, main returns the full graph again
  (~85KB round trip for 40 nodes). Return a delta (new nodes/edges + moved
  positions); cache graph state on main keyed by a version.
- **`ContextCollectResponse` always embeds the full `structureMap`**
  (50–150KB on monorepos) though the renderer only uses module ids for
  grouping. Make it opt-in or send `{moduleId, moduleName}` per file.
- **`search.query` returns `lineContent` per result** to a consumer
  (AssemblyPreview) that only needs file paths. Add a lean mode or drop the
  field from this call site.
- **Graph/suggestion flows `fs.readfile` files already open on the canvas**
  (`buildDepGraph.ts:ensureFileSession` checks; `useGraphInvalidation`
  createNodeSession path doesn't always) — check `sessionStore` first.

## Progress

- ✅ **Phase 1 shipped**: layout restore parallelized (bounded concurrency 4);
  write-behind config persistence (`deferredConfig`, one coalesced disk write
  ≤1/500ms, flush on quit); autosave no longer double-saves `__default__`
  (refreshed at most once/minute).
- ✅ **Quick wins shipped**: PTY batch window 4ms→16ms with deeper backpressure
  allowance; WebGL dispose timeout 60s→5min; SnapPreview collapsed to a
  single store subscription.
- ✅ **Phase 2 shipped**: per-window boolean selectors (`useIsFocused`/
  `useIsHighlighted`/`useIsSelected`/`useIsBroadcasting`/
  `useIsDimmedByFocusMode`) across all 7 window components + TerminalWidget —
  a focus/selection change now re-renders only the windows whose state
  flipped, not all N; pointer handlers read selection via `getState()`;
  `useFocusModeActiveIds` is inert while focus mode is off; ConnectorLayer
  subscribes to the store's session Map directly (no per-change array→Map
  rebuild); viewport culling skips spatial-index rebuilds when geometry is
  unchanged (signature guard) and keeps the previous `visibleIds` Set when
  membership didn't change. Remaining from this phase: immer-style store
  updates (deferred — new dependency) and drag-start peer element registry
  (minor: one query per selected peer per drag start).
- ✅ **Phase 3 shipped**: broadcast keystrokes now use a group→members cache
  invalidated by Map identity (was O(all sessions) per keystroke); hidden
  terminal reattach flushes at most 1MB into the xterm parser (older data
  scrolls out of scrollback anyway); PTY resize debounce 50ms→150ms (was
  10-20 fit + IPC rounds per resize drag); new batched
  `codegraph:resolve-imports` channel — graph invalidation and the
  suggestion engine resolve all of a file's imports in one IPC round-trip
  instead of one per specifier (20-50 invokes per file save).
- ✅ **Phase 4 (contained items) shipped**: FS read boundary checks memoize
  the boundary realpaths (home/launchCwd/defaultCwd are session-stable) —
  one realpath walk per read instead of 3-6 syscall chains per IPC call;
  RelevanceScorer's import-proximity BFS shares graphBuilder's parse cache
  instead of re-reading files ContextCollector just read in the same
  request. Deferred (architectural): fusing the three full-repo walks
  behind one walker + shared watcher.
- ✅ **SearchIndex memory diet shipped**: the index no longer holds the
  entire repo's text in main-process memory — file text never crosses the
  worker thread boundary (chunks carry only paths + postings), and search
  reads candidate files lazily through a 64-file LRU. `search()` is async
  end to end (handler, ContextCollector). Functionally verified in the
  running app: 428-file index build + queries with correct ranked results
  and line content. Also fixed: PresentationMode's dead rAF cancel guard
  (rapid slide navigation leaked competing animation loops); NoteWindow
  debounces Shiki re-highlighting (ran per keystroke).
- Wontfix (judgment): graph-expand delta protocol — main is deliberately
  stateless and the renderer is the source of truth for canvas graph
  state; caching graph state in main to save ~85KB on a rare user action
  (1-5×/session) trades correctness risk for little gain. immer-style
  store updates remain blocked on adding a dependency through the
  registry. aiStore.appendText was overstated (map reuses refs; one array
  + one object per chunk).
- ✅ **Phase 5 shipped**: `contain: layout paint` on window elements (they
  already clip via `overflow: hidden`, so containment is behavior-neutral
  and lets the compositor skip subtrees during viewport pans); focus-mode
  dimming drops the per-pixel `grayscale()` filter (imperceptible at 0.2
  opacity); minimap and toasts use slightly more opaque solid backgrounds
  instead of backdrop blur. Verified pixel-comparable on the restored
  scene. Deliberately NOT changed: window box-shadows (visual identity),
  cursorBlink/scrollback (UX), grid-resnap transitions (rare event),
  sidebar width transition (rare event).
- ✅ **Functionally verified** (Playwright-driven Electron, isolated config):
  PTY keystroke round-trip + 8k-line output flood, focus flipping, drag →
  autosave → write-behind flush on disk, two-session restore with seeded
  file sessions + a missing file (skipped without stalling), restored PTY
  liveness. Chrome-click-doesn't-focus and minimap click-shielding are
  pre-existing (verified identical on the pre-Phase-2 build).

## Measured results (post-optimization)

Benchmark: `node scripts/perf-bench.mjs` (Playwright-driven, production
build, 22 live shells + 4 notes = 26 canvas elements, 1600×1000 window,
macOS). Frame stats over rAF sampling; `dropped` = frames > 33ms.

| Scenario | avg | p95 | worst | dropped |
|---|---|---|---|---|
| Idle | 16.5ms | 17.6ms | 17.7ms | 0 |
| Continuous pan | 16.6ms | 17.6ms | 17.7ms | 0 |
| Zoom out/in across thumbnail threshold | 16.7ms | 17.6ms | 17.7ms | 0 |
| Window drag (sinusoidal, 2.5s) | 16.7ms | 17.6ms | 17.7ms | 0 |
| `seq 1 100000` flood while 21 shells idle | 16.6ms | 17.6ms | 17.7ms | 0 |
| Typing during all of the above | 16.6ms | 17.6ms | 17.7ms | 0 |

Startup to interactive: 380–580ms. Locked to the 60Hz vsync quantum with
zero dropped frames in every scenario — at this scale the renderer is
vsync-bound, not work-bound.

Memory (after the flood, one terminal holding capped scrollback):
main 175MB + GPU 146MB + utility 46MB + renderer 295MB = **~660MB**.
~370MB of that is the Electron floor before any app code; marginal cost
≈ 8–10MB per live terminal (10k-line scrollback). This is the
architectural price of the canvas/web stack — interaction speed is
solved; absolute memory footprint can only approach, never match,
native terminals.

Remaining levers if footprint matters more than features: scrollback
10000 → 5000 default (≈ halves per-terminal renderer memory), LRU
eviction in the terminal registry, code-splitting the 2.7MB renderer
bundle (AI panel, replay, presentation, depgraph are eagerly loaded),
and the walk fusion for workspace-open IO.

## Suggested execution order

| Phase | Items | Theme |
|---|---|---|
| 1 | #1, #2, #3 | Startup + main-process stalls (biggest absolute wins) |
| 2 | #4, #5, #7, #8, #9 | Render/store fan-out (drag & click smoothness) |
| 3 | #6, #11, #12, #10 | Terminal throughput + typing latency |
| 4 | #13, #14, #15, #16 | Indexing/main-process efficiency |
| 5 | Tier 3 | Cleanup batch |

Each phase is independently shippable and verifiable (profile before/after with
50 sessions + chatty terminals).
