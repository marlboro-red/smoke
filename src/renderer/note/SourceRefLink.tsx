import { useCallback } from 'react'
import { sessionStore, type SourceRef } from '../stores/sessionStore'
import { panToSession } from '../sidebar/useSidebarSync'
import { formatSourceLabel } from './extractToNote'

interface SourceRefLinkProps {
  sourceRef: SourceRef
}

export default function SourceRefLink({ sourceRef }: SourceRefLinkProps): JSX.Element | null {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const session = sessionStore.getState().sessions.get(sourceRef.sourceSessionId)
      if (!session) return

      // Pan to the source session
      panToSession(sourceRef.sourceSessionId)

      // If it's a file viewer and we have a line number, scroll to it
      if (session.type === 'file' && sourceRef.lineStart) {
        // Wait for pan animation to finish, then scroll to line
        setTimeout(() => {
          const sessionEl = document.querySelector(
            `[data-session-id="${sourceRef.sourceSessionId}"]`
          )
          if (!sessionEl) return

          const viewerBody = sessionEl.querySelector('.file-viewer-body')
          if (!viewerBody) return

          const lineElements = viewerBody.querySelectorAll('.line')
          const targetLine = sourceRef.lineStart! - 1
          if (targetLine >= 0 && targetLine < lineElements.length) {
            const targetSpan = lineElements[targetLine] as HTMLElement
            targetSpan.scrollIntoView({ block: 'center', behavior: 'smooth' })
            // Highlight the line range
            const endLine = (sourceRef.lineEnd ?? sourceRef.lineStart!) - 1
            for (let i = targetLine; i <= endLine && i < lineElements.length; i++) {
              const span = lineElements[i] as HTMLElement
              span.classList.add('go-to-line-highlight')
              setTimeout(() => span.classList.remove('go-to-line-highlight'), 2000)
            }
          }
        }, 350) // Wait for panToSession animation (300ms) + buffer
      }
    },
    [sourceRef]
  )

  const label = sourceRef.filePath
    ? formatSourceLabel(sourceRef.filePath, sourceRef.lineStart, sourceRef.lineEnd)
    : 'Source'

  // Check if source session still exists
  const sourceExists = sessionStore.getState().sessions.has(sourceRef.sourceSessionId)
  if (!sourceExists) return null

  return (
    <a
      className="note-source-link"
      href="#"
      onClick={handleClick}
      title={`Go to ${label}`}
    >
      {label}
    </a>
  )
}
