import { readFile, writeFile, readdir, rm, mkdir, rename, access, stat } from 'fs/promises'
import { createWriteStream } from 'fs'
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

      // Validate tarball contents before extraction
      await this.validateTarball(tgzPath)

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

      // Validate tarball contents before extraction
      await this.validateTarball(downloadPath)

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

  private async downloadFile(url: string, destPath: string, redirectCount = 0): Promise<void> {
    const MAX_REDIRECTS = 5
    const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024 // 50 MB
    const DOWNLOAD_TIMEOUT = 60_000 // 60 seconds

    if (redirectCount > MAX_REDIRECTS) {
      throw new Error(`Too many redirects (>${MAX_REDIRECTS}) downloading ${url}`)
    }

    return new Promise((resolve, reject) => {
      const request = net.request(url)
      let totalBytes = 0
      let settled = false

      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        request.abort()
        reject(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT / 1000}s`))
      }, DOWNLOAD_TIMEOUT)

      const fail = (err: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        reject(err)
      }

      request.on('response', (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          clearTimeout(timeoutId)
          settled = true
          const redirectUrl = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location
          this.downloadFile(redirectUrl, destPath, redirectCount + 1).then(resolve, reject)
          return
        }

        if (response.statusCode && response.statusCode >= 400) {
          fail(new Error(`HTTP ${response.statusCode} downloading ${url}`))
          return
        }

        // Reject early if Content-Length exceeds limit
        const contentLength = response.headers['content-length']
        const declaredSize = contentLength
          ? Number(Array.isArray(contentLength) ? contentLength[0] : contentLength)
          : null
        if (declaredSize && declaredSize > MAX_DOWNLOAD_SIZE) {
          request.abort()
          fail(
            new Error(
              `Download rejected: declared size ${declaredSize} bytes exceeds ${MAX_DOWNLOAD_SIZE} byte limit`
            )
          )
          return
        }

        // Stream directly to file instead of buffering in memory
        const fileStream = createWriteStream(destPath)

        fileStream.on('error', (err) => {
          request.abort()
          fail(err)
        })

        response.on('data', (chunk) => {
          totalBytes += chunk.length
          if (totalBytes > MAX_DOWNLOAD_SIZE) {
            fileStream.destroy()
            request.abort()
            fail(
              new Error(
                `Download aborted: exceeded ${MAX_DOWNLOAD_SIZE} byte limit`
              )
            )
            return
          }
          fileStream.write(chunk)
        })

        response.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          fileStream.end(() => resolve())
        })

        response.on('error', (err) => {
          fileStream.destroy()
          fail(err)
        })
      })

      request.on('error', fail)
      request.end()
    })
  }

  /**
   * Validate tarball contents before extraction.
   * Checks for path traversal attacks and excessive entry counts.
   */
  private async validateTarball(tgzPath: string): Promise<void> {
    const MAX_ENTRIES = 10_000

    const { stdout } = await execFileAsync('tar', ['tzf', tgzPath], {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    })

    const entries = stdout.trim().split('\n').filter(Boolean)

    if (entries.length > MAX_ENTRIES) {
      throw new Error(
        `Archive contains ${entries.length} entries, exceeding the ${MAX_ENTRIES} entry limit`
      )
    }

    for (const entry of entries) {
      const normalized = entry.replace(/\\/g, '/')
      if (
        normalized.includes('../') ||
        normalized.startsWith('/') ||
        normalized.includes('/..')
      ) {
        throw new Error(`Archive contains path traversal: ${entry}`)
      }
    }
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
