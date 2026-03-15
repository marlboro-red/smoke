import { type WebviewSession } from '../stores/sessionStore'
import { CHROME_HEIGHT } from '../window/useSnapping'
import '../styles/thumbnail.css'

interface WebviewThumbnailProps {
  session: WebviewSession
}

export default function WebviewThumbnail({
  session,
}: WebviewThumbnailProps): JSX.Element {
  return (
    <div
      className="terminal-thumbnail webview-thumbnail"
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
        <span className="thumbnail-status webview" />
        <span className="thumbnail-title">{session.title}</span>
      </div>
      <div
        className="thumbnail-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <div className="thumbnail-text webview-thumbnail-content">
          <div className="thumbnail-line webview-thumbnail-url">
            {session.url}
          </div>
        </div>
      </div>
    </div>
  )
}
