import { useEffect } from 'react'
import { sessionStore, type FileViewerSession } from '../stores/sessionStore'

// Tracks file paths that changed while the viewer was off-screen.
// FileViewerWindow checks this on mount to reload stale content.
const pendingReloads = new Set<string>()

export function hasPendingReload(filePath: string): boolean {
  return pendingReloads.has(filePath)
}

export function clearPendingReload(filePath: string): void {
  pendingReloads.delete(filePath)
}

/**
 * Global file watch manager — call once in App.tsx.
 *
 * Tracks all file sessions, starts/stops fs.watch via IPC,
 * and reloads content on change. When a file viewer is off-screen
 * (unmounted by viewport culling), the reload is deferred until it
 * re-enters the viewport.
 */
export function useFileWatchManager(visibleIds: Set<string>): void {
  // Track file sessions and manage watchers
  useEffect(() => {
    const watchedPaths = new Map<string, string>() // filePath → sessionId

    function sync(): void {
      const sessions = sessionStore.getState().sessions
      const currentPaths = new Set<string>()

      for (const session of sessions.values()) {
        if (session.type !== 'file') continue
        const fs = session as FileViewerSession
        currentPaths.add(fs.filePath)

        if (!watchedPaths.has(fs.filePath)) {
          watchedPaths.set(fs.filePath, fs.id)
          window.smokeAPI?.fs.watch(fs.filePath)
        }
      }

      // Stop watching paths that no longer have sessions
      for (const [filePath] of watchedPaths) {
        if (!currentPaths.has(filePath)) {
          window.smokeAPI?.fs.unwatch(filePath)
          watchedPaths.delete(filePath)
          pendingReloads.delete(filePath)
        }
      }
    }

    sync()
    const unsub = sessionStore.subscribe(sync)

    return () => {
      unsub()
      for (const [filePath] of watchedPaths) {
        window.smokeAPI?.fs.unwatch(filePath)
      }
      watchedPaths.clear()
      pendingReloads.clear()
    }
  }, [])

  // Listen for file change events
  useEffect(() => {
    const unsub = window.smokeAPI?.fs.onFileChanged((event) => {
      const filePath = event.path

      // Find the session for this file
      const sessions = sessionStore.getState().sessions
      let fileSession: FileViewerSession | undefined
      for (const session of sessions.values()) {
        if (session.type === 'file' && (session as FileViewerSession).filePath === filePath) {
          fileSession = session as FileViewerSession
          break
        }
      }

      if (!fileSession) return
      if (fileSession.isDirty) return

      if (visibleIds.has(fileSession.id)) {
        reloadContent(fileSession.id, filePath)
      } else {
        pendingReloads.add(filePath)
      }
    })

    return unsub
  }, [visibleIds])

  // Flush pending reloads when sessions become visible
  useEffect(() => {
    if (pendingReloads.size === 0) return

    const sessions = sessionStore.getState().sessions
    for (const session of sessions.values()) {
      if (session.type !== 'file') continue
      const fs = session as FileViewerSession
      if (visibleIds.has(fs.id) && pendingReloads.has(fs.filePath) && !fs.isDirty) {
        pendingReloads.delete(fs.filePath)
        reloadContent(fs.id, fs.filePath)
      }
    }
  }, [visibleIds])
}

async function reloadContent(sessionId: string, filePath: string): Promise<void> {
  try {
    const { content } = await window.smokeAPI.fs.readfile(filePath)
    const current = sessionStore.getState().sessions.get(sessionId) as
      | FileViewerSession
      | undefined
    if (!current || current.isDirty) return

    if (current.content !== content) {
      sessionStore.getState().updateSession(sessionId, { content })
    }
  } catch {
    // File may have been deleted or become inaccessible — ignore
  }
}
