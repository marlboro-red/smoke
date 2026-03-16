import { preferencesStore } from '../stores/preferencesStore'
import { addToast } from '../stores/toastStore'

/**
 * Open a workspace directory: updates the default cwd, window title,
 * file tree root, and recent workspaces list.
 */
export async function openWorkspacePath(workspacePath: string): Promise<void> {
  // Update the default cwd preference (persisted via electron-store)
  preferencesStore.getState().updatePreference('defaultCwd', workspacePath)
  await window.smokeAPI?.config.set('defaultCwd', workspacePath)

  // Update the window title
  const dirName = workspacePath.split('/').pop() || workspacePath
  await window.smokeAPI?.workspace.setTitle(`${dirName} — Smoke`)

  // Add to recent workspaces
  await window.smokeAPI?.workspace.addRecent(workspacePath)

  // Rebuild project index for the new workspace
  window.smokeAPI?.project.buildIndex(workspacePath).catch(() => {
    // Index build is best-effort
  })
  window.smokeAPI?.search.build(workspacePath).catch(() => {
    // Search index build is best-effort
  })

  addToast(`Opened workspace: ${dirName}`, 'info')
}

/**
 * Show a native directory picker dialog, then open the selected directory
 * as the workspace. Returns true if a workspace was opened.
 */
export async function openWorkspaceDialog(): Promise<boolean> {
  const selected = await window.smokeAPI?.workspace.openDialog()
  if (!selected) return false
  await openWorkspacePath(selected)
  return true
}
