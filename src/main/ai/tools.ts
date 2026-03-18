/**
 * AI tool executor functions.
 *
 * Each tool returns a string result.
 * Write tools push canvas_action events to the renderer.
 *
 * When an agent is assigned to a group, tools are scoped:
 * - list_sessions only returns sessions in the agent's scope
 * - read/write/close_terminal only operate on in-scope sessions
 * - spawn_terminal auto-adds new sessions to the agent's scope and group
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { assertWithinHome } from '../ipc/pathBoundary'
import { v4 as uuid } from 'uuid'
import type { BrowserWindow } from 'electron'
import { app } from 'electron'
import { terminalOutputBuffer } from './TerminalOutputBuffer'
import type { PtyManager } from '../pty/PtyManager'
import { AI_CANVAS_ACTION, PTY_DATA_FROM_PTY, PTY_EXIT } from '../ipc/channels'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import type { AiStreamCanvasAction } from '../../preload/types'
import { buildCodeGraph, collectContext, computeWorkspaceLayout } from '../codegraph'
import type { SearchIndex } from '../codegraph/SearchIndex'
import type { StructureAnalyzer } from '../codegraph/StructureAnalyzer'
import type { PluginManifest } from '../plugin/pluginManifest'

export type ToolExecutor = (input: Record<string, unknown>) => Promise<string>

// ── Input validation helpers ────────────────────────────────────────

function requireString(input: Record<string, unknown>, field: string): string {
  const val = input[field]
  if (val === undefined || val === null) {
    throw new Error(`Missing required field: ${field}`)
  }
  if (typeof val !== 'string') {
    throw new Error(`Field "${field}" must be a string, got ${typeof val}`)
  }
  return val
}

function requireNumber(input: Record<string, unknown>, field: string): number {
  const val = input[field]
  if (val === undefined || val === null) {
    throw new Error(`Missing required field: ${field}`)
  }
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new Error(`Field "${field}" must be a finite number, got ${val}`)
  }
  return val
}

function optionalString(input: Record<string, unknown>, field: string, fallback?: string): string | undefined {
  const val = input[field]
  if (val === undefined || val === null) return fallback
  if (typeof val !== 'string') {
    throw new Error(`Field "${field}" must be a string, got ${typeof val}`)
  }
  return val
}

function optionalNumber(input: Record<string, unknown>, field: string, fallback?: number): number | undefined {
  const val = input[field]
  if (val === undefined || val === null) return fallback
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new Error(`Field "${field}" must be a finite number, got ${val}`)
  }
  return val
}

function optionalBoolean(input: Record<string, unknown>, field: string, fallback?: boolean): boolean | undefined {
  const val = input[field]
  if (val === undefined || val === null) return fallback
  if (typeof val !== 'boolean') {
    throw new Error(`Field "${field}" must be a boolean, got ${typeof val}`)
  }
  return val
}

function requirePosition(input: Record<string, unknown>, field: string): { x: number; y: number } {
  const val = input[field]
  if (val === undefined || val === null) {
    throw new Error(`Missing required field: ${field}`)
  }
  if (
    typeof val !== 'object' ||
    typeof (val as Record<string, unknown>).x !== 'number' ||
    typeof (val as Record<string, unknown>).y !== 'number'
  ) {
    throw new Error(`Field "${field}" must be an object with numeric x and y properties`)
  }
  return val as { x: number; y: number }
}

function optionalPosition(
  input: Record<string, unknown>,
  field: string,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  const val = input[field]
  if (val === undefined || val === null) return fallback
  if (
    typeof val !== 'object' ||
    typeof (val as Record<string, unknown>).x !== 'number' ||
    typeof (val as Record<string, unknown>).y !== 'number'
  ) {
    throw new Error(`Field "${field}" must be an object with numeric x and y properties`)
  }
  return val as { x: number; y: number }
}

/** Context for scope-aware tool execution. */
export interface AgentScopeProvider {
  agentId: string
  getAllowedSessionIds: () => Set<string> | null
  getAssignedGroupId: () => string | null
  addSessionToScope: (sessionId: string) => void
  getAllowedPaths: () => Set<string> | null
  addPathToScope: (dirPath: string) => void
  getColor: () => string
}

// ── Constants ──────────────────────────────────────────────────────
// (Tool definitions have moved to toolDefs.ts)
// ── Executor implementations ────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const CHAR_WIDTH = 8
const CHAR_HEIGHT = 18

/** Optional codegraph dependencies for assemble_workspace. */
export interface CodegraphDeps {
  searchIndex: SearchIndex
  structureAnalyzer: StructureAnalyzer
}

/** Optional plugin dependencies for plugin-aware tools. */
export interface PluginDeps {
  getPlugins: () => Array<{
    manifest: PluginManifest
    pluginDir: string
    entryPointPath: string
    source: 'global' | 'project'
  }>
  getPlugin: (name: string) => {
    manifest: PluginManifest
    pluginDir: string
    entryPointPath: string
    source: 'global' | 'project'
  } | undefined
}

/**
 * Create the full set of tool executors.
 * Exported for use by AgentManager + MCP bridge.
 */
export function createExecutors(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
  scope?: AgentScopeProvider,
  codegraphDeps?: CodegraphDeps,
  pluginDeps?: PluginDeps
): Map<string, ToolExecutor> {
  /** Send a canvas action event to the renderer. */
  function emitCanvasAction(
    action: AiStreamCanvasAction['action'],
    payload: Record<string, unknown>
  ): void {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      const event: AiStreamCanvasAction = {
        type: 'canvas_action',
        conversationId: '',
        action,
        payload,
      }
      win.webContents.send(AI_CANVAS_ACTION, event)
    }
  }

  const executors = new Map<string, ToolExecutor>()

  // ── get_canvas_state ──────────────────────────────────────────

  executors.set('get_canvas_state', async () => {
    const prefs = configStore.get('preferences', defaultPreferences) as Record<
      string,
      unknown
    >
    const gridSize = (prefs.gridSize as number) ?? 20
    const sessions = terminalOutputBuffer.sessions()

    return JSON.stringify({
      sessionCount: sessions.length,
      gridSize,
      sessions: sessions.map((id) => ({
        id,
        bufferSize: terminalOutputBuffer.size(id),
      })),
    })
  })

  // ── list_sessions ─────────────────────────────────────────────

  executors.set('list_sessions', async () => {
    let sessions = terminalOutputBuffer.sessions()
    const allowed = scope?.getAllowedSessionIds()
    if (allowed) {
      sessions = sessions.filter((id) => allowed.has(id))
    }
    if (sessions.length === 0) {
      return 'No active terminal sessions.'
    }

    const details = sessions.map((id) => ({
      id,
      bufferSize: terminalOutputBuffer.size(id),
      hasOutput: terminalOutputBuffer.size(id) > 0,
    }))

    return JSON.stringify(details)
  })

  // ── read_terminal_output ──────────────────────────────────────

  executors.set('read_terminal_output', async (input) => {
    const sessionId = requireString(input, 'session_id')
    const lines = optionalNumber(input, 'lines', 100)!

    const allowed = scope?.getAllowedSessionIds()
    if (allowed && !allowed.has(sessionId)) {
      throw new Error(`Session ${sessionId} is outside this agent's assigned scope.`)
    }

    const output = terminalOutputBuffer.readLines(sessionId, lines)
    if (!output) {
      return `No output buffered for session ${sessionId}. The session may not exist or has no output yet.`
    }
    return output
  })

  // ── spawn_terminal ────────────────────────────────────────────

  executors.set('spawn_terminal', async (input) => {
    const prefs = configStore.get('preferences', defaultPreferences) as Record<
      string,
      unknown
    >
    const cwd =
      optionalString(input, 'cwd') || (prefs.defaultCwd as string) || process.cwd()
    const position = optionalPosition(input, 'position', { x: 100, y: 100 })
    const cols = optionalNumber(input, 'cols', 80)!
    const rows = optionalNumber(input, 'rows', 24)!
    const sessionId = uuid()

    const shell =
      (prefs.defaultShell as string) || undefined

    const pty = ptyManager.spawn({
      id: sessionId,
      cwd,
      shell,
      cols,
      rows,
    })

    // Wire PTY data and exit events to the renderer
    pty.on('data', (data: string) => {
      terminalOutputBuffer.append(pty.id, data)
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PTY_DATA_FROM_PTY, { id: pty.id, data })
      }
    })

    pty.on('exit', (exitCode: number, signal?: number) => {
      terminalOutputBuffer.delete(pty.id)
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(PTY_EXIT, { id: pty.id, exitCode, signal })
      }
    })

    const width = cols * CHAR_WIDTH
    const height = rows * CHAR_HEIGHT

    // Auto-add to agent's scope and group if assigned
    if (scope) {
      scope.addSessionToScope(sessionId)
      scope.addPathToScope(cwd)
    }
    const groupId = scope?.getAssignedGroupId() ?? null
    const agentId = scope?.agentId ?? null

    // Notify the renderer to create the session on the canvas
    emitCanvasAction('session_created', {
      sessionId,
      cwd,
      position,
      size: { cols, rows, width, height },
      agentId,
      groupId,
    })

    return JSON.stringify({ sessionId, cwd, cols, rows, pid: pty.pid })
  })

  // ── write_to_terminal ─────────────────────────────────────────

  executors.set('write_to_terminal', async (input) => {
    const sessionId = requireString(input, 'session_id')
    const text = requireString(input, 'text')

    const allowed = scope?.getAllowedSessionIds()
    if (allowed && !allowed.has(sessionId)) {
      throw new Error(`Session ${sessionId} is outside this agent's assigned scope.`)
    }

    const pty = ptyManager.get(sessionId)
    if (!pty) {
      throw new Error(`Terminal session ${sessionId} not found.`)
    }

    pty.write(text)
    return `Wrote ${text.length} characters to session ${sessionId}.`
  })

  // ── close_terminal ────────────────────────────────────────────

  executors.set('close_terminal', async (input) => {
    const sessionId = requireString(input, 'session_id')

    const allowed = scope?.getAllowedSessionIds()
    if (allowed && !allowed.has(sessionId)) {
      throw new Error(`Session ${sessionId} is outside this agent's assigned scope.`)
    }

    const pty = ptyManager.get(sessionId)
    if (!pty) {
      throw new Error(`Terminal session ${sessionId} not found.`)
    }

    pty.kill()

    // Notify the renderer to remove the session
    emitCanvasAction('session_closed', { sessionId })

    return `Closed terminal session ${sessionId}.`
  })

  // ── move_element ──────────────────────────────────────────────

  executors.set('move_element', async (input) => {
    const sessionId = requireString(input, 'session_id')
    const position = requirePosition(input, 'position')

    const allowed = scope?.getAllowedSessionIds()
    if (allowed && !allowed.has(sessionId)) {
      throw new Error(`Session ${sessionId} is outside this agent's assigned scope.`)
    }

    emitCanvasAction('session_moved', { sessionId, position })

    return `Moved session ${sessionId} to (${position.x}, ${position.y}).`
  })

  // ── resize_element ────────────────────────────────────────────

  executors.set('resize_element', async (input) => {
    const sessionId = requireString(input, 'session_id')
    const cols = requireNumber(input, 'cols')
    const rows = requireNumber(input, 'rows')
    const width = optionalNumber(input, 'width', cols * CHAR_WIDTH)!
    const height = optionalNumber(input, 'height', rows * CHAR_HEIGHT)!

    const allowed = scope?.getAllowedSessionIds()
    if (allowed && !allowed.has(sessionId)) {
      throw new Error(`Session ${sessionId} is outside this agent's assigned scope.`)
    }

    // Resize the underlying PTY
    const pty = ptyManager.get(sessionId)
    if (pty) {
      pty.resize(cols, rows)
    }

    // Notify the renderer to resize the session on the canvas
    emitCanvasAction('session_resized', {
      sessionId,
      size: { cols, rows, width, height },
    })

    return `Resized session ${sessionId} to ${cols}x${rows} (${width}x${height}px).`
  })

  // ── read_file ─────────────────────────────────────────────────

  executors.set('read_file', async (input) => {
    const filePath = path.resolve(requireString(input, 'path'))

    const allowedPaths = scope?.getAllowedPaths()
    if (allowedPaths) {
      const withinScope = [...allowedPaths].some(
        (dir) => filePath === dir || filePath.startsWith(dir + path.sep)
      )
      if (!withinScope) {
        throw new Error(`Path ${filePath} is outside this agent's assigned scope.`)
      }
    }

    const stat = await fs.stat(filePath)
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE}).`
      )
    }

    const content = await fs.readFile(filePath, 'utf-8')
    return content
  })

  // ── list_directory ────────────────────────────────────────────

  executors.set('list_directory', async (input) => {
    const dirPath = path.resolve(requireString(input, 'path'))

    const allowedPaths = scope?.getAllowedPaths()
    if (allowedPaths) {
      const withinScope = [...allowedPaths].some(
        (dir) => dirPath === dir || dirPath.startsWith(dir + path.sep)
      )
      if (!withinScope) {
        throw new Error(`Path ${dirPath} is outside this agent's assigned scope.`)
      }
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const results: Array<{
      name: string
      type: string
      size: number
    }> = []

    for (const entry of entries) {
      let type = 'other'
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

    return JSON.stringify(results)
  })

  // ── edit_file ───────────────────────────────────────────────

  executors.set('edit_file', async (input) => {
    const filePath = path.resolve(requireString(input, 'path'))

    // Safety: reject paths outside the user's home directory
    const homedir = require('os').homedir()
    await assertWithinHome(filePath, homedir)

    // Safety: reject writes to hidden config directories at the home root
    const relToHome = path.relative(homedir, filePath)
    const topSegment = relToHome.split(path.sep)[0]
    if (topSegment.startsWith('.') && topSegment !== '.') {
      throw new Error('Write denied: cannot write to hidden config directories')
    }

    const content = requireString(input, 'content')
    const contentBytes = Buffer.from(content, 'utf-8')
    if (contentBytes.length > MAX_FILE_SIZE) {
      throw new Error(
        `Content too large: ${contentBytes.length} bytes (max ${MAX_FILE_SIZE}).`
      )
    }

    await fs.writeFile(filePath, content, 'utf-8')

    const position = optionalPosition(input, 'position', { x: 100, y: 100 })

    // Detect language from file extension
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
      py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java',
      c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
      css: 'css', html: 'html', htm: 'html', json: 'json',
      yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
      md: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
      sql: 'sql', swift: 'swift', kt: 'kotlin', vue: 'vue',
      svelte: 'svelte', php: 'php', lua: 'lua', zig: 'zig',
    }
    const language = langMap[ext] || 'text'

    // Notify the renderer to create or update the file viewer
    emitCanvasAction('file_edited', {
      filePath,
      content,
      language,
      position,
    })

    return JSON.stringify({
      path: filePath,
      size: contentBytes.length,
      language,
    })
  })

  // ── pan_canvas ────────────────────────────────────────────────

  executors.set('pan_canvas', async (input) => {
    const x = requireNumber(input, 'x')
    const y = requireNumber(input, 'y')

    emitCanvasAction('viewport_panned', { panX: x, panY: y })

    return `Panned canvas viewport to (${x}, ${y}).`
  })

  // ── create_note ────────────────────────────────────────────────

  executors.set('create_note', async (input) => {
    const text = requireString(input, 'text')
    const position = optionalPosition(input, 'position', { x: 100, y: 100 })
    const color = optionalString(input, 'color', 'yellow')!
    const noteId = uuid()

    emitCanvasAction('note_created', { noteId, text, position, color })

    return JSON.stringify({ noteId, text, position, color })
  })

  // ── create_arrow ───────────────────────────────────────────────

  executors.set('create_arrow', async (input) => {
    const fromId = requireString(input, 'from_id')
    const toId = requireString(input, 'to_id')
    const label = optionalString(input, 'label')
    const color = optionalString(input, 'color')
    const connectorId = uuid()

    emitCanvasAction('connector_created', {
      connectorId,
      sourceId: fromId,
      targetId: toId,
      label,
      color,
    })

    return JSON.stringify({ connectorId, sourceId: fromId, targetId: toId, label })
  })

  // ── create_group ────────────────────────────────────────────────

  executors.set('create_group', async (input) => {
    const name = requireString(input, 'name')
    const color = optionalString(input, 'color')
    const groupId = uuid()

    emitCanvasAction('group_created', { groupId, name, color })

    return JSON.stringify({ groupId, name, color })
  })

  // ── add_to_group ────────────────────────────────────────────────

  executors.set('add_to_group', async (input) => {
    const elementId = requireString(input, 'element_id')
    const groupId = requireString(input, 'group_id')

    emitCanvasAction('group_member_added', { groupId, elementId })

    return `Added element ${elementId} to group ${groupId}.`
  })

  // ── broadcast_to_group ──────────────────────────────────────────

  executors.set('broadcast_to_group', async (input) => {
    const groupId = requireString(input, 'group_id')
    const command = requireString(input, 'command')

    emitCanvasAction('group_broadcast', { groupId, command })

    return `Broadcast ${command.length} characters to group ${groupId}.`
  })

  // ── assemble_workspace ──────────────────────────────────────

  executors.set('assemble_workspace', async (input) => {
    if (!codegraphDeps) {
      throw new Error('Workspace assembly is not available: codegraph dependencies not configured.')
    }

    const taskDescription = requireString(input, 'task_description')
    const prefs = configStore.get('preferences', defaultPreferences) as Record<string, unknown>
    const projectRoot = optionalString(input, 'project_root') || (prefs.defaultCwd as string) || process.cwd()
    const maxFiles = optionalNumber(input, 'max_files', 15)!
    const spawnTerminals = optionalBoolean(input, 'spawn_terminals', true)!

    // Step 1: Collect relevant files via the full pipeline
    const contextResult = await collectContext(
      { taskDescription, projectRoot, maxFiles, useAi: true, graphDepth: 2 },
      codegraphDeps.searchIndex,
      codegraphDeps.structureAnalyzer,
    )

    if (contextResult.files.length === 0) {
      return JSON.stringify({
        success: false,
        message: 'No relevant files found for this task. Try a more specific description or ensure the project is indexed.',
        parsedTask: contextResult.parsedTask,
      })
    }

    // Step 2: Compute spatial layout
    const workspaceFiles = contextResult.files.map(f => ({
      filePath: f.filePath,
      relevance: f.relevance,
      imports: f.imports,
      importedBy: f.importedBy,
    }))

    const layout = computeWorkspaceLayout(workspaceFiles)

    // Step 3: Read file contents and create file viewers on the canvas
    const fileSessionMap = new Map<string, string>() // filePath → sessionId
    const fileErrors: string[] = []

    // Language detection helper
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
      py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java',
      c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
      css: 'css', html: 'html', htm: 'html', json: 'json',
      yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
      md: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
      sql: 'sql', swift: 'swift', kt: 'kotlin', vue: 'vue',
      svelte: 'svelte', php: 'php', lua: 'lua', zig: 'zig',
    }

    for (const pos of layout.positions) {
      try {
        const stat = await fs.stat(pos.filePath)
        if (stat.size > MAX_FILE_SIZE) {
          fileErrors.push(`${pos.filePath}: too large (${stat.size} bytes)`)
          continue
        }

        const content = await fs.readFile(pos.filePath, 'utf-8')
        const ext = pos.filePath.split('.').pop()?.toLowerCase() || ''
        const language = langMap[ext] || 'text'
        const sessionId = uuid()

        fileSessionMap.set(pos.filePath, sessionId)

        emitCanvasAction('file_edited', {
          filePath: pos.filePath,
          content,
          language,
          position: { x: pos.x, y: pos.y },
          sessionId,
        })
      } catch {
        fileErrors.push(`${pos.filePath}: could not read`)
      }
    }

    // Step 4: Create arrows for import relationships
    const arrowsSummary: string[] = []
    for (const arrow of layout.arrows) {
      const sourceId = fileSessionMap.get(arrow.from)
      const targetId = fileSessionMap.get(arrow.to)
      if (!sourceId || !targetId) continue

      const connectorId = uuid()
      emitCanvasAction('connector_created', {
        connectorId,
        sourceId,
        targetId,
        label: arrow.type,
      })
      arrowsSummary.push(`${path.basename(arrow.from)} → ${path.basename(arrow.to)}`)
    }

    // Step 5: Create groups for module regions
    const groupsSummary: string[] = []
    for (const region of layout.regions) {
      const groupId = uuid()
      emitCanvasAction('group_created', {
        groupId,
        name: region.name,
      })
      groupsSummary.push(region.name)

      // Add files in this region to the group
      for (const pos of layout.positions) {
        const sessionId = fileSessionMap.get(pos.filePath)
        if (!sessionId) continue

        // Check if file is within this region's directory
        const fileDir = path.dirname(pos.filePath)
        const dirName = fileDir.split('/').pop() || ''
        if (dirName === region.name || fileDir.endsWith(`/${region.name}`)) {
          emitCanvasAction('group_member_added', { groupId, elementId: sessionId })
        }
      }
    }

    // Step 6: Spawn terminals cd'd to relevant directories
    const terminalsSummary: string[] = []
    if (spawnTerminals) {
      // Collect unique module directories from the files
      const moduleDirs = new Set<string>()
      for (const file of contextResult.files) {
        const dir = path.dirname(file.filePath)
        // Only add directories that are within the project root
        if (dir.startsWith(projectRoot)) {
          // Use the most specific module directory (2 levels max from project root)
          const rel = path.relative(projectRoot, dir)
          const parts = rel.split(path.sep)
          // Take up to 2 levels deep for meaningful directory grouping
          const moduleDir = path.join(projectRoot, ...parts.slice(0, Math.min(parts.length, 2)))
          moduleDirs.add(moduleDir)
        }
      }

      // Limit to 3 terminals to avoid clutter
      const terminalDirs = Array.from(moduleDirs).slice(0, 3)

      // Place terminals below the workspace layout
      const terminalY = layout.bounds.maxY + 100
      let terminalX = layout.bounds.minX

      for (const dir of terminalDirs) {
        const sessionId = uuid()
        const cols = 80
        const rows = 24
        const shell = (prefs.defaultShell as string) || undefined

        const pty = ptyManager.spawn({ id: sessionId, cwd: dir, shell, cols, rows })

        pty.on('data', (data: string) => {
          terminalOutputBuffer.append(pty.id, data)
          const win = getMainWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(PTY_DATA_FROM_PTY, { id: pty.id, data })
          }
        })

        pty.on('exit', (exitCode: number, signal?: number) => {
          terminalOutputBuffer.delete(pty.id)
          const win = getMainWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(PTY_EXIT, { id: pty.id, exitCode, signal })
          }
        })

        const width = cols * CHAR_WIDTH
        const height = rows * CHAR_HEIGHT

        if (scope) {
          scope.addSessionToScope(sessionId)
          scope.addPathToScope(dir)
        }
        const groupId = scope?.getAssignedGroupId() ?? null
        const agentId = scope?.agentId ?? null

        emitCanvasAction('session_created', {
          sessionId,
          cwd: dir,
          position: { x: terminalX, y: terminalY },
          size: { cols, rows, width, height },
          agentId,
          groupId,
        })

        const relDir = path.relative(projectRoot, dir) || '.'
        terminalsSummary.push(`${relDir} (${sessionId})`)
        terminalX += width + 40
      }
    }

    // Step 7: Pan canvas to center the workspace
    const centerX = -(layout.bounds.minX + layout.bounds.maxX) / 2
    const centerY = -(layout.bounds.minY + layout.bounds.maxY) / 2
    emitCanvasAction('viewport_panned', { panX: centerX, panY: centerY })

    // Build summary
    const summary = {
      success: true,
      task: taskDescription,
      parsedTask: {
        intent: contextResult.parsedTask.intent,
        keywords: contextResult.parsedTask.keywords,
      },
      filesOpened: layout.positions.length,
      arrows: arrowsSummary.length,
      groups: groupsSummary,
      terminals: terminalsSummary,
      timing: contextResult.timing,
      fileList: contextResult.files.map(f => ({
        file: path.relative(projectRoot, f.filePath),
        relevance: Math.round(f.relevance * 100) / 100,
        source: f.source,
      })),
      errors: fileErrors.length > 0 ? fileErrors : undefined,
    }

    return JSON.stringify(summary)
  })

  // ── list_plugins ─────────────────────────────────────────────

  executors.set('list_plugins', async () => {
    if (!pluginDeps) {
      return JSON.stringify({ plugins: [], message: 'Plugin system not available.' })
    }

    const plugins = pluginDeps.getPlugins()
    if (plugins.length === 0) {
      return 'No plugins installed. Install plugins to ~/.smoke/plugins/ or .smoke/plugins/ in the project.'
    }

    const list = plugins.map((p) => ({
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author,
      defaultSize: p.manifest.defaultSize,
      permissions: p.manifest.permissions,
      source: p.source,
    }))

    return JSON.stringify(list)
  })

  // ── create_plugin_element ───────────────────────────────────

  executors.set('create_plugin_element', async (input) => {
    const pluginName = requireString(input, 'plugin_name')
    const position = optionalPosition(input, 'position', { x: 100, y: 100 })
    const pluginData = (input.plugin_data as Record<string, unknown>) ?? {}

    if (!pluginDeps) {
      throw new Error('Plugin system not available.')
    }

    const plugin = pluginDeps.getPlugin(pluginName)
    if (!plugin) {
      const available = pluginDeps.getPlugins().map((p) => p.manifest.name)
      throw new Error(
        `Plugin "${pluginName}" not found. Available plugins: ${available.length > 0 ? available.join(', ') : 'none'}`
      )
    }

    const sessionId = uuid()
    const pluginType = `plugin:${plugin.manifest.name}`

    emitCanvasAction('plugin_session_created', {
      sessionId,
      pluginType,
      pluginId: plugin.manifest.name,
      pluginSource: plugin.source,
      pluginManifest: {
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        entryPoint: plugin.manifest.entryPoint,
        defaultSize: plugin.manifest.defaultSize,
      },
      pluginData,
      position,
    })

    return JSON.stringify({
      sessionId,
      pluginName: plugin.manifest.name,
      pluginType,
      position,
    })
  })

  // ── read_plugin_state ───────────────────────────────────────

  executors.set('read_plugin_state', async (input) => {
    const pluginId = requireString(input, 'plugin_id')
    const key = optionalString(input, 'key')

    const stateDir = path.join(app.getPath('userData'), 'plugin-state', pluginId)

    if (!key) {
      // List all available state keys
      try {
        const entries = await fs.readdir(stateDir)
        const keys = entries
          .filter((e) => e.endsWith('.json'))
          .map((e) => e.replace(/\.json$/, ''))

        if (keys.length === 0) {
          return `No persisted state found for plugin "${pluginId}".`
        }

        return JSON.stringify({ pluginId, keys })
      } catch {
        return `No persisted state found for plugin "${pluginId}".`
      }
    }

    // Read a specific state key
    const filePath = path.join(stateDir, `${key}.json`)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const value = JSON.parse(content)
      return JSON.stringify({ pluginId, key, value })
    } catch {
      return `State key "${key}" not found for plugin "${pluginId}".`
    }
  })

  // ── explore_imports ──────────────────────────────────────────

  executors.set('explore_imports', async (input) => {
    const filePath = path.resolve(requireString(input, 'file_path'))
    const depth = optionalNumber(input, 'depth', 2)!

    // Determine project root from config or cwd
    const prefs = configStore.get('preferences', defaultPreferences) as Record<
      string,
      unknown
    >
    const projectRoot = (prefs.defaultCwd as string) || process.cwd()

    const result = await buildCodeGraph({
      filePath,
      projectRoot,
      maxDepth: depth,
    })

    // Return a concise summary for the AI
    const nodes = result.graph.nodes.map((n) => ({
      file: n.filePath,
      imports: n.imports,
      importedBy: n.importedBy,
      depth: n.depth,
    }))

    return JSON.stringify({
      root: result.rootPath,
      fileCount: result.fileCount,
      edgeCount: result.edgeCount,
      nodes,
      edges: result.graph.edges,
    })
  })

  return executors
}
