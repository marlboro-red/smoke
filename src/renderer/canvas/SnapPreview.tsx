import { useShallow } from 'zustand/react/shallow'
import { useSnapPreview } from '../stores/snapPreviewStore'

export default function SnapPreview(): JSX.Element | null {
  // Single subscription — the store updates on every pointer-move during a
  // drag, and five separate selectors meant five subscription checks per move.
  const { visible, x, y, width, height } = useSnapPreview(
    useShallow((s) => ({
      visible: s.visible,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
    }))
  )

  if (!visible) return null

  return (
    <div
      className="snap-preview"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
      }}
    />
  )
}
