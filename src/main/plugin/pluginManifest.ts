/**
 * Plugin manifest schema and validation for Smoke plugins.
 *
 * A plugin is a directory containing a manifest.json that declares metadata,
 * entry point, permissions, default element sizing, and user-facing configuration.
 * Plugins become first-class canvas elements — draggable, resizable, snappable.
 *
 * ## manifest.json specification
 *
 * | Field          | Type                          | Required | Description |
 * |----------------|-------------------------------|----------|-------------|
 * | name           | string                        | yes      | Unique id: lowercase alphanumeric + hyphens, 1-64 chars (e.g. "docker-dashboard") |
 * | version        | string                        | yes      | Semver (e.g. "1.0.0", "2.1.0-beta.3") |
 * | description    | string                        | yes      | Human-readable summary |
 * | author         | string                        | yes      | Author name, optionally with email ("Jane <jane@x.com>") |
 * | icon           | string                        | no       | Relative path to a .png or .svg icon (≤64×64) |
 * | defaultSize    | { width: number, height: number } | yes  | Default canvas element size in pixels |
 * | entryPoint     | string                        | yes      | Relative path to entry file (.js, .ts, .tsx, .jsx) |
 * | permissions    | PluginPermission[]            | yes      | API permissions (may be empty). See PluginPermission type |
 * | configSchema   | Record<string, PluginConfigField> | no   | User-facing settings. Keys become config property names |
 *
 * ### Permissions
 *
 * `filesystem.read` | `filesystem.write` | `network` | `pty` | `clipboard` | `notifications` | `shell`
 *
 * ### Config field types
 *
 * - `string`  — free-text input
 * - `number`  — numeric input, optional `min`/`max`
 * - `boolean` — toggle
 * - `select`  — dropdown, requires `options: string[]`
 *
 * Each field must have a `label` (display name) and may have `description` and `default`.
 *
 * ### Example manifest.json
 *
 * ```json
 * {
 *   "name": "docker-dashboard",
 *   "version": "1.0.0",
 *   "description": "Monitor Docker containers on your canvas",
 *   "author": "Jane Smith <jane@example.com>",
 *   "icon": "icon.png",
 *   "defaultSize": { "width": 400, "height": 300 },
 *   "entryPoint": "src/index.tsx",
 *   "permissions": ["network", "shell"],
 *   "configSchema": {
 *     "refreshInterval": {
 *       "type": "number",
 *       "label": "Refresh interval (s)",
 *       "default": 5,
 *       "min": 1,
 *       "max": 60
 *     }
 *   }
 * }
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** API permissions a plugin may request. */
export type PluginPermission =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'network'
  | 'pty'
  | 'clipboard'
  | 'notifications'
  | 'shell'

/** All recognised permission values (used for validation). */
const VALID_PERMISSIONS: ReadonlySet<string> = new Set<PluginPermission>([
  'filesystem.read',
  'filesystem.write',
  'network',
  'pty',
  'clipboard',
  'notifications',
  'shell',
])

/** JSON-schema-style type for a single config field. */
export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean' | 'select'
  label: string
  description?: string
  default?: string | number | boolean
  /** Required when type is 'select'. */
  options?: string[]
  /** Optional min/max for numeric fields. */
  min?: number
  max?: number
}

/** Default element size on the canvas (in px). */
export interface PluginElementSize {
  width: number
  height: number
}

/** The full plugin manifest shape. */
export interface PluginManifest {
  /** Unique plugin identifier (lowercase, hyphens, e.g. "docker-dashboard"). */
  name: string
  /** Semver version string (e.g. "1.0.0"). */
  version: string
  /** Human-readable description. */
  description: string
  /** Author name or "Name <email>". */
  author: string
  /** Relative path to an icon file (PNG/SVG, ≤64×64). Optional. */
  icon?: string
  /** Default canvas element size in pixels. */
  defaultSize: PluginElementSize
  /** Relative path to the entry point (JS/TS/TSX). */
  entryPoint: string
  /** API permissions the plugin requires. Empty array means no special permissions. */
  permissions: PluginPermission[]
  /** User-facing config fields. Keys become config keys in the plugin's settings. */
  configSchema?: Record<string, PluginConfigField>
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ManifestValidationError {
  field: string
  message: string
}

export interface ManifestValidationResult {
  valid: boolean
  errors: ManifestValidationError[]
  manifest?: PluginManifest
}

/** Semver-ish pattern: MAJOR.MINOR.PATCH with optional pre-release. */
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/

/** Plugin name: lowercase letters, digits, hyphens; 1-64 chars. */
const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/

/** Allowed entry-point extensions. */
const ENTRY_EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx']

/** Allowed icon extensions. */
const ICON_EXTENSIONS = ['.png', '.svg']

function hasExtension(path: string, exts: string[]): boolean {
  const lower = path.toLowerCase()
  return exts.some((ext) => lower.endsWith(ext))
}

/**
 * Validate a raw JSON value as a plugin manifest.
 *
 * Returns a result with `valid: true` and a typed `manifest` on success,
 * or `valid: false` with a list of errors describing every problem found.
 */
export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: ManifestValidationError[] = []

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: [{ field: '(root)', message: 'Manifest must be a JSON object' }] }
  }

  const obj = raw as Record<string, unknown>

  // --- name ---
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    errors.push({ field: 'name', message: 'Required string field' })
  } else if (!NAME_RE.test(obj.name)) {
    errors.push({
      field: 'name',
      message:
        'Must be 1-64 lowercase alphanumeric characters or hyphens, starting and ending with a letter or digit',
    })
  }

  // --- version ---
  if (typeof obj.version !== 'string' || obj.version.length === 0) {
    errors.push({ field: 'version', message: 'Required string field' })
  } else if (!SEMVER_RE.test(obj.version)) {
    errors.push({ field: 'version', message: 'Must be a valid semver string (e.g. "1.0.0")' })
  }

  // --- description ---
  if (typeof obj.description !== 'string' || obj.description.length === 0) {
    errors.push({ field: 'description', message: 'Required string field' })
  }

  // --- author ---
  if (typeof obj.author !== 'string' || obj.author.length === 0) {
    errors.push({ field: 'author', message: 'Required string field' })
  }

  // --- icon (optional) ---
  if (obj.icon !== undefined) {
    if (typeof obj.icon !== 'string' || obj.icon.length === 0) {
      errors.push({ field: 'icon', message: 'Must be a non-empty string when provided' })
    } else if (!hasExtension(obj.icon, ICON_EXTENSIONS)) {
      errors.push({ field: 'icon', message: 'Must be a .png or .svg file' })
    } else if (obj.icon.startsWith('/') || obj.icon.startsWith('..')) {
      errors.push({ field: 'icon', message: 'Must be a relative path within the plugin directory' })
    }
  }

  // --- defaultSize ---
  if (obj.defaultSize === undefined || obj.defaultSize === null || typeof obj.defaultSize !== 'object') {
    errors.push({ field: 'defaultSize', message: 'Required object with width and height' })
  } else {
    const size = obj.defaultSize as Record<string, unknown>
    if (typeof size.width !== 'number' || size.width <= 0) {
      errors.push({ field: 'defaultSize.width', message: 'Must be a positive number' })
    }
    if (typeof size.height !== 'number' || size.height <= 0) {
      errors.push({ field: 'defaultSize.height', message: 'Must be a positive number' })
    }
  }

  // --- entryPoint ---
  if (typeof obj.entryPoint !== 'string' || obj.entryPoint.length === 0) {
    errors.push({ field: 'entryPoint', message: 'Required string field' })
  } else {
    if (!hasExtension(obj.entryPoint, ENTRY_EXTENSIONS)) {
      errors.push({
        field: 'entryPoint',
        message: `Must end with one of: ${ENTRY_EXTENSIONS.join(', ')}`,
      })
    }
    if (obj.entryPoint.startsWith('/') || obj.entryPoint.startsWith('..')) {
      errors.push({ field: 'entryPoint', message: 'Must be a relative path within the plugin directory' })
    }
  }

  // --- permissions ---
  if (!Array.isArray(obj.permissions)) {
    errors.push({ field: 'permissions', message: 'Required array of permission strings' })
  } else {
    for (let i = 0; i < obj.permissions.length; i++) {
      const perm = obj.permissions[i]
      if (typeof perm !== 'string' || !VALID_PERMISSIONS.has(perm)) {
        errors.push({
          field: `permissions[${i}]`,
          message: `Invalid permission "${perm}". Valid: ${[...VALID_PERMISSIONS].join(', ')}`,
        })
      }
    }
    // Check for duplicates
    const seen = new Set<string>()
    for (let i = 0; i < obj.permissions.length; i++) {
      const perm = obj.permissions[i] as string
      if (seen.has(perm)) {
        errors.push({ field: `permissions[${i}]`, message: `Duplicate permission "${perm}"` })
      }
      seen.add(perm)
    }
  }

  // --- configSchema (optional) ---
  if (obj.configSchema !== undefined) {
    if (obj.configSchema === null || typeof obj.configSchema !== 'object' || Array.isArray(obj.configSchema)) {
      errors.push({ field: 'configSchema', message: 'Must be an object when provided' })
    } else {
      const schema = obj.configSchema as Record<string, unknown>
      for (const [key, fieldRaw] of Object.entries(schema)) {
        const prefix = `configSchema.${key}`
        if (fieldRaw === null || typeof fieldRaw !== 'object' || Array.isArray(fieldRaw)) {
          errors.push({ field: prefix, message: 'Must be an object' })
          continue
        }
        const field = fieldRaw as Record<string, unknown>

        const validTypes = ['string', 'number', 'boolean', 'select']
        if (typeof field.type !== 'string' || !validTypes.includes(field.type)) {
          errors.push({ field: `${prefix}.type`, message: `Must be one of: ${validTypes.join(', ')}` })
        }

        if (typeof field.label !== 'string' || field.label.length === 0) {
          errors.push({ field: `${prefix}.label`, message: 'Required non-empty string' })
        }

        if (field.description !== undefined && typeof field.description !== 'string') {
          errors.push({ field: `${prefix}.description`, message: 'Must be a string when provided' })
        }

        // Validate default matches declared type
        if (field.default !== undefined && field.type !== undefined) {
          const expectedType =
            field.type === 'select' ? 'string' : (field.type as string)
          if (typeof field.default !== expectedType) {
            errors.push({
              field: `${prefix}.default`,
              message: `Default value must be of type "${expectedType}"`,
            })
          }
        }

        // select must have options
        if (field.type === 'select') {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            errors.push({ field: `${prefix}.options`, message: 'Required non-empty array for select type' })
          } else if (!field.options.every((o: unknown) => typeof o === 'string')) {
            errors.push({ field: `${prefix}.options`, message: 'All options must be strings' })
          }
        }

        // min/max only valid for number
        if (field.min !== undefined) {
          if (field.type !== 'number') {
            errors.push({ field: `${prefix}.min`, message: 'Only valid for number type' })
          } else if (typeof field.min !== 'number') {
            errors.push({ field: `${prefix}.min`, message: 'Must be a number' })
          }
        }
        if (field.max !== undefined) {
          if (field.type !== 'number') {
            errors.push({ field: `${prefix}.max`, message: 'Only valid for number type' })
          } else if (typeof field.max !== 'number') {
            errors.push({ field: `${prefix}.max`, message: 'Must be a number' })
          }
        }
        if (
          typeof field.min === 'number' &&
          typeof field.max === 'number' &&
          field.min > field.max
        ) {
          errors.push({ field: `${prefix}.min`, message: 'min must be ≤ max' })
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    errors: [],
    manifest: {
      name: obj.name as string,
      version: obj.version as string,
      description: obj.description as string,
      author: obj.author as string,
      icon: obj.icon as string | undefined,
      defaultSize: obj.defaultSize as PluginElementSize,
      entryPoint: obj.entryPoint as string,
      permissions: obj.permissions as PluginPermission[],
      configSchema: obj.configSchema as Record<string, PluginConfigField> | undefined,
    },
  }
}
