import { useState, useEffect, useCallback } from 'react'
import type { Preferences } from '../../preload/types'
import { preferencesStore, usePreferences } from '../stores/preferencesStore'
import { gridStore } from '../stores/gridStore'
import { canvasStore } from '../stores/canvasStore'
import { applyTerminalOpacity, applyFontSettings } from '../themes/applyTheme'
import '../styles/config.css'

export default function ConfigPanel(): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const prefs = usePreferences()

  useEffect(() => {
    if (expanded && !preferencesStore.getState().loaded) {
      window.smokeAPI?.config.get().then((p) => {
        if (p) preferencesStore.getState().setPreferences(p)
      })
    }
  }, [expanded])

  const updatePref = useCallback(
    async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      preferencesStore.getState().updatePreference(key, value)
      await window.smokeAPI?.config.set(key, value)

      // Apply grid size change immediately
      if (key === 'gridSize') {
        const size = value as number
        gridStore.getState().setGridSize(size)
        canvasStore.getState().setGridSize(size)
      }

      // Apply terminal opacity change immediately
      if (key === 'terminalOpacity') {
        applyTerminalOpacity(value as number)
      }

      // Apply font changes immediately
      if (key === 'fontFamily' || key === 'fontSize' || key === 'lineHeight') {
        const p = preferencesStore.getState().preferences
        applyFontSettings(p.fontFamily, p.fontSize, p.lineHeight)
      }
    },
    []
  )

  return (
    <div className="config-panel">
      <button
        className="config-toggle-btn"
        onClick={() => setExpanded(!expanded)}
      >
        Settings {expanded ? '\u25B4' : '\u25BE'}
      </button>
      {expanded && (
        <div className="config-panel-content">
          <div className="config-group">
            <label className="config-label">Default Shell</label>
            <input
              className="config-input"
              type="text"
              placeholder="System default"
              value={prefs.defaultShell}
              onChange={(e) => updatePref('defaultShell', e.target.value)}
            />
          </div>

          <div className="config-group">
            <label className="config-label">Startup Command</label>
            <input
              className="config-input"
              type="text"
              placeholder="e.g. source .env && npm run dev"
              value={prefs.startupCommand}
              onChange={(e) => updatePref('startupCommand', e.target.value)}
            />
            <span className="config-hint">Runs automatically when a new terminal starts</span>
          </div>

          <div className="config-group">
            <label className="config-label config-toggle-row">
              <span>Auto-Launch Claude</span>
              <input
                type="checkbox"
                checked={prefs.autoLaunchClaude}
                onChange={(e) => updatePref('autoLaunchClaude', e.target.checked)}
              />
            </label>
            {prefs.autoLaunchClaude && (
              <input
                className="config-input"
                type="text"
                placeholder="claude"
                value={prefs.claudeCommand}
                onChange={(e) => updatePref('claudeCommand', e.target.value)}
              />
            )}
          </div>

          <div className="config-group">
            <label className="config-label">
              Grid Size: {prefs.gridSize}px
            </label>
            <input
              className="config-slider"
              type="range"
              min={10}
              max={50}
              value={prefs.gridSize}
              onChange={(e) => updatePref('gridSize', Number(e.target.value))}
            />
          </div>

          <div className="config-group">
            <label className="config-label">
              Window Opacity: {Math.round((prefs.terminalOpacity ?? 1) * 100)}%
            </label>
            <input
              className="config-slider"
              type="range"
              min={10}
              max={100}
              value={Math.round((prefs.terminalOpacity ?? 1) * 100)}
              onChange={(e) => updatePref('terminalOpacity', Number(e.target.value) / 100)}
            />
          </div>

          <div className="config-group">
            <label className="config-label">Font Family</label>
            <input
              className="config-input"
              type="text"
              placeholder='"Berkeley Mono", Menlo, monospace'
              value={prefs.fontFamily}
              onChange={(e) => updatePref('fontFamily', e.target.value)}
            />
          </div>

          <div className="config-group">
            <label className="config-label">
              Font Size: {prefs.fontSize}px
            </label>
            <input
              className="config-slider"
              type="range"
              min={8}
              max={24}
              value={prefs.fontSize}
              onChange={(e) => updatePref('fontSize', Number(e.target.value))}
            />
          </div>

          <div className="config-group">
            <label className="config-label">
              Line Height: {prefs.lineHeight}
            </label>
            <input
              className="config-slider"
              type="range"
              min={1.0}
              max={2.0}
              step={0.1}
              value={prefs.lineHeight}
              onChange={(e) => updatePref('lineHeight', Number(e.target.value))}
            />
          </div>

          <div className="config-group">
            <label className="config-label">Sidebar Position</label>
            <div className="config-toggle-group">
              <button
                className={`config-option-btn ${prefs.sidebarPosition === 'left' ? 'active' : ''}`}
                onClick={() => updatePref('sidebarPosition', 'left')}
              >
                Left
              </button>
              <button
                className={`config-option-btn ${prefs.sidebarPosition === 'right' ? 'active' : ''}`}
                onClick={() => updatePref('sidebarPosition', 'right')}
              >
                Right
              </button>
            </div>
          </div>

          <div className="config-group">
            <label className="config-label">Default Working Directory</label>
            <input
              className="config-input"
              type="text"
              placeholder="App's current directory"
              value={prefs.defaultCwd}
              onChange={(e) => updatePref('defaultCwd', e.target.value)}
            />
          </div>

        </div>
      )}
    </div>
  )
}
