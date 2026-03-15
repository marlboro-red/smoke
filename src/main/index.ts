import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { registerIpcHandlers } from './ipc/ipcHandlers'

// Capture before Electron changes cwd
const launchCwd = process.cwd()

const ptyManager = new PtyManager()
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
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

app.whenReady().then(() => {
  registerIpcHandlers(ptyManager, () => mainWindow, launchCwd)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  ptyManager.killAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
