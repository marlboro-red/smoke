/**
 * Plugin IPC handlers — main-process backend for plugin API calls.
 *
 * Plugins call PluginContext methods in the renderer. Those calls are
 * forwarded via IPC to these handlers, which execute them with per-plugin
 * permission enforcement based on the plugin's manifest declarations.
 *
 * Each request includes a `pluginId` so the handler can look up the
 * plugin's granted permissions and sandbox root.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { execFile } from 'child_process'
import { app } from 'electron'
import { PluginPermissionManager, type ContextPermission } from './PluginPermissionManager'
import type { PluginPermission as ManifestPermission } from './pluginManifest'
import {
  PLUGIN_REGISTER,
  PLUGIN_UNREGISTER,
  PLUGIN_FS_READ_FILE,
  PLUGIN_FS_WRITE_FILE,
  PLUGIN_FS_READ_DIR,
  PLUGIN_EXECUTE_COMMAND,
  PLUGIN_GET_STATE,
  PLUGIN_SET_STATE,
  PLUGIN_REQUEST_PERMISSION,
  type PluginRegisterRequest,
  type PluginFsReadFileRequest,
  type PluginFsReadFileResponse,
  type PluginFsWriteFileRequest,
  type PluginFsWriteFileResponse,
  type PluginFsReadDirRequest,
  type PluginFsReadDirEntry,
  type PluginExecuteCommandRequest,
  type PluginExecuteCommandResponse,
  type PluginGetStateRequest,
  type PluginSetStateRequest,
  type PluginRequestPermissionRequest,
} from '../ipc/channels'
import { configStore } from '../config/ConfigStore'
import { resolveNearestReal, isWithinBoundary } from '../ipc/pathBoundary'

/** Shared permission manager instance — exported for testing. */
export const pluginPermissionManager = new PluginPermissionManager()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_PLUGIN_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const COMMAND_TIMEOUT_MS = 30_000 // 30 seconds

/**
 * Allowlist of commands that plugins may execute.
 * Only bare command names are permitted — no absolute paths, no path separators.
 * The OS will resolve these via PATH, scoped to the plugin's sandbox cwd.
 */
export const ALLOWED_PLUGIN_COMMANDS: ReadonlySet<string> = new Set([
  // Version control
  'git',
  // Node.js ecosystem
  'node', 'npm', 'npx', 'yarn', 'pnpm',
  // Build tools
  'make', 'cmake',
  // Common utilities
  'echo', 'cat', 'ls', 'dir', 'find', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq',
  'cp', 'mv', 'mkdir', 'touch',
  // Docker
  'docker', 'docker-compose',
  // Python
  'python', 'python3', 'pip', 'pip3',
  // Rust
  'cargo', 'rustc',
  // Go
  'go',
  // Other runtimes
  'deno', 'bun', 'ruby', 'java', 'javac',
  // Misc
  'curl', 'wget', 'jq', 'tar', 'gzip', 'unzip',
])

/**
 * Validate a command name against the allowlist.
 * Rejects absolute paths, path separators, and commands not on the allowlist.
 */
export function validatePluginCommand(command: string): void {
  // Reject empty commands
  if (!command || command.trim().length === 0) {
    throw new Error('Plugin command must not be empty')
  }

  // Reject commands containing path separators (absolute or relative paths to binaries)
  if (command.includes('/') || command.includes('\\')) {
    throw new Error(
      `Plugin command must be a bare command name, not a path: "${command}". ` +
      `Allowed commands: ${[...ALLOWED_PLUGIN_COMMANDS].join(', ')}`
    )
  }

  // Reject commands not on the allowlist
  if (!ALLOWED_PLUGIN_COMMANDS.has(command)) {
    throw new Error(
      `Plugin command "${command}" is not allowed. ` +
      `Allowed commands: ${[...ALLOWED_PLUGIN_COMMANDS].join(', ')}`
    )
  }
}

/**
 * Resolve a relative path within a plugin's sandbox, ensuring it doesn't
 * escape via `..`, absolute paths, or symlinks.
 *
 * Uses fs.realpath (via resolveNearestReal) to resolve symlinks before
 * checking containment, preventing symlink-based sandbox escapes.
 */
async function resolveSandboxPath(sandboxRoot: string, relativePath: string): Promise<string> {
  // Reject absolute paths
  if (path.isAbsolute(relativePath)) {
    throw new Error('Absolute paths are not allowed — use paths relative to plugin root')
  }

  const resolved = path.resolve(sandboxRoot, relativePath)

  // Resolve symlinks on both the target and the sandbox root
  const realResolved = await resolveNearestReal(resolved)
  const realSandbox = await resolveNearestReal(sandboxRoot)

  // Ensure the real path is still within the real sandbox
  if (!isWithinBoundary(realResolved, realSandbox)) {
    throw new Error('Path escapes plugin sandbox')
  }

  return resolved
}

/**
 * Throw a permission-denied error for a given plugin and permission.
 */
function denyPermission(pluginId: string, permission: ContextPermission): never {
  throw new Error(
    `Permission denied: plugin "${pluginId}" requires "${permission}" — ` +
    `declare it in the manifest or request it at runtime`
  )
}

/**
 * Get or create the plugin state directory.
 * Plugin state is stored at: <userData>/plugin-state/<pluginId>/
 */
function getPluginStateDir(pluginId: string): string {
  return path.join(app.getPath('userData'), 'plugin-state', pluginId)
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface PluginIpcCleanup {
  dispose: () => void
}

export function registerPluginIpcHandlers(
  getMainWindow: () => BrowserWindow | null
): PluginIpcCleanup {
  // -- Plugin registration / unregistration --------------------------------

  ipcMain.handle(
    PLUGIN_REGISTER,
    (_event, request: PluginRegisterRequest): void => {
      pluginPermissionManager.register(
        request.pluginId,
        request.permissions,
        request.sandboxRoot
      )
    }
  )

  ipcMain.handle(PLUGIN_UNREGISTER, (_event, pluginId: string): void => {
    pluginPermissionManager.unregister(pluginId)
  })

  // -- File system (scoped to sandbox) -------------------------------------

  ipcMain.handle(
    PLUGIN_FS_READ_FILE,
    async (_event, request: PluginFsReadFileRequest): Promise<PluginFsReadFileResponse> => {
      const { pluginId, path: relativePath } = request

      if (!pluginPermissionManager.hasPermission(pluginId, 'fs:read')) {
        denyPermission(pluginId, 'fs:read')
      }

      const sandboxRoot = pluginPermissionManager.getSandboxRoot(pluginId)
      if (!sandboxRoot) throw new Error(`Plugin "${pluginId}" is not registered`)

      const filePath = await resolveSandboxPath(sandboxRoot, relativePath)
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_PLUGIN_FILE_SIZE) {
        throw new Error(`File too large: ${stat.size} bytes (max ${MAX_PLUGIN_FILE_SIZE})`)
      }

      const content = await fs.readFile(filePath, 'utf-8')
      return { content, size: stat.size }
    }
  )

  ipcMain.handle(
    PLUGIN_FS_WRITE_FILE,
    async (_event, request: PluginFsWriteFileRequest): Promise<PluginFsWriteFileResponse> => {
      const { pluginId, path: relativePath, content } = request

      if (!pluginPermissionManager.hasPermission(pluginId, 'fs:write')) {
        denyPermission(pluginId, 'fs:write')
      }

      const sandboxRoot = pluginPermissionManager.getSandboxRoot(pluginId)
      if (!sandboxRoot) throw new Error(`Plugin "${pluginId}" is not registered`)

      const filePath = await resolveSandboxPath(sandboxRoot, relativePath)
      const buf = Buffer.from(content, 'utf-8')
      if (buf.length > MAX_PLUGIN_FILE_SIZE) {
        throw new Error(`Content too large: ${buf.length} bytes (max ${MAX_PLUGIN_FILE_SIZE})`)
      }

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
      return { size: buf.length }
    }
  )

  ipcMain.handle(
    PLUGIN_FS_READ_DIR,
    async (_event, request: PluginFsReadDirRequest): Promise<PluginFsReadDirEntry[]> => {
      const { pluginId, path: relativePath } = request

      if (!pluginPermissionManager.hasPermission(pluginId, 'fs:read')) {
        denyPermission(pluginId, 'fs:read')
      }

      const sandboxRoot = pluginPermissionManager.getSandboxRoot(pluginId)
      if (!sandboxRoot) throw new Error(`Plugin "${pluginId}" is not registered`)

      const dirPath = await resolveSandboxPath(sandboxRoot, relativePath)
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const results: PluginFsReadDirEntry[] = []

      for (const entry of entries) {
        let type: PluginFsReadDirEntry['type'] = 'other'
        let size = 0

        if (entry.isFile()) {
          type = 'file'
          try {
            const stat = await fs.stat(path.join(dirPath, entry.name))
            size = stat.size
          } catch {
            // stat may fail for broken symlinks
          }
        } else if (entry.isDirectory()) {
          type = 'directory'
        } else if (entry.isSymbolicLink()) {
          type = 'symlink'
        }

        results.push({ name: entry.name, type, size })
      }

      return results
    }
  )

  // -- Command execution ---------------------------------------------------

  ipcMain.handle(
    PLUGIN_EXECUTE_COMMAND,
    async (_event, request: PluginExecuteCommandRequest): Promise<PluginExecuteCommandResponse> => {
      const { pluginId, command, args = [] } = request

      if (!pluginPermissionManager.hasPermission(pluginId, 'shell:execute')) {
        denyPermission(pluginId, 'shell:execute')
      }

      // Validate command against allowlist before execution
      validatePluginCommand(command)

      const sandboxRoot = pluginPermissionManager.getSandboxRoot(pluginId)
      if (!sandboxRoot) throw new Error(`Plugin "${pluginId}" is not registered`)

      return new Promise<PluginExecuteCommandResponse>((resolve) => {
        execFile(
          command,
          args,
          {
            cwd: sandboxRoot,
            timeout: COMMAND_TIMEOUT_MS,
            maxBuffer: MAX_PLUGIN_FILE_SIZE,
            env: { ...process.env },
          },
          (error, stdout, stderr) => {
            resolve({
              exitCode: error && 'code' in error ? (error.code as number ?? 1) : 0,
              stdout: stdout ?? '',
              stderr: stderr ?? '',
            })
          }
        )
      })
    }
  )

  // -- Plugin state persistence --------------------------------------------

  ipcMain.handle(
    PLUGIN_GET_STATE,
    async (_event, request: PluginGetStateRequest): Promise<unknown> => {
      const { pluginId, key } = request

      if (!pluginPermissionManager.isRegistered(pluginId)) {
        throw new Error(`Plugin "${pluginId}" is not registered`)
      }

      const stateDir = getPluginStateDir(pluginId)
      const filePath = path.join(stateDir, `${key}.json`)

      try {
        const content = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(content)
      } catch {
        return undefined
      }
    }
  )

  ipcMain.handle(
    PLUGIN_SET_STATE,
    async (_event, request: PluginSetStateRequest): Promise<void> => {
      const { pluginId, key, value } = request

      if (!pluginPermissionManager.isRegistered(pluginId)) {
        throw new Error(`Plugin "${pluginId}" is not registered`)
      }

      const stateDir = getPluginStateDir(pluginId)
      await fs.mkdir(stateDir, { recursive: true })

      const filePath = path.join(stateDir, `${key}.json`)
      await fs.writeFile(filePath, JSON.stringify(value), 'utf-8')
    }
  )

  // -- Permission request --------------------------------------------------

  ipcMain.handle(
    PLUGIN_REQUEST_PERMISSION,
    async (_event, request: PluginRequestPermissionRequest): Promise<boolean> => {
      const { pluginId, permission } = request

      if (!pluginPermissionManager.isRegistered(pluginId)) {
        throw new Error(`Plugin "${pluginId}" is not registered`)
      }

      // Already has the permission
      if (pluginPermissionManager.hasPermission(pluginId, permission)) {
        return true
      }

      // Prompt the user
      const win = getMainWindow()
      if (!win) return false

      const result = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Deny', 'Allow'],
        defaultId: 0,
        cancelId: 0,
        title: 'Plugin Permission Request',
        message: `Plugin "${pluginId}" is requesting the "${permission}" permission.`,
        detail: 'Do you want to allow this? The permission will last until the plugin is unloaded.',
      })

      if (result.response === 1) {
        pluginPermissionManager.grantRuntimePermission(pluginId, permission)
        return true
      }

      return false
    }
  )

  return {
    dispose(): void {
      ipcMain.removeHandler(PLUGIN_REGISTER)
      ipcMain.removeHandler(PLUGIN_UNREGISTER)
      ipcMain.removeHandler(PLUGIN_FS_READ_FILE)
      ipcMain.removeHandler(PLUGIN_FS_WRITE_FILE)
      ipcMain.removeHandler(PLUGIN_FS_READ_DIR)
      ipcMain.removeHandler(PLUGIN_EXECUTE_COMMAND)
      ipcMain.removeHandler(PLUGIN_GET_STATE)
      ipcMain.removeHandler(PLUGIN_SET_STATE)
      ipcMain.removeHandler(PLUGIN_REQUEST_PERMISSION)
    },
  }
}
