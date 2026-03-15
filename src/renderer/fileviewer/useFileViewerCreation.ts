import { sessionStore } from '../stores/sessionStore'
import { gridStore } from '../stores/gridStore'
import { getCurrentPan, getCurrentZoom, getCanvasRootElement } from '../canvas/useCanvasControls'

function getViewportCenter(): { x: number; y: number } {
  const rootEl = getCanvasRootElement()
  if (!rootEl) return { x: 100, y: 100 }

  const rect = rootEl.getBoundingClientRect()
  const pan = getCurrentPan()
  const zoom = getCurrentZoom()

  const canvasX = (rect.width / 2 - pan.x) / zoom
  const canvasY = (rect.height / 2 - pan.y) / zoom

  return { x: canvasX, y: canvasY }
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    java: 'java',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    css: 'css',
    html: 'html',
    htm: 'html',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    swift: 'swift',
    kt: 'kotlin',
    vue: 'vue',
    svelte: 'svelte',
    php: 'php',
    lua: 'lua',
    zig: 'zig',
  }
  return langMap[ext] || 'text'
}

export async function createFileViewerSession(
  filePath: string,
  position?: { x: number; y: number }
): Promise<void> {
  const { snapToGrid } = gridStore.getState()

  const rawPos = position ?? getViewportCenter()
  const snappedPos = {
    x: snapToGrid(rawPos.x),
    y: snapToGrid(rawPos.y),
  }

  // Load file content
  const result = await window.smokeAPI.fs.readfile(filePath)
  const language = detectLanguage(filePath)

  const session = sessionStore.getState().createFileSession(
    filePath,
    result.content,
    language,
    snappedPos
  )

  sessionStore.getState().focusSession(session.id)
  sessionStore.getState().bringToFront(session.id)
}
