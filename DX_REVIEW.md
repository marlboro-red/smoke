# DX/UX Review — June 2026

Deep developer-experience review from a terminal-power-user perspective.
Method: drove the real app via Playwright across four scenario suites
(fresh-config first run, shortcuts with terminal focus, 8-element
navigation, core flows, error/edge cases) and cross-checked every runtime
finding against source. Key claims independently spot-checked.

## Verdict

Smoke has genuinely strong bones — command palette, rebindable shortcuts
with conflict validation, a grouped shortcut cheat-sheet, status bar
telemetry, solid layout persistence — but the keyboard layer actively
betrays terminal muscle memory: Escape steals focus from vim, Cmd+W is
double-bound to "close app window," session cycling sits on the macOS app
switcher, and Cmd+K throws. A power user hits three of these in the first
ten minutes and concludes the app is broken. Discoverability of the deep
feature set (focus mode, broadcast, regions, presentation, recording,
assembly) is near zero.

## Top 10 friction points (ranked by daily annoyance)

1. **Escape unfocuses a focused terminal** — every vim mode-switch / fzf
   cancel ejects you from the terminal. `shortcutMap.ts:180` binds bare
   `Escape`; the capture-phase handler (`useKeyboardShortcuts.ts:366-377`)
   preventDefaults it even when an xterm textarea has focus. Fix: never
   resolve bare Escape inside `.terminal-container`.
2. **Cmd+W closes the whole app window** — the native menu's
   `role: 'close'` (`src/main/index.ts:83`) wins over the renderer
   handler on macOS. And the renderer path kills PTYs with no
   confirmation even with a foreground child running. Fix: drop the menu
   role; confirm (or toast-with-undo) when a process is running.
3. **Cmd+K (Save Bookmark) is broken** — `useKeyboardShortcuts.ts:140`
   calls `window.prompt()`, which throws in Electron. Silent exception,
   no bookmark. It's also iTerm "clear buffer" muscle memory. Fix:
   inline-name input or auto-name + toast; consider Cmd+K = clear
   terminal.
4. **Session cycling bound to Cmd+Tab** (`shortcutMap.ts:130-131`) — the
   macOS app switcher eats it; the feature is dead on Mac, and
   `SYSTEM_SHORTCUTS` doesn't list ⌘Tab so the conflict validator can't
   warn. Fix: Ctrl+Tab / Ctrl+Shift+Tab + add ⌘Tab to SYSTEM_SHORTCUTS.
5. **First run is a blank void** — no empty-state hint; both creation
   affordances (canvas double-click, 16px sidebar "+") are invisible.
   Fix: zero-element hint ("Double-click to open a terminal · ⌘N · ⌘P ·
   ⌘/").
6. **Webview remount flicker + state loss** — `Canvas.tsx:120` unmounts
   webviews when culled (terminals get `hidden` instead) and the
   zoom-0.4 threshold swaps WebviewWindow ↔ WebviewThumbnail; each
   remount reloads the page (white flash, scroll/SPA/form state lost).
   Fix: keep mounted with `hidden`, overlay the thumbnail.
7. **No right-click anywhere it matters** — terminal body, canvas
   background, window chrome, group headers: nothing. Only sidebar items
   have a (good) context menu. Fix: terminal menu (copy/paste/clear/
   split), canvas menu (new element here), chrome menu.
8. **Power features are secret** — split panes (⌘\), focus mode (⌘⇧.),
   broadcast, regions, presentation (F5), recording: not in window
   chrome, not in the native menu (no View/Session menus at all), and
   the command palette covers maybe half the features. Fix: mirror
   everything into the palette; add a real app menu.
9. **Minimap swallows clicks and windows spawn under it** — clicking a
   window beneath the minimap focuses nothing; the first terminal ever
   created spawns partially under it; no hide control. Fix: auto-hide /
   collapse toggle / spawn avoidance.
10. **Silent failure on errors** — invalid webview host → white
    rectangle, no error page; blocked `file://` navigation still updates
    the URL bar + title as if it loaded; missing files at restore are
    silently dropped. Fix: `did-fail-load` panel, "blocked" toast,
    "couldn't restore N windows" toast.

**Honorable mentions:** Cmd+D duplicate collides with iTerm split
reflex; Cmd+G collides with macOS find-next; Cmd+S "Save Layout" gives no
feedback; settings is one long scroll with the shortcut editor buried;
webview default URL `http://localhost:3000` loads whatever dev server is
running, unprompted; canvas tabs have no keyboard story (⌘T is unused —
strange for a terminal app).

## Genuinely good — don't touch

- The rebindable shortcut architecture with per-action conflict +
  system-shortcut validation and startup warning toast.
- ⌘/ shortcuts overlay (grouped, complete).
- Command palette model (sessions-first jump list, fuzzy match) — just
  needs full command coverage.
- Esc consistency across all modals/overlays/menus (runtime-verified).
- Status bar telemetry (zoom, counts by type, active count, coords, git
  branch).
- Unsaved-file protection (dirty marker, confirm on close, disk-conflict
  check on save).
- Sidebar session UX (click pans, double-click renames, useful context
  menu).
- ⌘1–9 focuses, pans, AND puts the cursor in the terminal.
- Layout autosave/restore — survived relaunches perfectly, including
  split-pane and group state.

## Quick wins (<1 hour each)

1. Don't resolve bare Escape when focus is inside `.terminal-container`.
2. Remove `role: 'close'` from the Window menu.
3. Replace the bookmark `prompt()` with auto-name + toast.
4. Rebind cycling to Ctrl+Tab; add ⌘Tab to SYSTEM_SHORTCUTS.
5. `hidden={!isVisible}` for webviews instead of unmount (kills flicker).
6. Empty-state hint when no sessions exist.
7. Shortcut hints on all CreateMenu rows.
8. "Layout saved" toast on ⌘S.
9. Palette commands for split/focus-mode/broadcast/extract/presentation/
   dep-graph.
10. `did-fail-load` → themed error panel in webviews.
