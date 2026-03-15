import { type TerminalSession } from '../stores/sessionStore'
import { CHROME_HEIGHT } from '../window/useSnapping'
import '../styles/thumbnail.css'

interface TerminalThumbnailProps {
  session: TerminalSession
  textSnapshot: string[]
}

export default function TerminalThumbnail({
  session,
  textSnapshot,
}: TerminalThumbnailProps): JSX.Element {
  return (
    <div
      className="terminal-thumbnail"
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
        <span
          className={`thumbnail-status ${session.status}`}
        />
        <span className="thumbnail-title">{session.title}</span>
      </div>
      <div
        className="thumbnail-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <div className="thumbnail-text">
          {textSnapshot.map((line, i) => (
            <div key={i} className="thumbnail-line">
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
