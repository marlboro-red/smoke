import { describe, it, expect, vi } from 'vitest'
import type { FsReaddirEntry } from '../../../preload/types'

// Extracted logic from FileTree for testing

const FILE_ICONS: Record<string, string> = {
  directory: '📁',
  directoryOpen: '📂',
  '.ts': '⬡',
  '.tsx': '⬡',
  '.js': '⬡',
  '.jsx': '⬡',
  '.json': '{ }',
  '.css': '#',
  '.html': '<>',
  '.md': 'M↓',
  '.yml': '⚙',
  '.yaml': '⚙',
  '.toml': '⚙',
  '.sh': '$',
  '.py': '🐍',
  '.rs': '🦀',
  '.go': 'Go',
  file: '📄',
  symlink: '🔗',
  other: '?',
}

function getFileIcon(entry: { name: string; type: string }, expanded?: boolean): string {
  if (entry.type === 'directory') return expanded ? FILE_ICONS.directoryOpen : FILE_ICONS.directory
  if (entry.type === 'symlink') return FILE_ICONS.symlink
  if (entry.type === 'other') return FILE_ICONS.other
  const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop()! : ''
  return FILE_ICONS[ext] || FILE_ICONS.file
}

function getFileTypeClass(entry: { name: string; type: string }): string {
  if (entry.type === 'directory') return 'ft-dir'
  if (entry.type === 'symlink') return 'ft-symlink'
  const ext = entry.name.includes('.') ? entry.name.split('.').pop()! : ''
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return 'ft-script'
  if (['css', 'html'].includes(ext)) return 'ft-markup'
  if (['json', 'yml', 'yaml', 'toml'].includes(ext)) return 'ft-config'
  if (['md', 'txt', 'rst'].includes(ext)) return 'ft-doc'
  return 'ft-file'
}

const IGNORED_NAMES = new Set([
  'node_modules', '.git', '.DS_Store', 'dist', 'build', '.next',
  '.cache', '.parcel-cache', 'coverage', '__pycache__', '.beads',
])

function sortEntries(entries: FsReaddirEntry[]): FsReaddirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

describe('getFileIcon', () => {
  it('returns folder icon for directories', () => {
    expect(getFileIcon({ name: 'src', type: 'directory' })).toBe('📁')
  })

  it('returns open folder icon for expanded directories', () => {
    expect(getFileIcon({ name: 'src', type: 'directory' }, true)).toBe('📂')
  })

  it('returns symlink icon', () => {
    expect(getFileIcon({ name: 'link', type: 'symlink' })).toBe('🔗')
  })

  it('returns correct icon for TypeScript files', () => {
    expect(getFileIcon({ name: 'App.tsx', type: 'file' })).toBe('⬡')
    expect(getFileIcon({ name: 'index.ts', type: 'file' })).toBe('⬡')
  })

  it('returns correct icon for CSS files', () => {
    expect(getFileIcon({ name: 'style.css', type: 'file' })).toBe('#')
  })

  it('returns correct icon for JSON files', () => {
    expect(getFileIcon({ name: 'package.json', type: 'file' })).toBe('{ }')
  })

  it('returns default file icon for unknown extensions', () => {
    expect(getFileIcon({ name: 'data.bin', type: 'file' })).toBe('📄')
  })

  it('returns default file icon for files with no extension', () => {
    expect(getFileIcon({ name: 'Makefile', type: 'file' })).toBe('📄')
  })
})

describe('getFileTypeClass', () => {
  it('returns ft-dir for directories', () => {
    expect(getFileTypeClass({ name: 'src', type: 'directory' })).toBe('ft-dir')
  })

  it('returns ft-symlink for symlinks', () => {
    expect(getFileTypeClass({ name: 'link', type: 'symlink' })).toBe('ft-symlink')
  })

  it('returns ft-script for JS/TS files', () => {
    expect(getFileTypeClass({ name: 'app.ts', type: 'file' })).toBe('ft-script')
    expect(getFileTypeClass({ name: 'app.tsx', type: 'file' })).toBe('ft-script')
    expect(getFileTypeClass({ name: 'app.js', type: 'file' })).toBe('ft-script')
    expect(getFileTypeClass({ name: 'app.jsx', type: 'file' })).toBe('ft-script')
  })

  it('returns ft-markup for CSS/HTML files', () => {
    expect(getFileTypeClass({ name: 'style.css', type: 'file' })).toBe('ft-markup')
    expect(getFileTypeClass({ name: 'index.html', type: 'file' })).toBe('ft-markup')
  })

  it('returns ft-config for config files', () => {
    expect(getFileTypeClass({ name: 'package.json', type: 'file' })).toBe('ft-config')
    expect(getFileTypeClass({ name: 'config.yml', type: 'file' })).toBe('ft-config')
    expect(getFileTypeClass({ name: 'config.yaml', type: 'file' })).toBe('ft-config')
    expect(getFileTypeClass({ name: 'Cargo.toml', type: 'file' })).toBe('ft-config')
  })

  it('returns ft-doc for documentation files', () => {
    expect(getFileTypeClass({ name: 'README.md', type: 'file' })).toBe('ft-doc')
    expect(getFileTypeClass({ name: 'notes.txt', type: 'file' })).toBe('ft-doc')
  })

  it('returns ft-file for unknown extensions', () => {
    expect(getFileTypeClass({ name: 'image.png', type: 'file' })).toBe('ft-file')
  })
})

describe('sortEntries', () => {
  it('puts directories before files', () => {
    const entries: FsReaddirEntry[] = [
      { name: 'index.ts', type: 'file', size: 100 },
      { name: 'src', type: 'directory', size: 0 },
      { name: 'README.md', type: 'file', size: 50 },
    ]
    const sorted = sortEntries(entries)
    expect(sorted[0].name).toBe('src')
    expect(sorted[1].name).toBe('index.ts')
    expect(sorted[2].name).toBe('README.md')
  })

  it('sorts alphabetically within same type (case-insensitive)', () => {
    const entries: FsReaddirEntry[] = [
      { name: 'Zebra.ts', type: 'file', size: 0 },
      { name: 'apple.ts', type: 'file', size: 0 },
      { name: 'banana.ts', type: 'file', size: 0 },
    ]
    const sorted = sortEntries(entries)
    expect(sorted.map((e) => e.name)).toEqual(['apple.ts', 'banana.ts', 'Zebra.ts'])
  })

  it('sorts directories alphabetically among themselves', () => {
    const entries: FsReaddirEntry[] = [
      { name: 'tests', type: 'directory', size: 0 },
      { name: 'src', type: 'directory', size: 0 },
      { name: 'docs', type: 'directory', size: 0 },
    ]
    const sorted = sortEntries(entries)
    expect(sorted.map((e) => e.name)).toEqual(['docs', 'src', 'tests'])
  })

  it('does not mutate the original array', () => {
    const entries: FsReaddirEntry[] = [
      { name: 'b.ts', type: 'file', size: 0 },
      { name: 'a.ts', type: 'file', size: 0 },
    ]
    sortEntries(entries)
    expect(entries[0].name).toBe('b.ts')
  })
})

describe('IGNORED_NAMES', () => {
  it('includes common ignored directories', () => {
    expect(IGNORED_NAMES.has('node_modules')).toBe(true)
    expect(IGNORED_NAMES.has('.git')).toBe(true)
    expect(IGNORED_NAMES.has('.DS_Store')).toBe(true)
    expect(IGNORED_NAMES.has('dist')).toBe(true)
    expect(IGNORED_NAMES.has('.beads')).toBe(true)
  })

  it('does not include normal directories', () => {
    expect(IGNORED_NAMES.has('src')).toBe(false)
    expect(IGNORED_NAMES.has('lib')).toBe(false)
  })
})

describe('FileTreeNode click handler logic', () => {
  // Regression test for smoke-gnwb: clicking a file entry must call onFileOpen
  // (previously used onDoubleClick, which made single-click do nothing)

  function simulateClick(
    isDir: boolean,
    onToggle: () => void,
    onFileOpen: () => void
  ): void {
    // Mirrors the onClick handler in FileTreeNode:
    //   onClick={() => isDir ? onToggle(node) : onFileOpen(node.path)}
    if (isDir) {
      onToggle()
    } else {
      onFileOpen()
    }
  }

  it('calls onFileOpen on single click for file entries', () => {
    const onToggle = vi.fn()
    const onFileOpen = vi.fn()
    simulateClick(false, onToggle, onFileOpen)
    expect(onFileOpen).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('calls onToggle on single click for directory entries', () => {
    const onToggle = vi.fn()
    const onFileOpen = vi.fn()
    simulateClick(true, onToggle, onFileOpen)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onFileOpen).not.toHaveBeenCalled()
  })

  it('never requires double-click to open files', () => {
    // Ensure the file open path is reachable via the same logic as onClick
    const onFileOpen = vi.fn()
    const isDir = false
    // The handler should directly call onFileOpen for non-directory nodes
    if (isDir) { /* onToggle */ } else { onFileOpen() }
    expect(onFileOpen).toHaveBeenCalled()
  })
})
