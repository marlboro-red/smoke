/**
 * Pure tool definition data shared between the MCP server and the
 * main-process tool executors.
 *
 * No runtime dependencies — just names, descriptions, and JSON schemas.
 */

export interface ToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
  }
}

export const toolDefs: ToolDef[] = [
  {
    name: 'get_canvas_state',
    description:
      'Get the current canvas viewport state including pan position, zoom level, and grid size.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_sessions',
    description:
      'List all active terminal sessions with their IDs, titles, working directories, positions, sizes, and buffer sizes.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_terminal_output',
    description:
      'Read the buffered output from a terminal session. Returns the last N lines of stripped (no ANSI codes) terminal output.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The terminal session ID to read from.' },
        lines: { type: 'number', description: 'Number of lines to read from the end of the buffer. Defaults to 100.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'spawn_terminal',
    description:
      'Spawn a new terminal session on the canvas. Returns the session ID.',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory for the new terminal.' },
        position: {
          type: 'object',
          description: 'Canvas position {x, y}. Defaults to {x: 100, y: 100}.',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
        },
        cols: { type: 'number', description: 'Number of columns. Defaults to 80.' },
        rows: { type: 'number', description: 'Number of rows. Defaults to 24.' },
      },
      required: [],
    },
  },
  {
    name: 'write_to_terminal',
    description:
      'Write text (keystrokes) to a terminal session. Append "\\n" to execute a command.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The terminal session ID to write to.' },
        text: { type: 'string', description: 'The text to write. Include "\\n" for Enter key.' },
      },
      required: ['session_id', 'text'],
    },
  },
  {
    name: 'close_terminal',
    description: 'Close (kill) a terminal session and remove it from the canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The terminal session ID to close.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'move_element',
    description: 'Move a terminal session to a new position on the canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The session ID to move.' },
        position: {
          type: 'object',
          description: 'New canvas position {x, y}.',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
        },
      },
      required: ['session_id', 'position'],
    },
  },
  {
    name: 'resize_element',
    description: 'Resize a terminal session on the canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The session ID to resize.' },
        cols: { type: 'number', description: 'New column count.' },
        rows: { type: 'number', description: 'New row count.' },
        width: { type: 'number', description: 'New pixel width. If omitted, calculated from cols.' },
        height: { type: 'number', description: 'New pixel height. If omitted, calculated from rows.' },
      },
      required: ['session_id', 'cols', 'rows'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem. Limited to 5MB.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory. Returns file names, types, and sizes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the directory.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'pan_canvas',
    description: 'Pan the canvas viewport to a specific position.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X position to pan to.' },
        y: { type: 'number', description: 'Y position to pan to.' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'create_note',
    description: 'Place a sticky note on the canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text content of the sticky note.' },
        position: {
          type: 'object',
          description: 'Canvas position {x, y}. Defaults to {x: 100, y: 100}.',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
        },
        color: { type: 'string', description: 'Note color: preset name or hex color. Defaults to "yellow".' },
      },
      required: ['text'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Edit a file by writing new content to it. Opens a file viewer on the canvas if not already open.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file to edit.' },
        content: { type: 'string', description: 'The new file content to write.' },
        position: {
          type: 'object',
          description: 'Canvas position for the file viewer.',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'create_arrow',
    description: 'Draw a connector arrow between two canvas elements.',
    inputSchema: {
      type: 'object',
      properties: {
        from_id: { type: 'string', description: 'The source element ID.' },
        to_id: { type: 'string', description: 'The target element ID.' },
        label: { type: 'string', description: 'Optional label on the arrow.' },
        color: { type: 'string', description: 'Optional CSS color.' },
      },
      required: ['from_id', 'to_id'],
    },
  },
  {
    name: 'create_group',
    description: 'Create a new group on the canvas for clustering elements.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name for the group.' },
        color: { type: 'string', description: 'Hex color for the group.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_to_group',
    description: 'Add an existing canvas element to a group.',
    inputSchema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'The ID of the element to add.' },
        group_id: { type: 'string', description: 'The ID of the group.' },
      },
      required: ['element_id', 'group_id'],
    },
  },
  {
    name: 'broadcast_to_group',
    description:
      'Send a command to all terminal sessions in a group. Append "\\n" to execute.',
    inputSchema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'The ID of the group to broadcast to.' },
        command: { type: 'string', description: 'The command text to send.' },
      },
      required: ['group_id', 'command'],
    },
  },
  {
    name: 'explore_imports',
    description:
      'Explore the import graph starting from a file. Returns all reachable files via import/require statements.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the starting file.' },
        depth: { type: 'number', description: 'How many levels of imports to follow. Defaults to 2.' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'assemble_workspace',
    description:
      "Assemble a complete workspace on the canvas from a natural language task description. Opens relevant source files as file viewers arranged by data flow, draws import arrows, groups files by module, and spawns terminals cd'd to relevant directories.",
    inputSchema: {
      type: 'object',
      properties: {
        task_description: { type: 'string', description: 'Natural language description of the task.' },
        project_root: { type: 'string', description: 'Root directory of the project. Defaults to the configured default working directory.' },
        max_files: { type: 'number', description: 'Maximum number of files to include. Defaults to 15.' },
        spawn_terminals: { type: 'boolean', description: "Whether to spawn terminals cd'd to relevant directories. Defaults to true." },
      },
      required: ['task_description'],
    },
  },
]
