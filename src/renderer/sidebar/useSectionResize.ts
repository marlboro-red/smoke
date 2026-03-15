import { useCallback, useRef } from 'react'
import { preferencesStore } from '../stores/preferencesStore'
import type { SidebarSectionSizes } from '../../preload/types'

type SectionKey = keyof SidebarSectionSizes

/**
 * Hook for resizing sidebar sections by dragging dividers.
 * Returns a mousedown handler to attach to divider elements.
 *
 * When the user drags a divider between two sections, the section above
 * grows/shrinks and the section below does the inverse.
 * On mouse-up, the new sizes are persisted to config.
 */
export function useSectionResize(
  sectionRefs: Record<SectionKey, React.RefObject<HTMLDivElement | null>>,
  onSizesChange: (sizes: SidebarSectionSizes) => void
) {
  const draggingRef = useRef(false)

  const handleDividerMouseDown = useCallback(
    (
      e: React.MouseEvent,
      aboveKey: 'sessions' | SectionKey,
      belowKey: SectionKey
    ) => {
      e.preventDefault()
      draggingRef.current = true

      const startY = e.clientY
      const aboveEl = aboveKey === 'sessions'
        ? (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement
        : sectionRefs[aboveKey as SectionKey]?.current
      const belowEl = sectionRefs[belowKey]?.current

      if (!aboveEl || !belowEl) return

      const startAboveHeight = aboveEl.getBoundingClientRect().height
      const startBelowHeight = belowEl.getBoundingClientRect().height

      const MIN_HEIGHT = 40

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return
        const dy = moveEvent.clientY - startY

        let newAboveHeight = startAboveHeight + dy
        let newBelowHeight = startBelowHeight - dy

        // Enforce minimums
        if (newAboveHeight < MIN_HEIGHT) {
          newAboveHeight = MIN_HEIGHT
          newBelowHeight = startAboveHeight + startBelowHeight - MIN_HEIGHT
        }
        if (newBelowHeight < MIN_HEIGHT) {
          newBelowHeight = MIN_HEIGHT
          newAboveHeight = startAboveHeight + startBelowHeight - MIN_HEIGHT
        }

        if (aboveKey !== 'sessions') {
          aboveEl.style.height = `${newAboveHeight}px`
          aboveEl.style.flex = 'none'
        } else {
          // Session list: adjust its flex basis
          aboveEl.style.flex = `0 0 ${newAboveHeight}px`
        }
        belowEl.style.height = `${newBelowHeight}px`
        belowEl.style.flex = 'none'
      }

      const handleMouseUp = () => {
        draggingRef.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        // Collect final sizes and persist
        const sizes: SidebarSectionSizes = {}
        for (const key of ['fileTree', 'layouts', 'recordings'] as SectionKey[]) {
          const el = sectionRefs[key]?.current
          if (el) {
            sizes[key] = Math.round(el.getBoundingClientRect().height)
          }
        }
        onSizesChange(sizes)
      }

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [sectionRefs, onSizesChange]
  )

  return { handleDividerMouseDown }
}
