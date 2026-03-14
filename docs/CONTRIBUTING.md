# Contributing to Smoke

## Development Setup

### Prerequisites

- Node.js 20+
- npm
- Git

### Getting Started

```bash
git clone <repo-url> smoke
cd smoke
npm install        # Installs deps + builds + rebuilds node-pty for Electron
npm run dev        # Starts Electron with HMR
```

`npm run dev` launches the app with hot module replacement:
- Renderer changes (React components, styles) update instantly without full reload
- Main process changes trigger an automatic restart

### Native Module Rebuild

If you see errors about `node-pty` after switching Node.js or Electron versions:

```bash
npm run rebuild    # Recompiles node-pty against Electron's Node headers
```

## Code Style & Conventions

### TypeScript

- **Strict mode** is enabled across the project
- Two tsconfig targets: `tsconfig.node.json` (main + preload) and `tsconfig.web.json` (renderer)
- Prefer explicit types for function parameters and return values at module boundaries

### React

- **Functional components only** — no class components
- Use hooks for all side effects and state
- Prefer named exports

### Zustand

- Stores use the **vanilla API** (`createStore`) with React hook wrappers via `useStore`
- Selector hooks are defined alongside the store (e.g., `useSessionList`, `useFocusedId`)
- For performance-critical paths, read from the store directly via `store.getState()` instead of subscribing

### Performance

- Use **refs** for values that change every frame (pan, zoom, pointer position)
- Use **Zustand state** for values that should trigger re-renders
- Debounce sync from refs → state (typically 100ms)
- Use **fire-and-forget IPC** (`send`/`on`) for data channels, not `invoke`/`handle`

## How to Add a New Keyboard Shortcut

1. **Add the action type** to `ShortcutAction` in `src/renderer/shortcuts/shortcutMap.ts`:

```typescript
export type ShortcutAction =
  | 'newSession'
  | 'yourNewAction'   // ← add here
  // ...
```

2. **Add the key mapping** in `resolveShortcut()` in the same file:

```typescript
case 'y':
  return 'yourNewAction'
```

3. **Handle the action** in `src/renderer/shortcuts/useKeyboardShortcuts.ts`:

```typescript
case 'yourNewAction':
  // your logic here
  break
```

4. **Document the shortcut** in `README.md`'s keyboard shortcuts table.

## How to Add a New Config Option

1. **Add the field** to the `Preferences` interface in `src/main/config/ConfigStore.ts`:

```typescript
export interface Preferences {
  // ...existing fields
  yourOption: string
}
```

2. **Set a default value** in `defaultPreferences` in the same file:

```typescript
export const defaultPreferences: Preferences = {
  // ...existing defaults
  yourOption: 'default-value',
}
```

3. **Add validation** (if needed) in the `CONFIG_SET` handler in `src/main/ipc/ipcHandlers.ts`.

4. **Mirror in the renderer** — add the field to `src/renderer/stores/preferencesStore.ts`.

5. **Add UI** — add a control to `src/renderer/config/ConfigPanel.tsx`.

6. **Document** in `README.md`'s configuration table.

## Testing

### Framework

Tests use [Vitest](https://vitest.dev/).

### Running Tests

```bash
npx vitest run           # Run all tests once
npx vitest               # Run in watch mode
npx vitest run <path>    # Run a specific test file
```

### Test Structure

Test files live alongside source code in `__tests__/` directories:

```
src/renderer/canvas/__tests__/canvas.test.ts
src/renderer/stores/__tests__/stores.test.ts
src/renderer/shortcuts/__tests__/shortcuts.test.ts
# ... etc
```

### Writing Tests

- Mock `window.smokeAPI` for renderer tests that call IPC
- Use Zustand's vanilla API for store tests — call `store.getState()` and `store.setState()` directly
- Test pure logic (snapping math, shortcut resolution, viewport culling) with unit tests

## PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Include the issue ID in commit messages (e.g., `Add zoom controls (smoke-abc)`)
- Run tests before submitting
- Update documentation if you change keyboard shortcuts, config options, or IPC channels

## Project Structure

See [docs/ARCHITECTURE.md](ARCHITECTURE.md) for the full architecture guide, including:
- Three-process architecture details
- IPC channel reference
- State management patterns
- Performance strategies
