import { type ImageSession } from '../stores/sessionStore'
import { CHROME_HEIGHT } from '../window/useSnapping'
import '../styles/thumbnail.css'

interface ImageThumbnailProps {
  session: ImageSession
}

export default function ImageThumbnail({
  session,
}: ImageThumbnailProps): JSX.Element {
  const ext = session.filePath.split('.').pop()?.toLowerCase() || ''

  return (
    <div
      className="terminal-thumbnail image-thumbnail"
      style={{
        position: 'absolute',
        left: session.position.x,
        top: session.position.y,
        width: session.size.width,
        height: session.size.height + CHROME_HEIGHT,
        zIndex: session.zIndex,
      }}
    >
      <div className="thumbnail-chrome" style={{ height: CHROME_HEIGHT }}>
        <span className="thumbnail-status image" />
        <span className="thumbnail-title">{session.title}</span>
        {ext && (
          <span className="thumbnail-ext-badge ext-image">.{ext}</span>
        )}
      </div>
      <div
        className="thumbnail-body image-thumbnail-body"
        style={{ height: session.size.height }}
      >
        <img
          src={session.dataUrl}
          alt={session.title}
          className="image-thumbnail-preview"
          draggable={false}
        />
      </div>
    </div>
  )
}
