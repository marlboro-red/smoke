import { ipcMain, type BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { isWithinBoundary } from '../pathBoundary'
import {
  RECORDING_FLUSH,
  RECORDING_LIST,
  RECORDING_LOAD,
  RECORDING_EXPORT,
  RECORDING_IMPORT,
  type RecordingFlushRequest,
  type RecordingListEntry,
  type RecordingLoadRequest,
  type RecordingExportRequest,
  type RecordingExportResponse,
  type RecordingImportResponse,
} from '../channels'

export interface RecordingHandlersCleanup {
  dispose: () => void
}

export function registerRecordingHandlers(
  getMainWindow: () => BrowserWindow | null,
): RecordingHandlersCleanup {
  // Recording handler — flush event log to disk
  ipcMain.handle(RECORDING_FLUSH, async (_event, request: RecordingFlushRequest): Promise<string> => {
    const { app } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    await fs.mkdir(recordingsDir, { recursive: true })
    const filename = `recording-${new Date(request.startedAt).toISOString().replace(/[:.]/g, '-')}.json`
    const filePath = path.join(recordingsDir, filename)
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf-8')
    return filePath
  })

  // Recording handler — list saved recordings
  ipcMain.handle(RECORDING_LIST, async (): Promise<RecordingListEntry[]> => {
    const { app } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    try {
      const files = await fs.readdir(recordingsDir)
      const entries: RecordingListEntry[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const content = await fs.readFile(path.join(recordingsDir, file), 'utf-8')
          const log = JSON.parse(content) as RecordingFlushRequest
          const events = log.events || []
          const duration = events.length > 0
            ? events[events.length - 1].timestamp - events[0].timestamp
            : 0
          entries.push({
            filename: file,
            startedAt: log.startedAt,
            eventCount: events.length,
            durationMs: duration,
          })
        } catch (err) {
          console.warn(`[ipc] Skipping malformed recording file: ${file}`, err)
        }
      }
      return entries.sort((a, b) => b.startedAt - a.startedAt)
    } catch (err) {
      console.warn('[ipc] Failed to list recordings:', err)
      return []
    }
  })

  // Recording handler — load a specific recording
  ipcMain.handle(RECORDING_LOAD, async (_event, request: RecordingLoadRequest): Promise<RecordingFlushRequest | null> => {
    const { app } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    const safeName = path.basename(request.filename)
    if (safeName !== request.filename) return null
    const targetPath = path.join(recordingsDir, safeName)
    if (!isWithinBoundary(targetPath, recordingsDir)) return null
    try {
      const content = await fs.readFile(targetPath, 'utf-8')
      return JSON.parse(content) as RecordingFlushRequest
    } catch {
      return null
    }
  })

  // Recording handler — export a recording as .smoke-replay file
  ipcMain.handle(RECORDING_EXPORT, async (_event, request: RecordingExportRequest): Promise<RecordingExportResponse> => {
    const { app, dialog } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')

    // Read the source recording (sanitize filename to prevent path traversal)
    const safeName = path.basename(request.filename)
    if (safeName !== request.filename) {
      throw new Error(`Invalid recording filename: ${request.filename}`)
    }
    const sourcePath = path.join(recordingsDir, safeName)
    if (!isWithinBoundary(sourcePath, recordingsDir)) {
      throw new Error(`Invalid recording filename: ${request.filename}`)
    }
    let log: RecordingFlushRequest
    try {
      const content = await fs.readFile(sourcePath, 'utf-8')
      log = JSON.parse(content) as RecordingFlushRequest
    } catch {
      throw new Error(`Failed to read recording: ${request.filename}`)
    }

    // Build the export payload with metadata
    const exportData = {
      format: 'smoke-replay',
      version: log.version,
      exportedAt: Date.now(),
      startedAt: log.startedAt,
      eventCount: log.events.length,
      events: log.events,
    }

    const defaultName = request.filename.replace(/\.json$/, '.smoke-replay')
    const win = getMainWindow()
    if (!win) return { filePath: null }
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Recording',
      defaultPath: defaultName,
      filters: [
        { name: 'Smoke Replay', extensions: ['smoke-replay'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { filePath: null }
    }

    await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
    return { filePath: result.filePath }
  })

  // Recording handler — import a .smoke-replay or JSON recording
  ipcMain.handle(RECORDING_IMPORT, async (): Promise<RecordingImportResponse | null> => {
    const { app, dialog } = await import('electron')
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    await fs.mkdir(recordingsDir, { recursive: true })

    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Recording',
      filters: [
        { name: 'Smoke Replay', extensions: ['smoke-replay', 'json'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const importPath = result.filePaths[0]
    let data: Record<string, unknown>
    try {
      const content = await fs.readFile(importPath, 'utf-8')
      data = JSON.parse(content) as Record<string, unknown>
    } catch {
      throw new Error(`Failed to parse recording file: ${path.basename(importPath)}`)
    }

    // Normalize: accept both smoke-replay format and raw EventLog format
    const events: Array<{ timestamp: number; type: string; payload: unknown }> = data.events || []
    const startedAt: number = data.startedAt || (events.length > 0 ? events[0].timestamp : Date.now())
    const version: number = data.version || 1

    // Generate a unique filename for the imported recording
    const filename = `recording-imported-${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}-${Date.now().toString(36)}.json`
    const destPath = path.join(recordingsDir, filename)

    const normalized: RecordingFlushRequest = { version, startedAt, events }
    await fs.writeFile(destPath, JSON.stringify(normalized, null, 2), 'utf-8')

    const durationMs = events.length > 0
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0

    return {
      filename,
      startedAt,
      eventCount: events.length,
      durationMs,
    }
  })

  return {
    dispose(): void {
      ipcMain.removeHandler(RECORDING_FLUSH)
      ipcMain.removeHandler(RECORDING_LIST)
      ipcMain.removeHandler(RECORDING_LOAD)
      ipcMain.removeHandler(RECORDING_EXPORT)
      ipcMain.removeHandler(RECORDING_IMPORT)
    },
  }
}
