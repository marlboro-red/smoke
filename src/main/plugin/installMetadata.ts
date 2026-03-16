import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstallSource = 'npm' | 'url' | 'local'

export interface InstallMetadata {
  source: InstallSource
  /** npm package name (for npm installs) */
  packageName?: string
  /** URL the plugin was downloaded from (for url installs) */
  url?: string
  /** ISO timestamp of when the plugin was installed */
  installedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const METADATA_FILE = '.smoke-install.json'

export async function readInstallMetadata(
  pluginDir: string
): Promise<InstallMetadata | null> {
  try {
    const raw = await readFile(join(pluginDir, METADATA_FILE), 'utf-8')
    return JSON.parse(raw) as InstallMetadata
  } catch {
    return null
  }
}

export async function writeInstallMetadata(
  pluginDir: string,
  metadata: InstallMetadata
): Promise<void> {
  await writeFile(
    join(pluginDir, METADATA_FILE),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  )
}
