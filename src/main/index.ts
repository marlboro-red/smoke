// Smoke main process entry
import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { registerIpcHandlers, type IpcCleanup } from './ipc/ipcHandlers'
import { configStore, flushConfigWrites } from './config/ConfigStore'
import { WORKSPACE_OPENED } from './ipc/channels'

// Capture before Electron changes cwd
const launchCwd = process.cwd()

const ptyManager = new PtyManager()
let mainWindow: BrowserWindow | null = null
let ipcCleanup: IpcCleanup | null = null

function buildRecentWorkspacesSubmenu(): Electron.MenuItemConstructorOptions[] {
  const recent = configStore.get('recentWorkspaces', []) as string[]
  if (recent.length === 0) {
    return [{ label: 'No Recent Workspaces', enabled: false }]
  }
  return recent.map((ws) => ({
    label: ws.split('/').pop() || ws,
    sublabel: ws,
    click: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(WORKSPACE_OPENED, ws)
      }
    },
  }))
}

function rebuildMenu(): void {
  if (process.platform !== 'darwin') return
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Workspace…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(WORKSPACE_OPENED, '__dialog__')
            }
          },
        },
        {
          label: 'Recent Workspaces',
          submenu: buildRecentWorkspacesSubmenu(),
        },
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        // No role:'close' — its Cmd+W accelerator outranks the renderer's
        // close-session shortcut on macOS and closed the whole app window
        // with every session in it.
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    // macOS: hiddenInset keeps traffic-light buttons overlaid on content
    // Windows/Linux: frame:false removes the native title bar entirely
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 10 } }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Sanitize <webview> creation: never allow a preload/node integration to
  // be injected via attributes, and only attach http(s) content.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    if (params.src && !isAllowedWebviewUrl(params.src)) {
      event.preventDefault()
    }
  })

  // Disable native Electron/Chromium zoom so Ctrl+scroll only controls the canvas
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow!.webContents.setVisualZoomLevelLimits(1, 1)
  })

  // NOTE: no before-input-event blocker for Cmd+=/-/0. Chromium's native
  // zoom only triggers through menu roles (we register none) and pinch
  // zoom is disabled via setVisualZoomLevelLimits above — while blocking
  // these keys here also prevented the renderer's own zoomIn/zoomOut/
  // resetZoom shortcuts (bound to exactly these keys) from ever firing.

  if (process.env.NODE_ENV !== 'production' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Canvas webviews may only show http(s) content (mirrors renderer urlValidation). */
function isAllowedWebviewUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return

  // These guards must live in the main process: the <webview> 'new-window'
  // DOM event was removed in modern Electron, and calling preventDefault on
  // the embedder-side 'will-navigate' event is a no-op.
  contents.setWindowOpenHandler(({ url }) => {
    // Open popups/new windows in the same webview when allowed
    if (isAllowedWebviewUrl(url)) {
      void contents.loadURL(url)
    }
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (!isAllowedWebviewUrl(url)) {
      event.preventDefault()
    }
  })
})

app.whenReady().then(async () => {
  // Set an explicit application menu to prevent macOS "representedObject is not a
  // WeakPtrToElectronMenuModelAsNSObject" console spam (Electron bug triggered by
  // the auto-generated default menu during text input in CodeMirror).
  rebuildMenu()

  ipcCleanup = await registerIpcHandlers(ptyManager, () => mainWindow, launchCwd, rebuildMenu)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  ipcCleanup?.dispose()
  ptyManager.killAll()
  // Persist any pending write-behind config mutations before exit
  flushConfigWrites()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
