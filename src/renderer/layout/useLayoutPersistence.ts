import { useEffect, useRef, useCallback } from 'react'
import { sessionStore } from '../stores/sessionStore'
import { canvasStore } from '../stores/canvasStore'
import { gridStore } from '../stores/gridStore'
import { regionStore } from '../stores/regionStore'
import { tabStore } from '../stores/tabStore'
import { snapPosition, snapSize } from '../window/useSnapping'
import { isPluginElementType, getPluginElementRegistration } from '../plugin/pluginElementRegistry'
import type { PluginElementType } from '../stores/sessionStore'
import type { Layout } from '../../preload/types'

function serializeCurrentLayout(name: string): Layout {
  const { sessions } = sessionStore.getState()
  const { panX, panY, zoom } = canvasStore.getState()
  const { gridSize } = gridStore.getState()
  const { regions } = regionStore.getState()

  return {
    name,
    sessions: Array.from(sessions.values()).map((s) => {
      const base: Record<string, unknown> = {
        type: s.type,
        title: s.title,
        cwd: s.type === 'terminal' ? s.cwd : '',
        position: { x: s.position.x, y: s.position.y },
        size: {
          width: s.size.width,
          height: s.size.height,
          cols: s.size.cols,
          rows: s.size.rows,
        },
      }
      if (s.locked) base.locked = true
      if (s.isPinned) {
        base.isPinned = true
        if (s.pinnedViewportPos) {
          base.pinnedViewportPos = s.pinnedViewportPos
        }
      }
      if (s.type === 'file') {
        return { ...base, filePath: s.filePath, language: s.language }
      }
      if (s.type === 'note') {
        const noteExtra: Record<string, unknown> = { content: s.content, color: s.color }
        if (s.sourceRef) noteExtra.sourceRef = s.sourceRef
        return { ...base, ...noteExtra }
      }
      if (s.type === 'webview') {
        return { ...base, url: s.url }
      }
      if (s.type === 'terminal') {
        const termExtra: Record<string, unknown> = {}
        if (s.shell) termExtra.shell = s.shell
        if (s.startupCommand) termExtra.startupCommand = s.startupCommand
        if (Object.keys(termExtra).length > 0) {
          return { ...base, ...termExtra }
        }
      }
      if (s.type === 'image') {
        return { ...base, filePath: s.filePath, aspectRatio: s.aspectRatio }
      }
      if (s.type === 'snippet') {
        return { ...base, content: s.content, language: s.language }
      }
      if (isPluginElementType(s.type)) {
        const reg = getPluginElementRegistration(s.type)
        const data = reg?.serializeData ? reg.serializeData(s) : s.pluginData
        return {
          ...base,
          pluginId: s.pluginId,
          pluginSource: s.pluginSource,
          pluginManifest: s.pluginManifest,
          pluginData: data,
        }
      }
      return base
    }),
    viewport: { panX, panY, zoom },
    gridSize,
    regions: Array.from(regions.values()).map((r) => ({
      name: r.name,
      color: r.color,
      position: { x: r.position.x, y: r.position.y },
      size: { width: r.size.width, height: r.size.height },
    })),
  }
}

export { serializeCurrentLayout }

/**
 * Restore a layout into the current stores (non-hook version for tab switching).
 * Assumes sessions have already been cleared by the caller.
 */
export async function restoreTabLayout(layout: Layout): Promise<void> {
  // Restore viewport
  canvasStore.getState().setPan(layout.viewport.panX, layout.viewport.panY)
  canvasStore.getState().setZoom(layout.viewport.zoom)
  gridStore.getState().setGridSize(layout.gridSize)
  canvasStore.getState().setGridSize(layout.gridSize)

  const gs = layout.gridSize

  // Create sessions from layout
  for (const saved of layout.sessions) {
    const elementType = saved.type ?? 'terminal'
    // Snap restored positions/sizes to the current grid so elements align
    // with grid dots even when the saved layout used a different grid size.
    const pos = snapPosition(saved.position, gs)
    const size = snapSize(saved.size, gs)
    switch (elementType) {
      case 'terminal': {
        const cwd = saved.cwd
        const session = sessionStore.getState().createSession(cwd, pos, saved.shell)
        sessionStore.getState().updateSession(session.id, {
          title: saved.title,
          size: { ...saved.size, width: size.width, height: size.height },
          ...(saved.shell ? { shell: saved.shell } : {}),
          ...(saved.startupCommand ? { startupCommand: saved.startupCommand } : {}),
        })
        window.smokeAPI?.pty.spawn({
          id: session.id,
          cwd,
          cols: saved.size.cols,
          rows: saved.size.rows,
          ...(saved.shell ? { shell: saved.shell } : {}),
          ...(saved.startupCommand ? { startupCommand: saved.startupCommand } : {}),
        })
        break
      }
      case 'file': {
        if (saved.filePath) {
          try {
            const result = await window.smokeAPI?.fs.readfile(saved.filePath)
            if (result) {
              const session = sessionStore.getState().createFileSession(
                saved.filePath,
                result.content,
                saved.language || 'text',
                pos
              )
              sessionStore.getState().updateSession(session.id, {
                title: saved.title,
                size: { ...saved.size, width: size.width, height: size.height },
              })
            }
          } catch {
            // File may no longer exist
          }
        }
        break
      }
      case 'note': {
        const session = sessionStore.getState().createNoteSession(
          pos,
          saved.color
        )
        sessionStore.getState().updateSession(session.id, {
          title: saved.title,
          content: saved.content ?? '',
          size: { ...saved.size, width: size.width, height: size.height },
          ...(saved.sourceRef ? { sourceRef: saved.sourceRef } : {}),
        })
        break
      }
      case 'webview': {
        const session = sessionStore.getState().createWebviewSession(
          saved.url || 'http://localhost:3000',
          pos
        )
        sessionStore.getState().updateSession(session.id, {
          title: saved.title,
          size: { ...saved.size, width: size.width, height: size.height },
        })
        break
      }
      case 'image': {
        if (saved.filePath) {
          try {
            const result = await window.smokeAPI?.fs.readfileBase64(saved.filePath)
            if (result) {
              const img = new window.Image()
              await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve()
                img.onerror = () => reject(new Error('Failed to load image'))
                img.src = result.dataUrl
              })
              const session = sessionStore.getState().createImageSession(
                saved.filePath,
                result.dataUrl,
                img.naturalWidth,
                img.naturalHeight,
                pos
              )
              sessionStore.getState().updateSession(session.id, {
                title: saved.title,
                size: { ...saved.size, width: size.width, height: size.height },
              })
            }
          } catch {
            // Image file may no longer exist
          }
        }
        break
      }
      case 'snippet': {
        const session = sessionStore.getState().createSnippetSession(
          saved.language || 'javascript',
          saved.content ?? '',
          pos
        )
        sessionStore.getState().updateSession(session.id, {
          title: saved.title,
          size: { ...saved.size, width: size.width, height: size.height },
        })
        break
      }
      default: {
        if (isPluginElementType(elementType)) {
          const reg = getPluginElementRegistration(elementType)
          if (reg) {
            const pluginData = reg.deserializeData
              ? reg.deserializeData(saved.pluginData ?? {})
              : (saved.pluginData ?? {})
            const manifest = saved.pluginManifest ?? {
              name: reg.displayName,
              version: '0.0.0',
              entryPoint: '',
              defaultSize: reg.defaultSize,
            }
            const session = sessionStore.getState().createPluginSession(
              elementType as PluginElementType,
              saved.pluginId ?? elementType.replace('plugin:', ''),
              saved.pluginSource ?? '',
              manifest,
              pluginData,
              pos
            )
            sessionStore.getState().updateSession(session.id, {
              size: { ...saved.size, width: size.width, height: size.height },
            })
          }
        }
        break
      }
    }
  }
}

export function useLayoutAutoSave(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const scheduleAutoSave = (): void => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const { activeTabId } = tabStore.getState()
        const tabKey = `__tab__${activeTabId}`
        const layout = serializeCurrentLayout(tabKey)
        window.smokeAPI?.layout.save(tabKey, layout)
        // Also save as __default__ for backward compatibility
        window.smokeAPI?.layout.save('__default__', { ...layout, name: '__default__' })
      }, 2000)
    }

    const unsubSession = sessionStore.subscribe(scheduleAutoSave)
    const unsubCanvas = canvasStore.subscribe(scheduleAutoSave)

    const unsubRegion = regionStore.subscribe(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const layout = serializeCurrentLayout('__default__')
        window.smokeAPI?.layout.save('__default__', layout)
      }, 2000)
    })

    return () => {
      unsubSession()
      unsubCanvas()
      unsubRegion()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])
}

export function useLayoutRestore(): {
  restoreDefault: () => Promise<void>
  loadLayout: (name: string) => Promise<void>
  resetLayout: () => Promise<void>
} {
  const restoreLayout = useCallback(async (layout: Layout) => {
    // Close all existing sessions
    const { sessions } = sessionStore.getState()
    for (const session of sessions.values()) {
      if (session.type === 'terminal') {
        window.smokeAPI?.pty.kill(session.id)
      }
      sessionStore.getState().removeSession(session.id)
    }

    // Clear existing regions and restore saved ones
    const { regions: existingRegions } = regionStore.getState()
    for (const id of existingRegions.keys()) {
      regionStore.getState().removeRegion(id)
    }
    // Restore viewport
    canvasStore.getState().setPan(layout.viewport.panX, layout.viewport.panY)
    canvasStore.getState().setZoom(layout.viewport.zoom)
    gridStore.getState().setGridSize(layout.gridSize)
    canvasStore.getState().setGridSize(layout.gridSize)

    const gs = layout.gridSize

    if (layout.regions) {
      for (const saved of layout.regions) {
        const rPos = snapPosition(saved.position, gs)
        const rSize = snapSize(saved.size, gs)
        regionStore.getState().createRegion(saved.name, rPos, rSize, saved.color)
      }
    }

    // Create sessions from layout
    for (const saved of layout.sessions) {
      const elementType = saved.type ?? 'terminal'
      let createdId: string | null = null
      // Snap restored positions/sizes to the current grid
      const pos = snapPosition(saved.position, gs)
      const size = snapSize(saved.size, gs)
      switch (elementType) {
        case 'terminal': {
          const cwd = saved.cwd
          const session = sessionStore.getState().createSession(cwd, pos, saved.shell)
          createdId = session.id
          sessionStore.getState().updateSession(session.id, {
            title: saved.title,
            size: { ...saved.size, width: size.width, height: size.height },
            ...(saved.shell ? { shell: saved.shell } : {}),
            ...(saved.startupCommand ? { startupCommand: saved.startupCommand } : {}),
            ...(saved.isPinned ? { isPinned: true, pinnedViewportPos: saved.pinnedViewportPos } : {}),
          })
          // Spawn PTY — gracefully fall back if cwd doesn't exist
          window.smokeAPI?.pty.spawn({
            id: session.id,
            cwd,
            cols: saved.size.cols,
            rows: saved.size.rows,
            ...(saved.shell ? { shell: saved.shell } : {}),
            ...(saved.startupCommand ? { startupCommand: saved.startupCommand } : {}),
          })
          break
        }
        case 'file': {
          if (saved.filePath) {
            try {
              const result = await window.smokeAPI?.fs.readfile(saved.filePath)
              if (result) {
                const session = sessionStore.getState().createFileSession(
                  saved.filePath,
                  result.content,
                  saved.language || 'text',
                  pos
                )
                createdId = session.id
                sessionStore.getState().updateSession(session.id, {
                  title: saved.title,
                  size: { ...saved.size, width: size.width, height: size.height },
                  ...(saved.isPinned ? { isPinned: true, pinnedViewportPos: saved.pinnedViewportPos } : {}),
                })
              }
            } catch {
              // File may no longer exist — skip silently
            }
          }
          break
        }
        case 'note': {
          const session = sessionStore.getState().createNoteSession(
            pos,
            saved.color
          )
          createdId = session.id
          sessionStore.getState().updateSession(session.id, {
            title: saved.title,
            content: saved.content ?? '',
            size: { ...saved.size, width: size.width, height: size.height },
            ...(saved.isPinned ? { isPinned: true, pinnedViewportPos: saved.pinnedViewportPos } : {}),
            ...(saved.sourceRef ? { sourceRef: saved.sourceRef } : {}),
          })
          break
        }
        case 'webview': {
          const session = sessionStore.getState().createWebviewSession(
            saved.url || 'http://localhost:3000',
            pos
          )
          createdId = session.id
          sessionStore.getState().updateSession(session.id, {
            title: saved.title,
            size: { ...saved.size, width: size.width, height: size.height },
            ...(saved.isPinned ? { isPinned: true, pinnedViewportPos: saved.pinnedViewportPos } : {}),
          })
          break
        }
        case 'image': {
          if (saved.filePath) {
            try {
              const result = await window.smokeAPI?.fs.readfileBase64(saved.filePath)
              if (result) {
                const img = new window.Image()
                await new Promise<void>((resolve, reject) => {
                  img.onload = () => resolve()
                  img.onerror = () => reject(new Error('Failed to load image'))
                  img.src = result.dataUrl
                })
                const session = sessionStore.getState().createImageSession(
                  saved.filePath,
                  result.dataUrl,
                  img.naturalWidth,
                  img.naturalHeight,
                  pos
                )
                createdId = session.id
                sessionStore.getState().updateSession(session.id, {
                  title: saved.title,
                  size: { ...saved.size, width: size.width, height: size.height },
                  ...(saved.isPinned ? { isPinned: true, pinnedViewportPos: saved.pinnedViewportPos } : {}),
                })
              }
            } catch {
              // Image file may no longer exist — skip silently
            }
          }
          break
        }
        case 'snippet': {
          const session = sessionStore.getState().createSnippetSession(
            saved.language || 'javascript',
            saved.content ?? '',
            pos
          )
          createdId = session.id
          sessionStore.getState().updateSession(session.id, {
            title: saved.title,
            size: { ...saved.size, width: size.width, height: size.height },
            ...(saved.isPinned ? { isPinned: true, pinnedViewportPos: saved.pinnedViewportPos } : {}),
          })
          break
        }
        default: {
          if (isPluginElementType(elementType)) {
            const reg = getPluginElementRegistration(elementType)
            if (reg) {
              const pluginData = reg.deserializeData
                ? reg.deserializeData(saved.pluginData ?? {})
                : (saved.pluginData ?? {})
              const manifest = saved.pluginManifest ?? {
                name: reg.displayName,
                version: '0.0.0',
                entryPoint: '',
                defaultSize: reg.defaultSize,
              }
              const session = sessionStore.getState().createPluginSession(
                elementType as PluginElementType,
                saved.pluginId ?? elementType.replace('plugin:', ''),
                saved.pluginSource ?? '',
                manifest,
                pluginData,
                pos
              )
              createdId = session.id
              sessionStore.getState().updateSession(session.id, {
                size: { ...saved.size, width: size.width, height: size.height },
                ...(saved.isPinned ? { isPinned: true, pinnedViewportPos: saved.pinnedViewportPos } : {}),
              })
            }
          }
          break
        }
      }
      if (saved.locked && createdId) {
        sessionStore.getState().updateSession(createdId, { locked: true })
      }
    }
  }, [])

  const restoreDefault = useCallback(async () => {
    // Try to load tab state and restore the active tab's layout
    const tabState = await window.smokeAPI?.tab.getState()
    if (tabState) {
      tabStore.getState().setTabs(tabState.tabs, tabState.activeTabId)
      const tabKey = `__tab__${tabState.activeTabId}`
      const layout = await window.smokeAPI?.layout.load(tabKey)
      if (layout) {
        await restoreLayout(layout)
        return
      }
    }
    // Fall back to __default__ layout for backward compatibility
    const layout = await window.smokeAPI?.layout.load('__default__')
    if (layout) {
      await restoreLayout(layout)
    }
  }, [restoreLayout])

  const loadLayout = useCallback(async (name: string) => {
    const layout = await window.smokeAPI?.layout.load(name)
    if (layout) {
      await restoreLayout(layout)
    }
  }, [restoreLayout])

  const resetLayout = useCallback(async () => {
    // Close all existing sessions
    const { sessions } = sessionStore.getState()
    for (const session of sessions.values()) {
      if (session.type === 'terminal') {
        window.smokeAPI?.pty.kill(session.id)
      }
      sessionStore.getState().removeSession(session.id)
    }

    // Clear all regions
    const { regions } = regionStore.getState()
    for (const id of regions.keys()) {
      regionStore.getState().removeRegion(id)
    }

    // Reset viewport to origin
    canvasStore.getState().setPan(0, 0)
    canvasStore.getState().setZoom(1.0)
    gridStore.getState().setGridSize(20)
    canvasStore.getState().setGridSize(20)

    // Clear saved default layout
    await window.smokeAPI?.layout.delete('__default__')
  }, [])

  return { restoreDefault, loadLayout, resetLayout }
}
