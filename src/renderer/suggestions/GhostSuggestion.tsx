import { useCallback, useState } from 'react'
import type { FileSuggestion } from '../stores/suggestionStore'
import { suggestionStore } from '../stores/suggestionStore'
import { sessionStore } from '../stores/sessionStore'
import { preferencesStore } from '../stores/preferencesStore'
import '../styles/ghost-suggestion.css'

interface GhostSuggestionProps {
  suggestion: FileSuggestion
}

/** Map reason to a short label */
export function reasonLabel(reason: FileSuggestion['reason']): string {
  switch (reason) {
    case 'import':
      return 'imports'
    case 'dependent':
      return 'imported by'
    case 'keyword':
      return 'related'
  }
}

/** File extension to language hint */
export function extToLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    css: 'css',
    json: 'json',
    html: 'html',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
  }
  return map[ext] || ext
}

export default function GhostSuggestion({ suggestion }: GhostSuggestionProps): JSX.Element {
  const [materializing, setMaterializing] = useState(false)

  const handleMaterialize = useCallback(async () => {
    if (materializing) return
    setMaterializing(true)

    try {
      // Read the file content
      const result = await window.smokeAPI.fs.readfile(suggestion.filePath, 256 * 1024)
      const language = extToLanguage(suggestion.filePath)

      // Create a real file session at the ghost's position
      sessionStore.getState().createFileSession(
        suggestion.filePath,
        result.content,
        language,
        suggestion.position
      )

      // Remove this suggestion
      suggestionStore.getState().removeSuggestion(suggestion.id)
    } catch {
      setMaterializing(false)
    }
  }, [suggestion, materializing])

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      suggestionStore.getState().removeSuggestion(suggestion.id)
    },
    [suggestion.id]
  )

  // Truncate long paths from the left
  const displayPath = suggestion.displayName.length > 40
    ? '...' + suggestion.displayName.slice(-37)
    : suggestion.displayName

  // Get file name only
  const fileName = suggestion.filePath.split('/').pop() || suggestion.filePath

  // Get directory path relative to project root
  const { launchCwd } = preferencesStore.getState()
  let dirPath = ''
  const lastSlash = suggestion.displayName.lastIndexOf('/')
  if (lastSlash > 0) {
    dirPath = suggestion.displayName.slice(0, lastSlash)
  }

  // Relevance bar width (0-100%)
  const barWidth = Math.round(suggestion.relevanceScore * 100)

  return (
    <div
      className={`ghost-suggestion ${materializing ? 'materializing' : ''}`}
      style={{
        position: 'absolute',
        left: suggestion.position.x,
        top: suggestion.position.y,
      }}
      onClick={handleMaterialize}
      title={`Click to open ${suggestion.displayName}`}
    >
      <div className="ghost-suggestion-header">
        <span className="ghost-suggestion-icon">+</span>
        <span className="ghost-suggestion-filename">{fileName}</span>
        <button
          className="ghost-suggestion-dismiss"
          onClick={handleDismiss}
          title="Dismiss suggestion"
        >
          ×
        </button>
      </div>
      {dirPath && <div className="ghost-suggestion-path">{dirPath}</div>}
      <div className="ghost-suggestion-footer">
        <span className="ghost-suggestion-reason">{reasonLabel(suggestion.reason)}</span>
        <div className="ghost-suggestion-relevance-bar">
          <div
            className="ghost-suggestion-relevance-fill"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  )
}
