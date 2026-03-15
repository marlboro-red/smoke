import { useEffect, useCallback, useRef } from 'react'
import type { Preferences } from '../../preload/types'
import { preferencesStore, usePreferences } from '../stores/preferencesStore'
import { gridStore } from '../stores/gridStore'
import { canvasStore } from '../stores/canvasStore'
import { settingsModalStore, useSettingsModalOpen } from './settingsStore'
import '../styles/settings-modal.css'

export default function SettingsModal(): JSX.Element | null {
  const isOpen = useSettingsModalOpen()
  const prefs = usePreferences()
  const backdropRef = useRef<HTMLDivElement>(null)

  // Load preferences when opening
  useEffect(() => {
    if (isOpen && !preferencesStore.getState().loaded) {
      window.smokeAPI?.config.get().then((p) => {
        if (p) preferencesStore.getState().setPreferences(p)
      })
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        settingsModalStore.getState().close()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [isOpen])

  const updatePref = useCallback(
    async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      preferencesStore.getState().updatePreference(key, value)
      await window.smokeAPI?.config.set(key, value)

      if (key === 'gridSize') {
        const size = value as number
        gridStore.getState().setGridSize(size)
        canvasStore.getState().setGridSize(size)
      }
    },
    []
  )

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      settingsModalStore.getState().close()
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="settings-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button
            className="settings-close-btn"
            onClick={() => settingsModalStore.getState().close()}
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        <div className="settings-body">
          {/* ── General ── */}
          <section className="settings-section">
            <h3 className="settings-section-title">General</h3>

            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">Default Shell</label>
                <p className="settings-help">
                  The shell program to launch for new terminal sessions. Leave empty to use your system default.
                </p>
              </div>
              <input
                className="settings-input"
                type="text"
                placeholder="System default"
                value={prefs.defaultShell}
                onChange={(e) => updatePref('defaultShell', e.target.value)}
              />
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">Default Working Directory</label>
                <p className="settings-help">
                  The initial directory for new terminal sessions. Leave empty to use the app&apos;s launch directory.
                </p>
              </div>
              <input
                className="settings-input"
                type="text"
                placeholder="App's current directory"
                value={prefs.defaultCwd}
                onChange={(e) => updatePref('defaultCwd', e.target.value)}
              />
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">Sidebar Position</label>
                <p className="settings-help">
                  Place the session sidebar on the left or right side of the window.
                </p>
              </div>
              <div className="settings-toggle-group">
                <button
                  className={`settings-option-btn ${prefs.sidebarPosition === 'left' ? 'active' : ''}`}
                  onClick={() => updatePref('sidebarPosition', 'left')}
                >
                  Left
                </button>
                <button
                  className={`settings-option-btn ${prefs.sidebarPosition === 'right' ? 'active' : ''}`}
                  onClick={() => updatePref('sidebarPosition', 'right')}
                >
                  Right
                </button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">Grid Size: {prefs.gridSize}px</label>
                <p className="settings-help">
                  Controls the snap grid spacing for positioning and resizing terminal windows (10–50px).
                </p>
              </div>
              <input
                className="settings-slider"
                type="range"
                min={10}
                max={50}
                value={prefs.gridSize}
                onChange={(e) => updatePref('gridSize', Number(e.target.value))}
              />
            </div>
          </section>

          {/* ── Claude Integration ── */}
          <section className="settings-section">
            <h3 className="settings-section-title">Claude Integration</h3>

            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">Auto-Launch Claude</label>
                <p className="settings-help">
                  Automatically start a Claude Code session when the app launches.
                </p>
              </div>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={prefs.autoLaunchClaude}
                  onChange={(e) => updatePref('autoLaunchClaude', e.target.checked)}
                />
                <span className="settings-switch-track" />
              </label>
            </div>

            {prefs.autoLaunchClaude && (
              <div className="settings-row">
                <div className="settings-row-info">
                  <label className="settings-label">Claude Command</label>
                  <p className="settings-help">
                    The command used to launch Claude Code (e.g. &quot;claude&quot; or a full path).
                  </p>
                </div>
                <input
                  className="settings-input"
                  type="text"
                  placeholder="claude"
                  value={prefs.claudeCommand}
                  onChange={(e) => updatePref('claudeCommand', e.target.value)}
                />
              </div>
            )}
          </section>

          {/* ── AI API ── */}
          <section className="settings-section">
            <h3 className="settings-section-title">AI API</h3>

            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">Anthropic API Key</label>
                <p className="settings-help">
                  Your Anthropic API key for the built-in AI assistant. Stored locally and never sent to third parties.
                </p>
              </div>
              <input
                className="settings-input"
                type="password"
                placeholder="sk-ant-..."
                value={prefs.aiApiKey}
                onChange={(e) => updatePref('aiApiKey', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <label className="settings-label">Model</label>
                <p className="settings-help">
                  The Claude model to use for AI-powered features.
                </p>
              </div>
              <select
                className="settings-input settings-select"
                value={prefs.aiModel}
                onChange={(e) => updatePref('aiModel', e.target.value)}
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-opus-4-20250514">Claude Opus 4</option>
                <option value="claude-haiku-4-20250506">Claude Haiku 4</option>
              </select>
            </div>
          </section>
        </div>

        <div className="settings-footer">
          <span className="settings-shortcut-hint">Open with &#8984;,</span>
        </div>
      </div>
    </div>
  )
}
