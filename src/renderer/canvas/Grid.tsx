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
  // Align the SVG offset to a gridSize multiple so dot positions
  // coincide with snap positions (multiples of gridSize) in canvas space.
  const offset = Math.ceil(svgSize / 2 / gridSize) * gridSize

  return (
    <svg
      width={svgSize}
      height={svgSize}
      style={{
        position: 'absolute',
        top: -offset,
        left: -offset,
        opacity,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <pattern
          id="grid-pattern"
          x={-gridSize / 2}
          y={-gridSize / 2}
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={0}
            cy={0}
            r="0.8"
            fill="rgba(255,255,255,0.12)"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
    </svg>
  )
})

Grid.displayName = 'Grid'

export default Grid
