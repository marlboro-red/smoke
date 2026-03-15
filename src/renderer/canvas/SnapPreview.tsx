import { useSnapPreview } from '../stores/snapPreviewStore'

export default function SnapPreview(): JSX.Element | null {
  const visible = useSnapPreview((s) => s.visible)
  const x = useSnapPreview((s) => s.x)
  const y = useSnapPreview((s) => s.y)
  const width = useSnapPreview((s) => s.width)
  const height = useSnapPreview((s) => s.height)

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
