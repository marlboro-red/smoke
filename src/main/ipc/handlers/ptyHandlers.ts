import { ipcMain, type BrowserWindow } from 'electron'
import { PtyManager } from '../../pty/PtyManager'
import { PtyDataBatcher } from '../../pty/PtyDataBatcher'
import { configStore, defaultPreferences } from '../../config/ConfigStore'
import { terminalOutputBuffer } from '../../ai/TerminalOutputBuffer'
import {
  PTY_SPAWN,
  PTY_DATA_TO_PTY,
  PTY_DATA_FROM_PTY,
  PTY_DATA_ACK,
  PTY_RESIZE,
  PTY_KILL,
  PTY_EXIT,
  type PtySpawnRequest,
  type PtySpawnResponse,
  type PtyDataToPty,
  type PtyResizeMessage,
  type PtyKillMessage,
} from '../channels'

export function registerPtyHandlers(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
): void {
  // PTY data batcher: accumulates data chunks per session over a short window
  // and sends them as a single IPC message. Applies backpressure when the
  // renderer falls behind.
  const ptyBatcher = new PtyDataBatcher({
    send(id: string, data: string) {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PTY_DATA_FROM_PTY, { id, data })
      }
    },
    pause(id: string) {
      ptyManager.get(id)?.pause()
    },
    resume(id: string) {
      ptyManager.get(id)?.resume()
    },
  })

  // Renderer acknowledges receipt of a batched data message
  ipcMain.on(PTY_DATA_ACK, (_event, message: { id: string }) => {
    ptyBatcher.ack(message.id)
  })

  ipcMain.handle(PTY_SPAWN, (_event, request: PtySpawnRequest): PtySpawnResponse => {
    const preferences = configStore.get('preferences', defaultPreferences)

    // Use configured default shell if no shell specified in request
    const shell = request.shell || (preferences.defaultShell || undefined)

    const pty = ptyManager.spawn({
      id: request.id,
      cwd: request.cwd,
      shell,
      args: request.args,
      env: request.env,
      cols: request.cols,
      rows: request.rows
    })

    pty.on('data', (data: string) => {
      try {
        terminalOutputBuffer.append(pty.id, data)
        ptyBatcher.push(pty.id, data)
      } catch (err) {
        console.error(`[pty:data] Error forwarding data for ${pty.id}:`, err)
      }
    })

    pty.on('exit', (exitCode: number, signal?: number) => {
      try {
        ptyBatcher.remove(pty.id)
        terminalOutputBuffer.delete(pty.id)
        const userInitiated = ptyManager.isUserInitiatedKill(pty.id)
        ptyManager.clearUserInitiatedKill(pty.id)
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(PTY_EXIT, { id: pty.id, exitCode, signal, userInitiated })
        }
      } catch (err) {
        console.error(`[pty:exit] Error handling exit for ${pty.id}:`, err)
      }
    })

    // Determine startup command: per-session > global preference > legacy autoLaunchClaude
    const startupCmd = request.startupCommand
      || preferences.startupCommand
      || (preferences.autoLaunchClaude && preferences.claudeCommand ? preferences.claudeCommand : '')

    if (startupCmd) {
      // Wait for the shell to emit its first output (prompt/motd) before sending
      // the startup command. This is more reliable than a fixed delay because
      // different shells take varying amounts of time to initialize.
      let sent = false
      const sendStartupCommand = (): void => {
        if (sent) return
        sent = true
        setTimeout(() => {
          pty.write(startupCmd + '\n')
        }, 50)
      }

      pty.once('data', sendStartupCommand)

      // Safety fallback: if the shell never emits data within 3s, send anyway
      setTimeout(() => {
        if (!sent) {
          pty.removeListener('data', sendStartupCommand)
          sendStartupCommand()
        }
      }, 3000)
    }

    return { id: pty.id, pid: pty.pid }
  })

  ipcMain.on(PTY_DATA_TO_PTY, (_event, message: PtyDataToPty) => {
    try {
      ptyManager.write(message.id, message.data)
    } catch (err) {
      console.error('[pty:data:to-pty] Error writing to PTY:', err)
    }
  })

  ipcMain.on(PTY_RESIZE, (_event, message: PtyResizeMessage) => {
    try {
      ptyManager.resize(message.id, message.cols, message.rows)
    } catch (err) {
      console.error('[pty:resize] Error resizing PTY:', err)
    }
  })

  ipcMain.on(PTY_KILL, (_event, message: PtyKillMessage) => {
    try {
      ptyManager.gracefulKill(message.id)
    } catch (err) {
      console.error('[pty:kill] Error killing PTY:', err)
    }
  })
}
