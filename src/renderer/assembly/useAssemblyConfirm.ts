import { useEffect } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { gridStore } from '../stores/gridStore'
import { getCurrentPan, getCurrentZoom } from '../canvas/useCanvasControls'
import { snapPosition } from '../window/useSnapping'
import { extToLanguage } from '../suggestions/GhostSuggestion'
import type { ContextFile } from '../../preload/types'

// Matches the default file session size in sessionStore.createFileSession
const FILE_WINDOW_WIDTH = 640
const FILE_WINDOW_HEIGHT = 480
const SPACING = 20
const READ_LIMIT = 256 * 1024

/**
 * Production consumer of the `assembly:confirm` event dispatched by
 * AssemblyPreview ("Open N files") and TaskInput (skip-preview path).
 * Opens the selected files as file sessions laid out in a grid centered
 * on the current viewport.
 */
export function useAssemblyConfirm(): void {
  useEffect(() => {
    const onConfirm = (e: Event): void => {
      const detail = (e as CustomEvent).detail as
        | { files: ContextFile[]; projectRoot: string }
        | undefined
      if (!detail?.files?.length) return
      void openFiles(detail.files)
    }
    window.addEventListener('assembly:confirm', onConfirm)
    return () => window.removeEventListener('assembly:confirm', onConfirm)
  }, [])
}

async function openFiles(files: ContextFile[]): Promise<void> {
  const pan = getCurrentPan()
  const zoom = getCurrentZoom()
  const gridSize = gridStore.getState().gridSize

  const cols = Math.max(1, Math.ceil(Math.sqrt(files.length)))
  const rows = Math.ceil(files.length / cols)
  const cellW = FILE_WINDOW_WIDTH + SPACING
  const cellH = FILE_WINDOW_HEIGHT + SPACING

  // Center the grid of windows on the visible viewport (canvas space)
  const centerX = (window.innerWidth / 2 - pan.x) / zoom
  const centerY = (window.innerHeight / 2 - pan.y) / zoom
  const originX = centerX - (cols * cellW) / 2
  const originY = centerY - (rows * cellH) / 2

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const pos = snapPosition(
      {
        x: originX + (i % cols) * cellW,
        y: originY + Math.floor(i / cols) * cellH,
      },
      gridSize
    )
    try {
      const result = await window.smokeAPI?.fs.readfile(file.filePath, READ_LIMIT)
      if (!result) continue
      sessionStore
        .getState()
        .createFileSession(file.filePath, result.content, extToLanguage(file.filePath), pos)
    } catch {
      // File may no longer exist — skip
    }
  }
}
