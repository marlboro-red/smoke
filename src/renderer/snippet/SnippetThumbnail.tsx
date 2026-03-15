import { type SnippetSession } from '../stores/sessionStore'
import { CHROME_HEIGHT } from '../window/useSnapping'
import '../styles/thumbnail.css'

interface SnippetThumbnailProps {
  session: SnippetSession
}

export default function SnippetThumbnail({
  session,
}: SnippetThumbnailProps): JSX.Element {
  const lines = session.content.split('\n')

  return (
    <div
      className="terminal-thumbnail snippet-thumbnail"
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
        <span className="thumbnail-status snippet" />
        <span className="thumbnail-title">{session.title}</span>
        <span className="snippet-thumbnail-lang">{session.language}</span>
      </div>
      <div
        className="thumbnail-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <div className="thumbnail-text">
          {lines.slice(0, 30).map((line, i) => (
            <div key={i} className="thumbnail-line">
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
