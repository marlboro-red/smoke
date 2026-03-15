import { useEffect, useRef, useCallback } from 'react'
import {
  assemblyPreviewStore,
  useAssemblyPreviewOpen,
  useAssemblyPreviewFiles,
  useAssemblyPreviewTask,
  useAddSearchQuery,
  useAddSearchResults,
  groupFilesByModule,
  type PreviewFile,
} from './assemblyPreviewStore'
import '../styles/assembly-preview.css'

function relevanceLabel(score: number): { text: string; className: string } {
  const pct = Math.round(score * 100)
  if (score >= 0.7) return { text: `${pct}%`, className: 'high' }
  if (score >= 0.4) return { text: `${pct}%`, className: 'medium' }
  return { text: `${pct}%`, className: '' }
}

function FileRow({ file }: { file: PreviewFile }): JSX.Element {
  const rel = relevanceLabel(file.relevance)

  const handleToggle = useCallback(() => {
    assemblyPreviewStore.getState().toggleFile(file.filePath)
  }, [file.filePath])

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      assemblyPreviewStore.getState().removeFile(file.filePath)
    },
    [file.filePath],
  )

  return (
    <div
      className={`assembly-file-row ${file.selected ? '' : 'deselected'}`}
      onClick={handleToggle}
    >
      <input
        type="checkbox"
        className="assembly-file-checkbox"
        checked={file.selected}
        onChange={handleToggle}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="assembly-file-info">
        <span className="assembly-file-name">{file.basename}</span>
        <span className="assembly-file-path">{file.relativePath}</span>
      </div>
      <div className="assembly-file-meta">
        <span className="assembly-source-tag">{file.source}</span>
        {file.relevance > 0 && (
          <span className={`assembly-relevance ${rel.className}`}>{rel.text}</span>
        )}
        <button
          className="assembly-remove-btn"
          onClick={handleRemove}
          title="Remove file"
        >
          &times;
        </button>
      </div>
    </div>
  )
}

function AddFileSearch(): JSX.Element {
  const query = useAddSearchQuery()
  const results = useAddSearchResults()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    assemblyPreviewStore.getState().setAddSearchQuery(q)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) {
      assemblyPreviewStore.getState().setAddSearchResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      const resp = await window.smokeAPI?.search.query(q, 20)
      if (!resp) return
      // Deduplicate file paths and filter out already-added files
      const existingPaths = new Set(
        assemblyPreviewStore.getState().files.map((f) => f.filePath),
      )
      const uniquePaths: string[] = []
      const seen = new Set<string>()
      for (const r of resp.results) {
        if (!seen.has(r.filePath) && !existingPaths.has(r.filePath)) {
          seen.add(r.filePath)
          uniquePaths.push(r.filePath)
        }
        if (uniquePaths.length >= 10) break
      }
      assemblyPreviewStore.getState().setAddSearchResults(uniquePaths)
    }, 200)
  }, [])

  const handleAdd = useCallback((filePath: string) => {
    assemblyPreviewStore.getState().addFile(filePath)
    inputRef.current?.focus()
  }, [])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="assembly-add-section">
      <div className="assembly-add-input-wrapper">
        <svg
          className="assembly-add-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          ref={inputRef}
          className="assembly-add-input"
          type="text"
          placeholder="Search to add more files..."
          value={query}
          onChange={handleInput}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {results.length > 0 && (
        <div className="assembly-add-results">
          {results.map((filePath) => {
            const parts = filePath.split('/')
            const name = parts[parts.length - 1]
            const dir = parts.slice(0, -1).join('/')
            return (
              <button
                key={filePath}
                className="assembly-add-result-row"
                onClick={() => handleAdd(filePath)}
              >
                <span className="add-plus">+</span>
                <span className="assembly-add-result-path" title={filePath}>
                  {name}
                  {dir && <span style={{ opacity: 0.5 }}> — {dir}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AssemblyPreview(): JSX.Element | null {
  const isOpen = useAssemblyPreviewOpen()
  const files = useAssemblyPreviewFiles()
  const task = useAssemblyPreviewTask()
  const backdropRef = useRef<HTMLDivElement>(null)

  const selectedCount = files.filter((f) => f.selected).length

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        assemblyPreviewStore.getState().close()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [isOpen])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      assemblyPreviewStore.getState().close()
    }
  }, [])

  const handleConfirm = useCallback(() => {
    // Dispatch a custom event that the workspace assembler can listen to
    const selected = assemblyPreviewStore.getState().getSelectedFiles()
    const projectRoot = assemblyPreviewStore.getState().projectRoot
    window.dispatchEvent(
      new CustomEvent('assembly:confirm', {
        detail: { files: selected, projectRoot },
      }),
    )
    assemblyPreviewStore.getState().close()
  }, [])

  const handleCancel = useCallback(() => {
    assemblyPreviewStore.getState().close()
  }, [])

  if (!isOpen) return null

  const groups = groupFilesByModule(files)

  return (
    <div className="assembly-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="assembly-modal">
        {/* Header */}
        <div className="assembly-header">
          <div className="assembly-header-top">
            <h2 className="assembly-title">Workspace Preview</h2>
            <button
              className="assembly-close-btn"
              onClick={handleCancel}
              aria-label="Close preview"
            >
              &times;
            </button>
          </div>
          {task.description && (
            <p className="assembly-task-desc">
              {task.parsed && (
                <span className="assembly-task-intent">{task.parsed.intent}</span>
              )}
              {task.description}
            </p>
          )}
        </div>

        {/* Toolbar */}
        <div className="assembly-toolbar">
          <button
            className="assembly-toolbar-btn"
            onClick={() => assemblyPreviewStore.getState().selectAll()}
          >
            Select all
          </button>
          <button
            className="assembly-toolbar-btn"
            onClick={() => assemblyPreviewStore.getState().deselectAll()}
          >
            Deselect all
          </button>
          <span className="assembly-count">
            {selectedCount} of {files.length} selected
          </span>
        </div>

        {/* File list grouped by module */}
        <div className="assembly-body">
          {files.length === 0 && (
            <div className="assembly-empty">
              No files found. Try adding files manually below.
            </div>
          )}
          {groups.map((group) => (
            <div key={group.label} className="assembly-group">
              <div className="assembly-group-header">{group.label}</div>
              {group.files.map((file) => (
                <FileRow key={file.filePath} file={file} />
              ))}
            </div>
          ))}
        </div>

        {/* Add files via search */}
        <AddFileSearch />

        {/* Footer */}
        <div className="assembly-footer">
          <span className="assembly-footer-hint">Esc to cancel</span>
          <div className="assembly-footer-actions">
            <button className="assembly-cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="assembly-confirm-btn"
              onClick={handleConfirm}
              disabled={selectedCount === 0}
            >
              Open {selectedCount} {selectedCount === 1 ? 'file' : 'files'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
