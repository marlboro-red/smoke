import { CHROME_HEIGHT } from '../window/useSnapping'
import type { PluginThumbnailProps } from './pluginElementRegistry'
import '../styles/plugin.css'

export default function PluginThumbnail({
  session,
}: PluginThumbnailProps): JSX.Element {
  return (
    <div
      className="terminal-thumbnail plugin-thumbnail"
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
        <span className="thumbnail-status plugin" />
        <span className="thumbnail-title">{session.title}</span>
      </div>
      <div
        className="thumbnail-body"
        style={{ height: `calc(100% - ${CHROME_HEIGHT}px)` }}
      >
        <div className="thumbnail-text">
          {session.pluginManifest.name} v{session.pluginManifest.version}
        </div>
      </div>
    </div>
  )
}
