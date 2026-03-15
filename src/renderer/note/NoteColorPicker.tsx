import { useState, useCallback, useRef, useEffect } from 'react'

export const NOTE_PRESETS: Record<string, { bg: string; border: string; dot: string }> = {
  yellow: { bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.25)', dot: '#fbbf24' },
  pink: { bg: 'rgba(244, 114, 182, 0.08)', border: 'rgba(244, 114, 182, 0.25)', dot: '#f472b6' },
  blue: { bg: 'rgba(96, 165, 250, 0.08)', border: 'rgba(96, 165, 250, 0.25)', dot: '#60a5fa' },
  green: { bg: 'rgba(74, 222, 128, 0.08)', border: 'rgba(74, 222, 128, 0.25)', dot: '#4ade80' },
  purple: { bg: 'rgba(167, 139, 250, 0.08)', border: 'rgba(167, 139, 250, 0.25)', dot: '#a78bfa' },
}

/** Derive bg/border/dot colors from an arbitrary hex color */
export function colorsFromHex(hex: string): { bg: string; border: string; dot: string } {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.08)`,
    border: `rgba(${r}, ${g}, ${b}, 0.25)`,
    dot: hex,
  }
}

/** Resolve a color value (preset name or hex) to bg/border/dot */
export function resolveNoteColors(color: string): { bg: string; border: string; dot: string } {
  if (NOTE_PRESETS[color]) return NOTE_PRESETS[color]
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return colorsFromHex(color)
  return NOTE_PRESETS.yellow
}

/** Compute appropriate text color for a given note color */
export function noteTextColor(color: string): string | undefined {
  // For preset colors, always use default (light text on dark theme)
  if (NOTE_PRESETS[color] || !color.startsWith('#')) return undefined
  // For custom hex colors with very bright values, use dark text
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  // Relative luminance (sRGB)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  // Since bg is only 8% opacity over a dark theme, text stays light unless
  // we had a solid background. With 8% overlay, light text is always readable.
  // So we only return undefined (use default).
  // However, if someone sets a very bright custom color, the 8% tint is subtle
  // enough that the default light text will always work.
  return undefined
}

/** Convert a preset name to its hex for the native color input */
function presetToHex(color: string): string {
  if (NOTE_PRESETS[color]) return NOTE_PRESETS[color].dot
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color
  return '#fbbf24'
}

interface NoteColorPickerProps {
  color: string
  onChange: (color: string) => void
}

export default function NoteColorPicker({ color, onChange }: NoteColorPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const colors = resolveNoteColors(color)

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen((v) => !v)
  }, [])

  const handlePresetClick = useCallback(
    (presetKey: string) => (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange(presetKey)
      setOpen(false)
    },
    [onChange]
  )

  const handleCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    },
    [onChange]
  )

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [open])

  const isCustom = !NOTE_PRESETS[color]

  return (
    <div className="note-color-picker-wrapper">
      <button
        ref={btnRef}
        className="note-color-btn"
        style={{ background: colors.dot }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleToggle}
        title="Change color"
      />
      {open && (
        <div
          ref={popoverRef}
          className="note-color-popover"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="note-color-presets">
            {Object.entries(NOTE_PRESETS).map(([key, val]) => (
              <button
                key={key}
                className={`note-color-preset${color === key ? ' active' : ''}`}
                style={{ background: val.dot }}
                onClick={handlePresetClick(key)}
                title={key}
              />
            ))}
          </div>
          <div className="note-color-custom">
            <label className="note-color-custom-label">
              Custom
              <input
                type="color"
                className="note-color-input"
                value={presetToHex(color)}
                onChange={handleCustomChange}
              />
            </label>
            {isCustom && (
              <span className="note-color-hex">{color}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
