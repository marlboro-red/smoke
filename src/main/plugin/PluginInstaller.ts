import { readFile, writeFile, readdir, rm, mkdir, rename, access, stat } from 'fs/promises'
import { join, basename } from 'path'
import { homedir, tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { validateManifest, type PluginManifest } from './pluginManifest'
import {
  readInstallMetadata,
  writeInstallMetadata,
  type InstallSource,
  type InstallMetadata,
} from './installMetadata'
import { net } from 'electron'

export { readInstallMetadata, type InstallSource, type InstallMetadata } from './installMetadata'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginInstallResult {
  success: boolean
  pluginName?: string
  pluginDir?: string
  error?: string
}

export interface PluginUninstallResult {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// PluginInstaller
// ---------------------------------------------------------------------------

export class PluginInstaller {
  private globalPluginDir: string

  constructor() {
    this.globalPluginDir = join(homedir(), '.smoke', 'plugins')
  }

  /**
   * Install a plugin from an npm package.
   * Uses `npm pack` to download the tarball, extracts it, validates the
   * manifest, and installs to ~/.smoke/plugins/<name>/.
   */
  async installFromNpm(packageName: string): Promise<PluginInstallResult> {
    const tmpDir = join(tmpdir(), `smoke-plugin-install-${Date.now()}`)

    try {
      await mkdir(tmpDir, { recursive: true })

      // Download package tarball via npm pack
      const { stdout } = await execFileAsync(
        'npm',
        ['pack', packageName, '--pack-destination', tmpDir],
        { timeout: 60_000 }
      )

      const tgzName = stdout.trim().split('\n').pop()
      if (!tgzName) {
        return { success: false, error: 'npm pack produced no output' }
      }

      const tgzPath = join(tmpDir, tgzName)

      // Extract tarball — npm pack creates a package/ directory
      const extractDir = join(tmpDir, 'extracted')
      await mkdir(extractDir, { recursive: true })
      await execFileAsync('tar', ['xzf', tgzPath, '-C', extractDir], {
        timeout: 30_000,
      })

      // npm pack extracts to a "package" subdirectory
      const packageDir = join(extractDir, 'package')
      const sourceDir = await directoryExists(packageDir)
        ? packageDir
        : await findManifestDir(extractDir)

      if (!sourceDir) {
        return {
          success: false,
          error: 'No manifest.json found in the downloaded package',
        }
      }

      // Validate manifest
      const manifest = await this.validatePluginDir(sourceDir)
      if (!manifest) {
        return {
          success: false,
          error: 'Invalid or missing manifest.json in the package',
        }
      }

      // Install to global plugins directory
      const destDir = join(this.globalPluginDir, manifest.name)
      await this.installToDir(sourceDir, destDir)

      // Write install metadata
      await writeInstallMetadata(destDir, {
        source: 'npm',
        packageName,
        installedAt: new Date().toISOString(),
      })

      return {
        success: true,
        pluginName: manifest.name,
        pluginDir: destDir,
      }
    } catch (err) {
      return {
        success: false,
        error: `npm install failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    } finally {
      // Clean up temp directory
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * Install a plugin from a URL (tarball).
   * Downloads the file, extracts it, validates, and installs.
   */
  async installFromUrl(url: string): Promise<PluginInstallResult> {
    const tmpDir = join(tmpdir(), `smoke-plugin-install-${Date.now()}`)

    try {
      await mkdir(tmpDir, { recursive: true })

      // Download the file
      const fileName = basename(new URL(url).pathname) || 'plugin.tgz'
      const downloadPath = join(tmpDir, fileName)
      await this.downloadFile(url, downloadPath)

      // Extract
      const extractDir = join(tmpDir, 'extracted')
      await mkdir(extractDir, { recursive: true })
      await execFileAsync('tar', ['xzf', downloadPath, '-C', extractDir], {
        timeout: 30_000,
      })

      // Find the plugin directory (could be root or in a subdirectory)
      const packageDir = join(extractDir, 'package')
      const sourceDir = await directoryExists(packageDir)
        ? packageDir
        : await findManifestDir(extractDir)

      if (!sourceDir) {
        return {
          success: false,
          error: 'No manifest.json found in the downloaded archive',
        }
      }

      // Validate manifest
      const manifest = await this.validatePluginDir(sourceDir)
      if (!manifest) {
        return {
          success: false,
          error: 'Invalid or missing manifest.json in the archive',
        }
      }

      // Install
      const destDir = join(this.globalPluginDir, manifest.name)
      await this.installToDir(sourceDir, destDir)

      // Write install metadata
      await writeInstallMetadata(destDir, {
        source: 'url',
        url,
        installedAt: new Date().toISOString(),
      })

      return {
        success: true,
        pluginName: manifest.name,
        pluginDir: destDir,
      }
    } catch (err) {
      return {
        success: false,
        error: `URL install failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * Uninstall a plugin by name from ~/.smoke/plugins/.
   * Only removes plugins that were installed (have .smoke-install.json)
   * unless force is true.
   */
  async uninstall(
    pluginName: string,
    force = false
  ): Promise<PluginUninstallResult> {
    const pluginDir = join(this.globalPluginDir, pluginName)

    if (!(await directoryExists(pluginDir))) {
      return { success: false, error: `Plugin "${pluginName}" not found` }
    }

    // Safety check: only remove installed plugins unless forced
    if (!force) {
      const metadata = await readInstallMetadata(pluginDir)
      if (!metadata) {
        return {
          success: false,
          error: `Plugin "${pluginName}" was not installed via the plugin manager. Use force to remove it.`,
        }
      }
    }

    try {
      await rm(pluginDir, { recursive: true, force: true })
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: `Failed to remove plugin: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * List install metadata for all globally installed plugins.
   */
  async listInstalled(): Promise<
    Array<{ name: string; metadata: InstallMetadata }>
  > {
    const results: Array<{ name: string; metadata: InstallMetadata }> = []

    if (!(await directoryExists(this.globalPluginDir))) {
      return results
    }

    try {
      const entries = await readdir(this.globalPluginDir, {
        withFileTypes: true,
      })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const metadata = await readInstallMetadata(
          join(this.globalPluginDir, entry.name)
        )
        if (metadata) {
          results.push({ name: entry.name, metadata })
        }
      }
    } catch {
      // directory not readable
    }

    return results
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async validatePluginDir(
    dir: string
  ): Promise<PluginManifest | null> {
    const manifestPath = join(dir, 'manifest.json')
    try {
      const content = await readFile(manifestPath, 'utf-8')
      const raw = JSON.parse(content)
      const result = validateManifest(raw)
      return result.valid && result.manifest ? result.manifest : null
    } catch {
      return null
    }
  }

  private async installToDir(
    sourceDir: string,
    destDir: string
  ): Promise<void> {
    // Ensure parent directory exists
    await mkdir(this.globalPluginDir, { recursive: true })

    // Remove existing installation if present
    if (await directoryExists(destDir)) {
      await rm(destDir, { recursive: true, force: true })
    }

    // Move source to destination
    try {
      await rename(sourceDir, destDir)
    } catch {
      // rename fails across filesystems — fall back to copy+delete
      await copyDir(sourceDir, destDir)
      await rm(sourceDir, { recursive: true, force: true })
    }
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = net.request(url)
      const chunks: Buffer[] = []

      request.on('response', (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          // Follow redirect
          const redirectUrl = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location
          this.downloadFile(redirectUrl, destPath).then(resolve, reject)
          return
        }

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode} downloading ${url}`))
          return
        }

        response.on('data', (chunk) => {
          chunks.push(chunk)
        })

        response.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks)
            const { writeFile: wf } = await import('fs/promises')
            await wf(destPath, buffer)
            resolve()
          } catch (err) {
            reject(err)
          }
        })

        response.on('error', reject)
      })

      request.on('error', reject)
      request.end()
    })
  }
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

async function directoryExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p)
    return s.isDirectory()
  } catch {
    return false
  }
}

/**
 * Recursively search for a directory containing manifest.json.
 * Returns the first match (breadth-first).
 */
async function findManifestDir(dir: string): Promise<string | null> {
  try {
    await access(join(dir, 'manifest.json'))
    return dir
  } catch {
    // Not in this directory, check subdirectories
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const result = await findManifestDir(join(dir, entry.name))
      if (result) return result
    }
  } catch {
    // not readable
  }

  return null
}

/**
 * Recursively copy a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      const content = await readFile(srcPath)
      await writeFile(destPath, content)
    }
  }
}
