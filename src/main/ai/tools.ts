/**
 * AI tool definitions and executor functions.
 *
 * v1 tools: get_canvas_state, list_sessions, read_terminal_output,
 * spawn_terminal, write_to_terminal, close_terminal, move_element,
 * resize_element, read_file, list_directory, pan_canvas.
 *
 * Each tool returns a string result to the AI.
 * Write tools push canvas_action events to the renderer.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuid } from 'uuid'
import type { BrowserWindow } from 'electron'
import type { AiService, ToolDefinition, ToolExecutor } from './AiService'
import { terminalOutputBuffer } from './TerminalOutputBuffer'
import type { PtyManager } from '../pty/PtyManager'
import { AI_CANVAS_ACTION, PTY_DATA_FROM_PTY, PTY_EXIT } from '../ipc/channels'
import { configStore, defaultPreferences } from '../config/ConfigStore'
import type { AiStreamCanvasAction } from '../../preload/types'

// ── Tool definitions ────────────────────────────────────────────────

const tools: Array<{ definition: ToolDefinition; executor: string }> = [
  {
    definition: {
      name: 'get_canvas_state',
      description:
        'Get the current canvas viewport state including pan position, zoom level, and grid size.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    executor: 'get_canvas_state',
  },
  {
    definition: {
      name: 'list_sessions',
      description:
        'List all active terminal sessions with their IDs, titles, working directories, positions, sizes, and buffer sizes.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    executor: 'list_sessions',
  },
  {
    definition: {
      name: 'read_terminal_output',
      description:
        'Read the buffered output from a terminal session. Returns the last N lines of stripped (no ANSI codes) terminal output.',
      input_schema: {
        type: 'object' as const,
        properties: {
          session_id: {
            type: 'string',
            description: 'The terminal session ID to read from.',
          },
          lines: {
            type: 'number',
            description:
              'Number of lines to read from the end of the buffer. Defaults to 100.',
          },
        },
        required: ['session_id'],
      },
    },
    executor: 'read_terminal_output',
  },
  {
    definition: {
      name: 'spawn_terminal',
      description:
        'Spawn a new terminal session on the canvas. Returns the session ID. The terminal appears at the specified position with the given working directory.',
      input_schema: {
        type: 'object' as const,
        properties: {
          cwd: {
            type: 'string',
            description:
              'Working directory for the new terminal. Defaults to the configured default.',
          },
          position: {
            type: 'object',
            description:
              'Canvas position {x, y} for the terminal. Defaults to {x: 100, y: 100}.',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          cols: {
            type: 'number',
            description: 'Number of columns. Defaults to 80.',
          },
          rows: {
            type: 'number',
            description: 'Number of rows. Defaults to 24.',
          },
        },
        required: [],
      },
    },
    executor: 'spawn_terminal',
  },
  {
    definition: {
      name: 'write_to_terminal',
      description:
        'Write text (keystrokes) to a terminal session. Use this to run commands by appending "\\n" to the text.',
      input_schema: {
        type: 'object' as const,
        properties: {
          session_id: {
            type: 'string',
            description: 'The terminal session ID to write to.',
          },
          text: {
            type: 'string',
            description:
              'The text to write. Include "\\n" for Enter key.',
          },
        },
        required: ['session_id', 'text'],
      },
    },
    executor: 'write_to_terminal',
  },
  {
    definition: {
      name: 'close_terminal',
      description: 'Close (kill) a terminal session and remove it from the canvas.',
      input_schema: {
        type: 'object' as const,
        properties: {
          session_id: {
            type: 'string',
            description: 'The terminal session ID to close.',
          },
        },
        required: ['session_id'],
      },
    },
    executor: 'close_terminal',
  },
  {
    definition: {
      name: 'move_element',
      description: 'Move a terminal session to a new position on the canvas.',
      input_schema: {
        type: 'object' as const,
        properties: {
          session_id: {
            type: 'string',
            description: 'The session ID to move.',
          },
          position: {
            type: 'object',
            description: 'New canvas position {x, y}.',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
        },
        required: ['session_id', 'position'],
      },
    },
    executor: 'move_element',
  },
  {
    definition: {
      name: 'resize_element',
      description: 'Resize a terminal session on the canvas.',
      input_schema: {
        type: 'object' as const,
        properties: {
          session_id: {
            type: 'string',
            description: 'The session ID to resize.',
          },
          cols: {
            type: 'number',
            description: 'New column count.',
          },
          rows: {
            type: 'number',
            description: 'New row count.',
          },
          width: {
            type: 'number',
            description:
              'New pixel width. If omitted, calculated from cols (cols * 8).',
          },
          height: {
            type: 'number',
            description:
              'New pixel height. If omitted, calculated from rows (rows * 18).',
          },
        },
        required: ['session_id', 'cols', 'rows'],
      },
    },
    executor: 'resize_element',
  },
  {
    definition: {
      name: 'read_file',
      description:
        'Read the contents of a file from the filesystem. Returns the file content as text. Limited to 5MB by default.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the file.',
          },
        },
        required: ['path'],
      },
    },
    executor: 'read_file',
  },
  {
    definition: {
      name: 'list_directory',
      description:
        'List the contents of a directory. Returns file names, types, and sizes.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the directory.',
          },
        },
        required: ['path'],
      },
    },
    executor: 'list_directory',
  },
  {
    definition: {
      name: 'pan_canvas',
      description:
        'Pan the canvas viewport to a specific position. Use this to navigate to different areas of the canvas.',
      input_schema: {
        type: 'object' as const,
        properties: {
          x: {
            type: 'number',
            description: 'X position to pan to.',
          },
          y: {
            type: 'number',
            description: 'Y position to pan to.',
          },
        },
        required: ['x', 'y'],
      },
    },
    executor: 'pan_canvas',
  },
  {
    definition: {
      name: 'create_note',
      description:
        'Place a sticky note on the canvas. Use this to annotate, explain, or document spatial reasoning.',
      input_schema: {
        type: 'object' as const,
        properties: {
          text: {
            type: 'string',
            description: 'The text content of the sticky note.',
          },
          position: {
            type: 'object',
            description:
              'Canvas position {x, y} for the note. Defaults to {x: 100, y: 100}.',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
          color: {
            type: 'string',
            description:
              'Note color: "yellow", "pink", "blue", "green", or "purple". Defaults to "yellow".',
            enum: ['yellow', 'pink', 'blue', 'green', 'purple'],
          },
        },
        required: ['text'],
      },
    },
    executor: 'create_note',
  },
  {
    definition: {
      name: 'edit_file',
      description:
        'Edit a file by writing new content to it. If the file is open in a file viewer on the canvas, the viewer updates live. If not open, a new file viewer opens at the specified position. The file is written to disk immediately.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the file to edit.',
          },
          content: {
            type: 'string',
            description: 'The new file content to write.',
          },
          position: {
            type: 'object',
            description:
              'Canvas position {x, y} for the file viewer if a new one is created. Defaults to {x: 100, y: 100}.',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['x', 'y'],
          },
        },
        required: ['path', 'content'],
      },
    },
    executor: 'edit_file',
  },
  {
    definition: {
      name: 'create_arrow',
      description:
        'Draw a connector arrow between two canvas elements. Use this to show relationships or data flow between elements.',
      input_schema: {
        type: 'object' as const,
        properties: {
          from_id: {
            type: 'string',
            description: 'The source element ID (session or note).',
          },
          to_id: {
            type: 'string',
            description: 'The target element ID (session or note).',
          },
          label: {
            type: 'string',
            description: 'Optional label displayed on the arrow.',
          },
          color: {
            type: 'string',
            description:
              'Optional CSS color for the arrow. Defaults to the theme accent color.',
          },
        },
        required: ['from_id', 'to_id'],
      },
    },
    executor: 'create_arrow',
  },
]

// ── Executor implementations ────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const CHAR_WIDTH = 8
const CHAR_HEIGHT = 18

function createExecutors(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null
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
    const sessions = terminalOutputBuffer.sessions()
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

    // Wire PTY data and exit events to the renderer (same as ipcHandlers does for user-spawned PTYs)
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

    // Notify the renderer to create the session on the canvas
    emitCanvasAction('session_created', {
      sessionId,
      cwd,
      position,
      size: { cols, rows, width, height },
    })

    return JSON.stringify({ sessionId, cwd, cols, rows, pid: pty.pid })
  })

  // ── write_to_terminal ─────────────────────────────────────────

  executors.set('write_to_terminal', async (input) => {
    const sessionId = input.session_id as string
    const text = input.text as string

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

  return executors
}

// ── Registration ────────────────────────────────────────────────────

/**
 * Register all v1 AI tools with the AiService.
 * Called from ipcHandlers after AiService is instantiated.
 */
export function registerTools(
  aiService: AiService,
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null
): void {
  const executors = createExecutors(ptyManager, getMainWindow)

  for (const tool of tools) {
    const executor = executors.get(tool.executor)
    if (executor) {
      aiService.registerTool(tool.definition, executor)
    }
  }
}
