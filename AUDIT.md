# Smoke Code Audit Report

**Date:** 2026-03-17
**Issue:** smoke-f4w
**Scope:** Code quality, security, performance, dead code, convention adherence

---

## Critical & High Severity

### 1. Path Traversal in Recording Handlers [CRITICAL]

**Files:** `src/main/ipc/ipcHandlers.ts:633, 646`

`RECORDING_LOAD` and `RECORDING_EXPORT` use `request.filename` directly in `path.join()` without sanitization. An attacker-controlled filename like `"../../../etc/passwd"` can read arbitrary files.

**Fix:** Use `path.basename(request.filename)` before joining.

### 2. Missing Path Boundary on File Read IPC [HIGH]

**Files:** `src/main/ipc/ipcHandlers.ts:444-455, 468-485`

`FS_READFILE` and `FS_READFILE_BASE64` accept arbitrary paths with no boundary validation. `FS_WRITEFILE` (line 492) correctly calls `assertWithinHome()`, but reads do not.

**Fix:** Apply `assertWithinHome()` to read handlers as well.

### 3. XSS via Markdown in FileViewer [HIGH]

**File:** `src/renderer/fileviewer/FileViewerWidget.tsx:27, 66`

`marked.parse()` is called without sanitization, then injected via `dangerouslySetInnerHTML`. Markdown files with embedded `<script>` or event handlers execute in the renderer process.

**Fix:** Use DOMPurify on the `marked` output before setting innerHTML.

### 4. Wrong Parameter Order in Plugin Session Restore [HIGH]

**File:** `src/renderer/layout/useLayoutPersistence.ts:219-225`

`createPluginSession()` expects `(pluginType, pluginId, pluginSource, manifest, pluginData?, position?)` but the restore call passes `(elementType, saved.title, pluginData, pos, {width, height})` — wrong order. Plugin session restoration is broken.

**Fix:** Match parameters to the function signature at `sessionStore.ts:293`.

### 5. Sandbox Disabled [HIGH]

**File:** `src/main/index.ts:107`

`sandbox: false` is set in webPreferences. While contextIsolation is enabled, disabling sandbox removes process-level isolation.

**Fix:** Enable `sandbox: true` or document why it's required (e.g., native module compatibility).

---

## Medium Severity

### 6. Preferences Store Race Condition

**File:** `src/renderer/stores/preferencesStore.ts:48-50`

`setPreferences()` calls `shortcutBindingsStore.getState().setCustomBindings()` without checking if the store is initialized.

### 7. Missing Error Handling in Layout IPC Calls

**File:** `src/renderer/layout/useLayoutPersistence.ts:329`

`pty.spawn()` calls during layout restoration are not wrapped in try-catch. A spawn failure leaves a session in the store with no backing PTY.

### 8. GroupStore Subscription Leak

**File:** `src/renderer/stores/groupStore.ts:193-203`

Module-level `sessionStore.subscribe()` call never stores or cleans up the unsubscribe function. Hot reloads accumulate duplicate subscriptions.

### 9. Plugin Permission Registration Unvalidated

**File:** `src/main/plugin/pluginIpcHandlers.ts:101-110`

`PLUGIN_REGISTER` handler accepts plugin-provided permissions without manifest verification.

### 10. Unvalidated FS_READDIR, FS_WATCH Handlers

**File:** `src/main/ipc/ipcHandlers.ts:405-442, 513-517`

Like FS_READFILE, these handlers lack path boundary checks.

---

## Low Severity

### 11. Duplicate Zoom Constants (Dead Code)

**File:** `src/renderer/canvas/useCanvasControls.ts:4-6`

`MIN_ZOOM`, `MAX_ZOOM`, `ZOOM_SENSITIVITY` at lines 4-6 are never used. Lines 34-36 define the actual constants (`MIN_ZOOM_CONST`, etc.).

### 12. Ref in useEffect Dependency Array

**File:** `src/renderer/terminal/TerminalWidget.tsx:38`

`charDims` ref is included in a useEffect dependency array. Refs are stable and should not be dependencies.

### 13. Viewport Culling Inconsistent Debounce

**File:** `src/renderer/canvas/useViewportCulling.ts:117-136`

`debouncedRecalculate` uses 100ms timeout, but `canvasStore.subscribe()` calls `recalculate()` directly (undebounced).

### 14. Missing canvasStore Selector Hooks (Convention)

**File:** `src/renderer/stores/canvasStore.ts`

No semantic selector hooks (`usePan()`, `useZoom()`, `useGridSize()`). CLAUDE.md convention: "Define selector hooks next to the store."

### 15. Inline require() in FS_WRITEFILE

**File:** `src/main/ipc/ipcHandlers.ts:491`

`require('os').homedir()` should be a top-level import.

### 16. Timer Not Cleared on PTY Exit

**File:** `src/main/ipc/ipcHandlers.ts:300-306`

Startup command fallback timer (3s) is not cleared if the PTY exits before it fires.

---

## Conventions Compliance

| Convention | Status |
|---|---|
| IPC patterns (invoke/handle, send/on, webContents.send) | Correct |
| Refs for frame-rate values (pan/zoom) | Correct |
| CSS transforms + debounced Zustand sync | Correct |
| Vanilla createStore() with hook wrappers | Correct |
| Selector hooks next to stores | Partial — missing in canvasStore |
| Viewport culling with margin | Correct (200px) |
| node-pty externalized + asarUnpack | Correct |
| Fire-and-forget for PTY data | Correct |

---

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 4 |
| Medium | 5 |
| Low | 6 |
| **Total** | **16** |

Top priorities: Fix path traversal (#1), add read boundary checks (#2), sanitize markdown HTML (#3), fix plugin session restore (#4).
