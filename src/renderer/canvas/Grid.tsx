import React from 'react'

interface GridProps {
  zoom: number
  gridSize: number
}

const Grid: React.FC<GridProps> = React.memo(({ zoom, gridSize }) => {
  if (zoom < 0.3) return null

  const opacity = Math.min(1, (zoom - 0.3) * 2)
  // Make the SVG large enough to cover a very large canvas area
  const svgSize = 10000

  return (
    <svg
      width={svgSize}
      height={svgSize}
      style={{
        position: 'absolute',
        top: -svgSize / 2,
        left: -svgSize / 2,
        opacity,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <pattern
          id="grid-pattern"
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
    </svg>
  )
})

Grid.displayName = 'Grid'

export default Grid
