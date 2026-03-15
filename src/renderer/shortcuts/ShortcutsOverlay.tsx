import { useEffect, useRef, useCallback } from 'react'
import { shortcutsOverlayStore, useShortcutsOverlayOpen } from './shortcutsOverlayStore'
import { isMac } from './shortcutMap'
import '../styles/shortcuts-overlay.css'

const MOD = isMac ? '\u2318' : 'Ctrl'

interface ShortcutEntry {
  keys: string
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ShortcutEntry[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Session Management',
    shortcuts: [
      { keys: `${MOD} N`, description: 'New session' },
      { keys: `${MOD} W`, description: 'Close session' },
      { keys: `${MOD} Tab`, description: 'Next session' },
      { keys: `${MOD} Shift Tab`, description: 'Previous session' },
      { keys: `${MOD} 1–9`, description: 'Focus session by index' },
    ],
  },
  {
    title: 'Canvas',
    shortcuts: [
      { keys: `${MOD} =`, description: 'Zoom in' },
      { keys: `${MOD} -`, description: 'Zoom out' },
      { keys: `${MOD} 0`, description: 'Reset zoom' },
      { keys: `${MOD} Shift A`, description: 'Auto layout' },
    ],
  },
  {
    title: 'Groups',
    shortcuts: [
      { keys: `${MOD} Shift G`, description: 'Toggle group collapse' },
      { keys: `${MOD} Shift B`, description: 'Toggle broadcast' },
    ],
  },
  {
    title: 'Layout & Settings',
    shortcuts: [
      { keys: `${MOD} S`, description: 'Save layout' },
      { keys: `${MOD} ,`, description: 'Open settings' },
    ],
  },
  {
    title: 'AI & Tools',
    shortcuts: [
      { keys: `${MOD} L`, description: 'Toggle AI panel' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: `${MOD} /`, description: 'Show this help' },
      { keys: 'Esc', description: 'Unfocus session' },
    ],
  },
]

function KeyBadge({ label }: { label: string }): JSX.Element {
  return <kbd className="shortcut-key">{label}</kbd>
}

function ShortcutKeys({ keys }: { keys: string }): JSX.Element {
  const parts = keys.split(' ')
  return (
    <span className="shortcut-keys">
      {parts.map((part, i) => (
        <KeyBadge key={i} label={part} />
      ))}
    </span>
  )
}

export default function ShortcutsOverlay(): JSX.Element | null {
  const isOpen = useShortcutsOverlayOpen()
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        shortcutsOverlayStore.getState().close()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [isOpen])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      shortcutsOverlayStore.getState().close()
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="shortcuts-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="shortcuts-modal">
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">Keyboard Shortcuts</h2>
          <button
            className="shortcuts-close-btn"
            onClick={() => shortcutsOverlayStore.getState().close()}
            aria-label="Close shortcuts help"
          >
            &times;
          </button>
        </div>

        <div className="shortcuts-body">
          <div className="shortcuts-grid">
            {shortcutGroups.map((group) => (
              <section key={group.title} className="shortcuts-section">
                <h3 className="shortcuts-section-title">{group.title}</h3>
                <ul className="shortcuts-list">
                  {group.shortcuts.map((shortcut) => (
                    <li key={shortcut.description} className="shortcuts-row">
                      <ShortcutKeys keys={shortcut.keys} />
                      <span className="shortcuts-desc">{shortcut.description}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="shortcuts-footer">
          <span className="shortcuts-hint">Press Esc or {MOD}/ to close</span>
        </div>
      </div>
    </div>
  )
}
