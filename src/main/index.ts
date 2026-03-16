import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { registerIpcHandlers, type IpcCleanup } from './ipc/ipcHandlers'

// Capture before Electron changes cwd
const launchCwd = process.cwd()

const ptyManager = new PtyManager()
let mainWindow: BrowserWindow | null = null
let ipcCleanup: IpcCleanup | null = null

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
      sandbox: false,
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

  // Disable native Electron/Chromium zoom so Ctrl+scroll only controls the canvas
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow!.webContents.setVisualZoomLevelLimits(1, 1)
  })

  // Block Ctrl+=/Ctrl+-/Ctrl+0 keyboard shortcuts that trigger native zoom
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if ((input.control || input.meta) && (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '0')) {
      _event.preventDefault()
    }
  })

  if (process.env.NODE_ENV !== 'production' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Set an explicit application menu to prevent macOS "representedObject is not a
  // WeakPtrToElectronMenuModelAsNSObject" console spam (Electron bug triggered by
  // the auto-generated default menu during text input in CodeMirror).
  if (process.platform === 'darwin') {
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
          { role: 'close' },
          { type: 'separator' },
          { role: 'front' }
        ]
      }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  ipcCleanup = await registerIpcHandlers(ptyManager, () => mainWindow, launchCwd)
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
