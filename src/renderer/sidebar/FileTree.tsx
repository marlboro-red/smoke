import React, { useState, useCallback, useEffect } from 'react'
import { usePreferencesStore } from '../stores/preferencesStore'
import type { FsReaddirEntry } from '../../preload/types'

interface TreeNode {
  name: string
  path: string
  type: FsReaddirEntry['type']
  size: number
  children?: TreeNode[]
  loaded: boolean
  expanded: boolean
}

const FILE_ICONS: Record<string, string> = {
  directory: '\u25B8',
  directoryOpen: '\u25BE',
  '.ts': 'TS',
  '.tsx': 'TX',
  '.js': 'JS',
  '.jsx': 'JX',
  '.json': '{}',
  '.css': '#',
  '.html': '<>',
  '.md': 'md',
  '.yml': '::',
  '.yaml': '::',
  '.toml': '::',
  '.sh': '$_',
  '.py': 'py',
  '.rs': 'rs',
  '.go': 'go',
  file: '\u2014',
  symlink: '~>',
  other: '??',
}

function getFileIcon(entry: { name: string; type: string }, expanded?: boolean): string {
  if (entry.type === 'directory') {
    return expanded ? FILE_ICONS.directoryOpen : FILE_ICONS.directory
  }
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
    // Directories first
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1
    // Then alphabetical, case-insensitive
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

const FileTreeNode = React.memo(function FileTreeNode({
  node,
  depth,
  onToggle,
  onFileOpen,
}: {
  node: TreeNode
  depth: number
  onToggle: (node: TreeNode) => void
  onFileOpen: (filePath: string) => void
}) {
  const isDir = node.type === 'directory'
  const icon = getFileIcon(node, node.expanded)
  const typeClass = getFileTypeClass(node)

  return (
    <>
      <div
        className={`ft-node ${typeClass}${isDir ? ' ft-expandable' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => isDir ? onToggle(node) : onFileOpen(node.path)}
      >
        {isDir && (
          <span className={`ft-arrow${node.expanded ? ' expanded' : ''}`}>▶</span>
        )}
        <span className="ft-icon">{icon}</span>
        <span className="ft-name">{node.name}</span>
      </div>
      {isDir && node.expanded && node.children && (
        node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onToggle={onToggle}
            onFileOpen={onFileOpen}
          />
        ))
      )}
    </>
  )
})

export default function FileTree({ onFileOpen }: { onFileOpen: (filePath: string) => void }): JSX.Element {
  const launchCwd = usePreferencesStore((s) => s.launchCwd)
  const defaultCwd = usePreferencesStore((s) => s.preferences.defaultCwd)
  const rootPath = defaultCwd || launchCwd

  const [roots, setRoots] = useState<TreeNode[]>([])
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const loadChildren = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    const entries = await window.smokeAPI.fs.readdir(dirPath)
    const filtered = entries.filter((e) => !e.name.startsWith('.') || e.name === '.env')
      .filter((e) => !IGNORED_NAMES.has(e.name))
    const sorted = sortEntries(filtered)
    return sorted.map((entry) => ({
      name: entry.name,
      path: dirPath + '/' + entry.name,
      type: entry.type,
      size: entry.size,
      loaded: false,
      expanded: false,
    }))
  }, [])

  useEffect(() => {
    if (!rootPath) return
    setError(null)
    loadChildren(rootPath)
      .then(setRoots)
      .catch((err) => setError(err.message || 'Failed to read directory'))
  }, [rootPath, loadChildren])

  const handleToggle = useCallback(async (target: TreeNode) => {
    const toggleInList = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      const result: TreeNode[] = []
      for (const node of nodes) {
        if (node.path === target.path) {
          const willExpand = !node.expanded
          let children = node.children
          if (willExpand && !node.loaded) {
            try {
              children = await loadChildren(node.path)
            } catch {
              children = []
            }
          }
          result.push({ ...node, expanded: willExpand, children, loaded: true })
        } else if (node.children) {
          result.push({ ...node, children: await toggleInList(node.children) })
        } else {
          result.push(node)
        }
      }
      return result
    }
    setRoots(await toggleInList(roots))
  }, [roots, loadChildren])

  const rootDirName = rootPath ? rootPath.split('/').pop() || rootPath : 'No directory'

  return (
    <div className="ft-panel">
      <div
        className="ft-panel-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`section-toggle-arrow${!collapsed ? ' expanded' : ''}`}>{'\u25B6'}</span>
        <span className="ft-panel-title">Files</span>
        <span className="ft-root-name" title={rootPath}>{rootDirName}</span>
      </div>
      {!collapsed && (
        <div className="ft-tree">
          {error && <div className="ft-error">{error}</div>}
          {!error && roots.length === 0 && rootPath && (
            <div className="ft-empty">Empty directory</div>
          )}
          {!rootPath && (
            <div className="ft-empty">No working directory</div>
          )}
          {roots.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              onToggle={handleToggle}
              onFileOpen={onFileOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}
