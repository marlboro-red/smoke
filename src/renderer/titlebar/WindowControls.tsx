import { useState, useEffect, useCallback } from 'react'
import '../styles/titlebar.css'

export default function WindowControls(): JSX.Element | null {
  const platform = window.smokeAPI?.window?.platform
  const [maximized, setMaximized] = useState(false)

  // Only render on Windows/Linux where we have no native controls
  if (platform === 'darwin') return null

  useEffect(() => {
    window.smokeAPI?.window.isMaximized().then(setMaximized)
  }, [])

  const handleMinimize = useCallback(() => {
    window.smokeAPI?.window.minimize()
  }, [])

  const handleMaximize = useCallback(async () => {
    await window.smokeAPI?.window.maximize()
    const isMax = await window.smokeAPI?.window.isMaximized()
    setMaximized(isMax)
  }, [])

  const handleClose = useCallback(() => {
    window.smokeAPI?.window.close()
  }, [])

  return (
    <div className="window-controls">
      <button
        className="window-control-btn window-control-minimize"
        onClick={handleMinimize}
        title="Minimize"
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect fill="currentColor" width="10" height="1" />
        </svg>
      </button>
      <button
        className="window-control-btn window-control-maximize"
        onClick={handleMaximize}
        title={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              d="M 3,1 h 6 v 6 h -1 M 1,3 h 6 v 6 h -6 z"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              x="0.5"
              y="0.5"
              width="9"
              height="9"
            />
          </svg>
        )}
      </button>
      <button
        className="window-control-btn window-control-close"
        onClick={handleClose}
        title="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            d="M 1,1 L 9,9 M 9,1 L 1,9"
          />
        </svg>
      </button>
    </div>
  )
}
