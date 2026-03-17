import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * Check whether `target` is strictly within `boundary` using
 * segment-aware comparison (not raw string prefix).
 *
 * 1. Resolves both paths to absolute form (normalises `..`).
 * 2. Computes the relative path from boundary → target.
 * 3. Rejects if the relative path starts with `..` or is absolute
 *    (meaning target escapes the boundary).
 *
 * For symlink safety the caller may pass the realpath-resolved target;
 * see `assertWithinHome` which resolves the nearest existing ancestor.
 */
export function isWithinBoundary(target: string, boundary: string): boolean {
  const resolvedTarget = path.resolve(target)
  const resolvedBoundary = path.resolve(boundary)

  // Exact match (writing to the boundary root itself) — allow
  if (resolvedTarget === resolvedBoundary) return true

  const rel = path.relative(resolvedBoundary, resolvedTarget)

  // Relative path must not escape upward (`..`) or be absolute
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false

  return true
}

/**
 * Resolve the real (symlink-free) path of the deepest existing ancestor
 * of `filePath`.  This catches symlink escapes even when the target file
 * doesn't exist yet (common for write operations).
 */
export async function resolveNearestReal(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath)

  // Walk up until we find an existing directory we can realpath
  let current = resolved
  const trailing: string[] = []

  while (true) {
    try {
      const real = await fs.realpath(current)
      // Re-append the trailing segments that didn't exist yet
      return trailing.length > 0
        ? path.join(real, ...trailing.reverse())
        : real
    } catch {
      const parent = path.dirname(current)
      if (parent === current) {
        // Reached filesystem root without finding an existing path
        return resolved
      }
      trailing.push(path.basename(current))
      current = parent
    }
  }
}

/**
 * Assert that a file path is safely within the user's home directory.
 * Resolves symlinks on the nearest existing ancestor to prevent symlink escapes.
 * Throws a descriptive error if the path is outside the boundary.
 */
export async function assertWithinHome(
  filePath: string,
  homedir: string
): Promise<void> {
  const realPath = await resolveNearestReal(filePath)
  const realHome = await resolveNearestReal(homedir)

  if (!isWithinBoundary(realPath, realHome)) {
    throw new Error('Access denied: path must be within the user home directory')
  }
}

/**
 * Assert that a file path is within at least one of the provided boundary
 * directories.  Resolves symlinks on the nearest existing ancestor to
 * prevent symlink escapes.
 *
 * Useful for read operations where access should be allowed from both
 * the user home directory and the project working directory.
 */
export async function assertWithinAny(
  filePath: string,
  boundaries: string[]
): Promise<void> {
  const realPath = await resolveNearestReal(filePath)

  for (const boundary of boundaries) {
    const realBoundary = await resolveNearestReal(boundary)
    if (isWithinBoundary(realPath, realBoundary)) return
  }

  throw new Error(
    'Access denied: path must be within an allowed directory'
  )
}
