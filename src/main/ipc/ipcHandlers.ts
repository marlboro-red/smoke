import { ipcMain, BrowserWindow } from 'electron'
import { PtyManager } from '../pty/PtyManager'
import {
  PTY_SPAWN,
  PTY_DATA_TO_PTY,
  PTY_DATA_FROM_PTY,
  PTY_RESIZE,
  PTY_KILL,
  PTY_EXIT,
  PtySpawnRequest,
  PtySpawnResponse,
  PtyDataToPty,
  PtyResizeMessage,
  PtyKillMessage
} from './channels'

export function registerIpcHandlers(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(PTY_SPAWN, (_event, request: PtySpawnRequest): PtySpawnResponse => {
    const pty = ptyManager.spawn({
      id: request.id,
      cwd: request.cwd,
      shell: request.shell,
      args: request.args,
      env: request.env,
      cols: request.cols,
      rows: request.rows
    })

    pty.on('data', (data: string) => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PTY_DATA_FROM_PTY, { id: pty.id, data })
      }
    })

    pty.on('exit', (exitCode: number, signal?: number) => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PTY_EXIT, { id: pty.id, exitCode, signal })
      }
    })

    return { id: pty.id, pid: pty.pid }
  })

  ipcMain.on(PTY_DATA_TO_PTY, (_event, message: PtyDataToPty) => {
    ptyManager.write(message.id, message.data)
  })

  ipcMain.on(PTY_RESIZE, (_event, message: PtyResizeMessage) => {
    ptyManager.resize(message.id, message.cols, message.rows)
  })

  ipcMain.on(PTY_KILL, (_event, message: PtyKillMessage) => {
    ptyManager.kill(message.id)
  })
}
