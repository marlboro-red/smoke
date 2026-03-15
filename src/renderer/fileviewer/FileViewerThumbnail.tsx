import { useMemo } from 'react'
import { type FileViewerSession } from '../stores/sessionStore'
import { CHROME_HEIGHT } from '../window/useSnapping'
import '../styles/thumbnail.css'

interface FileViewerThumbnailProps {
  session: FileViewerSession
}

/** Map common extensions to color classes for the badge */
function extensionColor(ext: string): string {
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'ext-ts'
    case 'js':
    case 'jsx':
      return 'ext-js'
    case 'py':
      return 'ext-py'
    case 'rs':
      return 'ext-rs'
    case 'go':
      return 'ext-go'
    case 'css':
    case 'scss':
      return 'ext-css'
    case 'html':
      return 'ext-html'
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return 'ext-config'
    case 'md':
    case 'txt':
      return 'ext-text'
    default:
      return 'ext-default'
  }
}

/** Build minimap bars: one bar per source line, width proportional to line length */
function buildMinimapData(
  content: string,
  maxLines: number
): { width: number; indent: number }[] {
  const lines = content.split('\n')
  const total = lines.length
  // Sample evenly if there are more lines than we can display
  const step = total > maxLines ? total / maxLines : 1
  const maxLen = Math.max(1, ...lines.map((l) => l.length))

  const bars: { width: number; indent: number }[] = []
  for (let i = 0; i < Math.min(total, maxLines); i++) {
    const lineIdx = Math.floor(i * step)
    const line = lines[lineIdx] || ''
    const trimmed = line.replace(/^\s+/, '')
    const indent = (line.length - trimmed.length) / maxLen
    const width = trimmed.length / maxLen
    bars.push({ width, indent })
  }
  return bars
}

export default function FileViewerThumbnail({
  session,
}: FileViewerThumbnailProps): JSX.Element {
  const lines = session.content.split('\n')
  const lineCount = lines.length
  const ext = session.filePath.split('.').pop()?.toLowerCase() || ''
  const colorClass = extensionColor(ext)

  // Max minimap bars based on available body height
  // CHROME_HEIGHT is 32px, each bar is ~2px tall with 1px gap
  const maxBars = Math.floor((session.size.height - CHROME_HEIGHT - 16) / 3)
  const minimap = useMemo(
    () => buildMinimapData(session.content, Math.max(20, maxBars)),
    [session.content, maxBars]
  )

  return (
    <div
      className="terminal-thumbnail file-viewer-thumbnail"
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height,
        zIndex: session.zIndex,
      }}
    >
      <div className="thumbnail-chrome" style={{ height: CHROME_HEIGHT }}>
        <span className="thumbnail-status file" />
        <span className="thumbnail-title">{session.title}</span>
        {ext && (
          <span className={`thumbnail-ext-badge ${colorClass}`}>.{ext}</span>
        )}
      </div>
      <div
        className="thumbnail-body file-card-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <div className="file-card-meta">
          <span className="file-card-lines">{lineCount} lines</span>
          <span className="file-card-lang">{session.language || ext}</span>
        </div>
        <div className="file-card-minimap">
          {minimap.map((bar, i) => (
            <div
              key={i}
              className="minimap-bar"
              style={{
                marginLeft: `${bar.indent * 100}%`,
                width: `${Math.max(4, bar.width * 100)}%`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
