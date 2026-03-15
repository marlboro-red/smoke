import { test as base, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { waitForAppReady, pressShortcut } from './helpers'

const MAIN_JS = path.join(__dirname, '..', 'out', 'main', 'index.js')

/**
 * Launch an Electron app with an isolated config directory.
 * Uses SMOKE_E2E_CONFIG_DIR env var to redirect electron-store to a temp dir.
 */
async function launchIsolated(configOverride?: Record<string, unknown>) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-e2e-'))

  if (configOverride) {
    fs.writeFileSync(path.join(tmpDir, 'smoke-config.json'), JSON.stringify(configOverride))
  }

  const app = await electron.launch({
    args: [MAIN_JS],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_DISABLE_GPU: '1',
      SMOKE_E2E_CONFIG_DIR: tmpDir,
    },
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  return { app, window, tmpDir }
}

/** Force-close an Electron app, killing the process if needed. */
async function forceClose(app: ElectronApplication): Promise<void> {
  try {
    await Promise.race([
      app.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ])
  } catch { /* ignore */ }
  // Ensure process is dead
  try {
    const pid = app.process().pid
    if (pid && app.process().exitCode === null) {
      process.kill(pid, 'SIGKILL')
    }
  } catch { /* already dead */ }
  // Wait for OS to reclaim
  await new Promise((r) => setTimeout(r, 500))
}

function rmTmp(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* */ }
}

// ─── Cold Start ─────────────────────────────────────────────────────────────

base.describe('App Startup & Lifecycle', () => {

  base('cold start — launches with empty canvas', async () => {
    const { app, window, tmpDir } = await launchIsolated()
    try {
      expect(app.windows().length).toBe(1)
      await waitForAppReady(window)

      const root = window.locator('#root')
      await expect(root).toBeAttached()

      // Wait for any layout restore to complete
      await window.waitForTimeout(2000)

      // No terminals should exist on a fresh config
      const terminalWindows = window.locator('.terminal-window')
      const count = await terminalWindows.count()
      expect(count).toBe(0)
    } finally {
      await forceClose(app)
      rmTmp(tmpDir)
    }
  })

  // ─── Layout Restore ───────────────────────────────────────────────────────

  base('start with saved default layout — restores sessions', async () => {
    const savedLayout = {
      name: '__default__',
      sessions: [
        {
          type: 'terminal',
          title: 'Restored Terminal',
          cwd: os.homedir(),
          position: { x: 100, y: 100 },
          size: { width: 600, height: 400, cols: 80, rows: 24 },
        },
      ],
      viewport: { panX: 0, panY: 0, zoom: 1 },
      gridSize: 20,
    }

    const config = {
      defaultLayout: savedLayout,
      namedLayouts: {
        '__default__': savedLayout,
        '__tab__default': savedLayout,
      },
      canvasBookmarks: {},
      preferences: {
        defaultShell: '',
        autoLaunchClaude: false,
        claudeCommand: 'claude',
        gridSize: 20,
        sidebarPosition: 'left',
        sidebarWidth: 240,
        sidebarSectionSizes: {},
        theme: 'dark',
        defaultCwd: '',
        terminalOpacity: 1,
        fontFamily: '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        customShortcuts: {},
        startupCommand: '',
        skipAssemblyPreview: false,
      },
      tabs: [{ id: 'default', name: 'Canvas 1' }],
      activeTabId: 'default',
    }

    const { app, window, tmpDir } = await launchIsolated(config)
    try {
      await waitForAppReady(window)

      // Layout restore should spawn the saved terminal
      const terminalWindow = window.locator('.terminal-window')
      await expect(terminalWindow.first()).toBeVisible({ timeout: 10000 })

      // Verify the restored terminal has a running PTY
      const statusDot = terminalWindow.first().locator('.window-chrome-status.running')
      await expect(statusDot).toBeVisible({ timeout: 5000 })

      // Session should appear in sidebar
      const sessionItems = window.locator('.session-list-item')
      await expect(sessionItems.first()).toBeVisible({ timeout: 5000 })
    } finally {
      await forceClose(app)
      rmTmp(tmpDir)
    }
  })

  // ─── Corrupted Config ─────────────────────────────────────────────────────

  base('corrupted config file — app starts with graceful fallback', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-e2e-'))
    fs.writeFileSync(
      path.join(tmpDir, 'smoke-config.json'),
      '{{{{CORRUPTED JSON!!! not valid at all @#$%^&*('
    )

    const app = await electron.launch({
      args: [MAIN_JS],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_GPU: '1',
        SMOKE_E2E_CONFIG_DIR: tmpDir,
      },
    })

    try {
      const window = await app.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // App should launch without crashing
      expect(app.windows().length).toBe(1)
      await waitForAppReady(window)

      const root = window.locator('#root')
      await expect(root).toBeAttached()

      // Canvas should render with fallback defaults
      const canvas = window.locator('.canvas-root')
      await expect(canvas).toBeVisible({ timeout: 5000 })

      // Should be able to create a terminal
      await pressShortcut(window, 'n')
      const terminalWindow = window.locator('.terminal-window')
      await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })
    } finally {
      await forceClose(app)
      rmTmp(tmpDir)
    }
  })

  // ─── macOS Dock Behavior ──────────────────────────────────────────────────

  if (process.platform === 'darwin') {
    base('macOS — closing all windows keeps app running, activate recreates window', async () => {
      const { app, window, tmpDir } = await launchIsolated()
      try {
        await waitForAppReady(window)

        // Close all windows
        await app.evaluate(({ BrowserWindow }) => {
          for (const win of BrowserWindow.getAllWindows()) win.close()
        })

        await new Promise((r) => setTimeout(r, 1000))

        // App should still be running (macOS dock behavior)
        expect(app.process().exitCode).toBeNull()

        // Simulate activate (dock click) — should recreate the window
        await app.evaluate(({ app: electronApp }) => {
          electronApp.emit('activate')
        })

        const newWindow = await app.firstWindow()
        await newWindow.waitForLoadState('domcontentloaded')
        await waitForAppReady(newWindow)

        expect(app.windows().length).toBeGreaterThanOrEqual(1)
        const root = newWindow.locator('#root')
        await expect(root).toBeAttached()
      } finally {
        await forceClose(app)
        rmTmp(tmpDir)
      }
    })
  }

  // ─── PTY Cleanup ──────────────────────────────────────────────────────────

  base('PTYs are cleaned up when app quits', async () => {
    const { app, window, tmpDir } = await launchIsolated()

    try {
      await waitForAppReady(window)

      // Create two terminals
      await pressShortcut(window, 'n')
      await window.waitForTimeout(500)
      await pressShortcut(window, 'n')
      await window.waitForTimeout(500)

      const terminalWindows = window.locator('.terminal-window')
      const termCount = await terminalWindows.count()
      expect(termCount).toBeGreaterThanOrEqual(2)

      // Wait for shells to initialize
      await window.waitForTimeout(1500)

      // Get shell PIDs via marker file
      const markerFile = `/tmp/smoke-e2e-pty-pids-${Date.now()}`
      for (let i = 0; i < termCount; i++) {
        const sessionId = await terminalWindows.nth(i).getAttribute('data-session-id')
        if (sessionId) {
          await window.evaluate(([id, file]) => {
            window.smokeAPI.pty.write(id!, `echo $$ >> ${file}\n`)
          }, [sessionId, markerFile] as const)
        }
      }

      await window.waitForTimeout(2000)

      // Read PIDs
      let pids: number[] = []
      if (fs.existsSync(markerFile)) {
        const content = fs.readFileSync(markerFile, 'utf-8').trim()
        pids = content.split('\n').map((p) => parseInt(p.trim(), 10)).filter((p) => !isNaN(p))
      }

      // Close app (triggers before-quit → ptyManager.killAll())
      await app.close()
      await new Promise((r) => setTimeout(r, 1000))

      // Verify PTY processes are dead
      for (const pid of pids) {
        let alive = false
        try { process.kill(pid, 0); alive = true } catch { /* dead */ }
        expect(alive).toBe(false)
      }

      if (fs.existsSync(markerFile)) fs.unlinkSync(markerFile)
    } finally {
      rmTmp(tmpDir)
    }
  })
})
