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
import { v4 as uuid } from 'uuid'
import type { BrowserWindow } from 'electron'
import { terminalOutputBuffer } from './TerminalOutputBuffer'
import type { PtyManager } from '../pty/PtyManager'
import { AI_CANVAS_ACTION, PTY_DATA_FROM_PTY, PTY_EXIT } from '../ipc/channels'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import type { AiStreamCanvasAction } from '../../preload/types'
import { buildCodeGraph, collectContext, computeWorkspaceLayout } from '../codegraph'
import type { SearchIndex } from '../codegraph/SearchIndex'
import type { StructureAnalyzer } from '../codegraph/StructureAnalyzer'

export type ToolExecutor = (input: Record<string, unknown>) => Promise<string>

/** Context for scope-aware tool execution. */
export interface AgentScopeProvider {
  agentId: string
  getAllowedSessionIds: () => Set<string> | null
  getAssignedGroupId: () => string | null
  addSessionToScope: (sessionId: string) => void
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

/**
 * Create the full set of tool executors.
 * Exported for use by AgentManager + MCP bridge.
 */
export function createExecutors(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
  scope?: AgentScopeProvider,
  codegraphDeps?: CodegraphDeps
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
    const sessionId = input.session_id as string
    const lines = (input.lines as number) ?? 100

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
      (input.cwd as string) || (prefs.defaultCwd as string) || process.cwd()
    const position = (input.position as { x: number; y: number }) ?? {
      x: 100,
      y: 100,
    }
    const cols = (input.cols as number) ?? 80
    const rows = (input.rows as number) ?? 24
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
    const sessionId = input.session_id as string
    const text = input.text as string

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
    const sessionId = input.session_id as string

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
    const sessionId = input.session_id as string
    const position = input.position as { x: number; y: number }

    const allowed = scope?.getAllowedSessionIds()
    if (allowed && !allowed.has(sessionId)) {
      throw new Error(`Session ${sessionId} is outside this agent's assigned scope.`)
    }

    emitCanvasAction('session_moved', { sessionId, position })

    return `Moved session ${sessionId} to (${position.x}, ${position.y}).`
  })

  // ── resize_element ────────────────────────────────────────────

  executors.set('resize_element', async (input) => {
    const sessionId = input.session_id as string
    const cols = input.cols as number
    const rows = input.rows as number
    const width = (input.width as number) ?? cols * CHAR_WIDTH
    const height = (input.height as number) ?? rows * CHAR_HEIGHT

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
    const filePath = path.resolve(input.path as string)

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
    const dirPath = path.resolve(input.path as string)

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
    const filePath = path.resolve(input.path as string)

    // Safety: reject paths outside the user's home directory
    const homedir = require('os').homedir()
    if (!filePath.startsWith(homedir)) {
      throw new Error('Write denied: path must be within the user home directory')
    }

    // Safety: reject writes to hidden config directories at the home root
    const relToHome = path.relative(homedir, filePath)
    const topSegment = relToHome.split(path.sep)[0]
    if (topSegment.startsWith('.') && topSegment !== '.') {
      throw new Error('Write denied: cannot write to hidden config directories')
    }

    const content = input.content as string
    const contentBytes = Buffer.from(content, 'utf-8')
    if (contentBytes.length > MAX_FILE_SIZE) {
      throw new Error(
        `Content too large: ${contentBytes.length} bytes (max ${MAX_FILE_SIZE}).`
      )
    }

    await fs.writeFile(filePath, content, 'utf-8')

    const position = (input.position as { x: number; y: number }) ?? {
      x: 100,
      y: 100,
    }

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
    const x = input.x as number
    const y = input.y as number

    emitCanvasAction('viewport_panned', { panX: x, panY: y })

    return `Panned canvas viewport to (${x}, ${y}).`
  })

  // ── create_note ────────────────────────────────────────────────

  executors.set('create_note', async (input) => {
    const text = input.text as string
    const position = (input.position as { x: number; y: number }) ?? {
      x: 100,
      y: 100,
    }
    const color = (input.color as string) ?? 'yellow'
    const noteId = uuid()

    emitCanvasAction('note_created', { noteId, text, position, color })

    return JSON.stringify({ noteId, text, position, color })
  })

  // ── create_arrow ───────────────────────────────────────────────

  executors.set('create_arrow', async (input) => {
    const fromId = input.from_id as string
    const toId = input.to_id as string
    const label = input.label as string | undefined
    const color = input.color as string | undefined
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
    const name = input.name as string
    const color = input.color as string | undefined
    const groupId = uuid()

    emitCanvasAction('group_created', { groupId, name, color })

    return JSON.stringify({ groupId, name, color })
  })

  // ── add_to_group ────────────────────────────────────────────────

  executors.set('add_to_group', async (input) => {
    const elementId = input.element_id as string
    const groupId = input.group_id as string

    emitCanvasAction('group_member_added', { groupId, elementId })

    return `Added element ${elementId} to group ${groupId}.`
  })

  // ── broadcast_to_group ──────────────────────────────────────────

  executors.set('broadcast_to_group', async (input) => {
    const groupId = input.group_id as string
    const command = input.command as string

    emitCanvasAction('group_broadcast', { groupId, command })

    return `Broadcast ${command.length} characters to group ${groupId}.`
  })

  // ── assemble_workspace ──────────────────────────────────────

  executors.set('assemble_workspace', async (input) => {
    if (!codegraphDeps) {
      throw new Error('Workspace assembly is not available: codegraph dependencies not configured.')
    }

    const taskDescription = input.task_description as string
    const prefs = configStore.get('preferences', defaultPreferences) as Record<string, unknown>
    const projectRoot = (input.project_root as string) || (prefs.defaultCwd as string) || process.cwd()
    const maxFiles = (input.max_files as number) ?? 15
    const spawnTerminals = (input.spawn_terminals as boolean) ?? true

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

  // ── explore_imports ──────────────────────────────────────────

  executors.set('explore_imports', async (input) => {
    const filePath = path.resolve(input.file_path as string)
    const depth = (input.depth as number) ?? 2

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
