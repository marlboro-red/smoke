import { useEffect, useRef, useCallback } from 'react'
import { shortcutsOverlayStore, useShortcutsOverlayOpen } from './shortcutsOverlayStore'
import {
  isMac,
  ACTION_LABELS,
  SHORTCUT_GROUPS,
  formatBindingParts,
  useShortcutBindings,
  type ShortcutBinding,
} from './shortcutMap'
import '../styles/shortcuts-overlay.css'

function KeyBadge({ label }: { label: string }): JSX.Element {
  return <kbd className="shortcut-key">{label}</kbd>
}

function ShortcutKeys({ binding }: { binding: ShortcutBinding | null }): JSX.Element {
  if (!binding) {
    return <span className="shortcut-keys shortcut-unset">Not set</span>
  }
  const parts = formatBindingParts(binding)
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
  const bindings = useShortcutBindings()

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
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.title} className="shortcuts-section">
                <h3 className="shortcuts-section-title">{group.title}</h3>
                <ul className="shortcuts-list">
                  {group.actions.map((action) => (
                    <li key={action} className="shortcuts-row">
                      <ShortcutKeys binding={bindings[action]} />
                      <span className="shortcuts-desc">{ACTION_LABELS[action]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section className="shortcuts-section">
              <h3 className="shortcuts-section-title">Other</h3>
              <ul className="shortcuts-list">
                <li className="shortcuts-row">
                  <span className="shortcut-keys">
                    <KeyBadge label="Esc" />
                  </span>
                  <span className="shortcuts-desc">Unfocus Session</span>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <div className="shortcuts-footer">
          <span className="shortcuts-hint">Press Esc or {MOD}/ to close</span>
        </div>
      </div>
    </div>
  )
}
