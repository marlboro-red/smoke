import { useCallback } from 'react'

export type ResizeDirection = 'e' | 's' | 'se'

interface ResizeHandleProps {
  direction: ResizeDirection
  onResizeStart: (e: React.PointerEvent, direction: ResizeDirection) => void
}

const CURSOR_MAP: Record<ResizeDirection, string> = {
  e: 'ew-resize',
  s: 'ns-resize',
  se: 'nwse-resize',
}

const STYLE_MAP: Record<ResizeDirection, React.CSSProperties> = {
  e: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: '100%',
    cursor: CURSOR_MAP.e,
  },
  s: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: 8,
    cursor: CURSOR_MAP.s,
  },
  se: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    cursor: CURSOR_MAP.se,
  },
}

export default function ResizeHandle({
  direction,
  onResizeStart,
}: ResizeHandleProps): JSX.Element {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      onResizeStart(e, direction)
    },
    [direction, onResizeStart]
  )

  return (
    <div
      className={`resize-handle resize-handle-${direction}`}
      style={STYLE_MAP[direction]}
      onPointerDown={handlePointerDown}
    />
  )
}
