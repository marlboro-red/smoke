import { ipcMain, type BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { configStore, defaultPreferences } from '../../config/ConfigStore'
import { FileWatcher } from '../../watcher/FileWatcher'
import { assertWithinHome, assertWithinAny } from '../pathBoundary'
import {
  FS_READDIR,
  FS_READFILE,
  FS_READFILE_BASE64,
  FS_WRITEFILE,
  FS_WATCH,
  FS_UNWATCH,
  type FsReaddirRequest,
  type FsReaddirEntry,
  type FsReadfileRequest,
  type FsReadfileResponse,
  type FsReadfileBase64Request,
  type FsReadfileBase64Response,
  type FsWritefileRequest,
  type FsWritefileResponse,
  type FsWatchRequest,
  type FsWatchResponse,
  type FsUnwatchRequest,
  type FsUnwatchResponse,
} from '../channels'

export interface FsHandlersCleanup {
  dispose: () => void
}

export function registerFsHandlers(
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string,
): FsHandlersCleanup {
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB default max

  ipcMain.handle(FS_READDIR, async (_event, request: FsReaddirRequest): Promise<FsReaddirEntry[]> => {
    const dirPath = path.resolve(request.path)
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const CONCURRENCY = 16

    const mapEntry = async (entry: import('fs').Dirent): Promise<FsReaddirEntry> => {
      let type: FsReaddirEntry['type'] = 'other'
      let size = 0

      if (entry.isFile()) {
        type = 'file'
        try {
          const stat = await fs.stat(path.join(dirPath, entry.name))
          size = stat.size
        } catch (err) {
          console.warn(`[ipc] Failed to stat ${path.join(dirPath, entry.name)}:`, err)
        }
      } else if (entry.isDirectory()) {
        type = 'directory'
      } else if (entry.isSymbolicLink()) {
        type = 'symlink'
      }

      return { name: entry.name, type, size }
    }

    // Process entries with bounded concurrency
    const results: FsReaddirEntry[] = new Array(entries.length)
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(batch.map(mapEntry))
      for (let j = 0; j < batchResults.length; j++) {
        results[i + j] = batchResults[j]
      }
    }

    return results
  })

  ipcMain.handle(FS_READFILE, async (_event, request: FsReadfileRequest): Promise<FsReadfileResponse> => {
    const filePath = path.resolve(request.path)
    const maxSize = request.maxSize ?? MAX_FILE_SIZE

    // Safety: reject paths outside allowed directories (home, launch cwd, current workspace)
    const homedir = require('os').homedir()
    const defaultCwd = configStore.get('preferences', defaultPreferences).defaultCwd
    const allowed = [homedir, launchCwd]
    if (defaultCwd) allowed.push(defaultCwd)
    await assertWithinAny(filePath, allowed)

    const stat = await fs.stat(filePath)
    if (stat.size > maxSize) {
      throw new Error(`File too large: ${stat.size} bytes (max ${maxSize})`)
    }

    const content = await fs.readFile(filePath, 'utf-8')
    return { content, size: stat.size }
  })

  const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  }

  ipcMain.handle(FS_READFILE_BASE64, async (_event, request: FsReadfileBase64Request): Promise<FsReadfileBase64Response> => {
    const filePath = path.resolve(request.path)
    const maxSize = request.maxSize ?? MAX_FILE_SIZE

    // Safety: reject paths outside allowed directories (home, launch cwd, current workspace)
    const homedir = require('os').homedir()
    const defaultCwd = configStore.get('preferences', defaultPreferences).defaultCwd
    const allowed = [homedir, launchCwd]
    if (defaultCwd) allowed.push(defaultCwd)
    await assertWithinAny(filePath, allowed)

    const stat = await fs.stat(filePath)
    if (stat.size > maxSize) {
      throw new Error(`File too large: ${stat.size} bytes (max ${maxSize})`)
    }

    const ext = path.extname(filePath).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

    const buffer = await fs.readFile(filePath)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    return { dataUrl, size: stat.size, mimeType }
  })

  ipcMain.handle(FS_WRITEFILE, async (_event, request: FsWritefileRequest): Promise<FsWritefileResponse> => {
    const filePath = path.resolve(request.path)

    // Safety: reject absolute paths outside the user's home directory
    const homedir = require('os').homedir()
    await assertWithinHome(filePath, homedir)

    // Safety: reject writes to dotfiles/hidden config directories at the home root
    const relToHome = path.relative(homedir, filePath)
    const topSegment = relToHome.split(path.sep)[0]
    if (topSegment.startsWith('.') && topSegment !== '.') {
      throw new Error(`Write denied: cannot write to hidden config directories`)
    }

    const content = Buffer.from(request.content, 'utf-8')
    if (content.length > MAX_FILE_SIZE) {
      throw new Error(`Content too large: ${content.length} bytes (max ${MAX_FILE_SIZE})`)
    }

    await fs.writeFile(filePath, request.content, 'utf-8')
    return { size: content.length }
  })

  // File watcher handlers
  const fileWatcher = new FileWatcher(getMainWindow)

  ipcMain.handle(FS_WATCH, async (_event, request: FsWatchRequest): Promise<FsWatchResponse> => {
    const filePath = path.resolve(request.path)

    // Safety: reject paths outside allowed directories (home, launch cwd, current workspace)
    const homedir = require('os').homedir()
    const defaultCwd = configStore.get('preferences', defaultPreferences).defaultCwd
    const allowed = [homedir, launchCwd]
    if (defaultCwd) allowed.push(defaultCwd)
    await assertWithinAny(filePath, allowed)

    return fileWatcher.watch(filePath)
  })

  ipcMain.handle(FS_UNWATCH, (_event, request: FsUnwatchRequest): FsUnwatchResponse => {
    fileWatcher.unwatch(request.path)
    return { success: true }
  })

  return {
    dispose(): void {
      fileWatcher.dispose()
    },
  }
}
