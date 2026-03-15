import React, { useCallback } from 'react'
import type { DirectoryCluster } from './useDirectoryClusters'
import { setPanTo, setZoomTo, getCanvasRootElement } from './useCanvasControls'
import '../styles/thumbnail.css'

const ZOOM_TARGET = 0.5
const TRANSITION_MS = 400

interface DirectoryClusterCardProps {
  cluster: DirectoryCluster
}

/**
 * Summary card shown at very low zoom levels, replacing individual
 * file viewer sessions from the same directory. Shows directory name,
 * file count, and connection count. Clicking zooms in to expand.
 */
const DirectoryClusterCard: React.FC<DirectoryClusterCardProps> = React.memo(({ cluster }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      const root = getCanvasRootElement()
      if (!root) return
      const rect = root.getBoundingClientRect()

      // Target: center the cluster's bounding box centroid in the viewport at ZOOM_TARGET
      const cx = cluster.bounds.x + cluster.bounds.width / 2
      const cy = cluster.bounds.y + cluster.bounds.height / 2
      const targetPanX = rect.width / 2 - cx * ZOOM_TARGET
      const targetPanY = rect.height / 2 - cy * ZOOM_TARGET

      // Animate the viewport transition
      const viewport = root.querySelector('.canvas-viewport') as HTMLElement | null
      if (viewport) {
        viewport.style.transition = `transform ${TRANSITION_MS}ms ease-out`
        setTimeout(() => {
          if (viewport) viewport.style.transition = ''
        }, TRANSITION_MS + 50)
      }

      setZoomTo(ZOOM_TARGET)
      setPanTo(targetPanX, targetPanY)
    },
    [cluster.bounds]
  )

  return (
    <div
      className="directory-cluster-card"
      style={{
        position: 'absolute',
        left: cluster.position.x,
        top: cluster.position.y,
      }}
      onClick={handleClick}
    >
      <div className="cluster-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 1.5h6c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-11C1.67 13.5 1 12.83 1 12V3.5Z"
            fill="currentColor"
            opacity="0.6"
          />
        </svg>
      </div>
      <span className="cluster-name">{cluster.dirName}</span>
      <div className="cluster-badges">
        <span className="cluster-badge cluster-file-count">{cluster.fileCount} files</span>
        {cluster.connectionCount > 0 && (
          <span className="cluster-badge cluster-conn-count">{cluster.connectionCount} deps</span>
        )}
      </div>
    </div>
  )
})

DirectoryClusterCard.displayName = 'DirectoryClusterCard'

export default DirectoryClusterCard
