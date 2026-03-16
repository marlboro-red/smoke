import { useState, useEffect, useCallback, useRef } from 'react'
import {
  type ShortcutAction,
  type ShortcutBinding,
  ACTION_LABELS,
  SHORTCUT_GROUPS,
  DEFAULT_BINDINGS,
  isMac,
  useShortcutBindings,
  shortcutBindingsStore,
  setShortcutCapturing,
  formatBindingParts,
  findConflict,
  findSystemConflict,
} from '../shortcuts/shortcutMap'
import { preferencesStore, usePreferencesStore } from '../stores/preferencesStore'
import '../styles/shortcut-settings.css'

function KeyBadge({ label }: { label: string }): JSX.Element {
  return <kbd className="shortcut-key">{label}</kbd>
}

function BindingDisplay({ binding }: { binding: ShortcutBinding | null }): JSX.Element {
  if (!binding) {
    return <span className="sc-binding-unset">Not set</span>
  }
  const parts = formatBindingParts(binding)
  return (
    <span className="sc-binding-keys">
      {parts.map((part, i) => (
        <KeyBadge key={i} label={part} />
      ))}
    </span>
  )
}

interface ShortcutRowProps {
  action: ShortcutAction
  binding: ShortcutBinding | null
  isCapturing: boolean
  onStartCapture: () => void
  onCancelCapture: () => void
  onBindingCaptured: (binding: ShortcutBinding) => void
}

function ShortcutRow({
  action,
  binding,
  isCapturing,
  onStartCapture,
  onCancelCapture,
  onBindingCaptured,
}: ShortcutRowProps): JSX.Element {
  const captureRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isCapturing) return

    setShortcutCapturing(true)

    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      // Ignore modifier-only presses
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return

      // Escape cancels capture
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey) {
        onCancelCapture()
        return
      }

      const mod = isMac ? e.metaKey : e.ctrlKey
      const newBinding: ShortcutBinding = {
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        mod,
        shift: e.shiftKey,
        alt: e.altKey,
      }

      onBindingCaptured(newBinding)
    }

    // Use capture phase to intercept before anything else
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      setShortcutCapturing(false)
      document.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [isCapturing, onCancelCapture, onBindingCaptured])

  const isDefault =
    binding !== null &&
    binding.key === DEFAULT_BINDINGS[action].key &&
    binding.mod === DEFAULT_BINDINGS[action].mod &&
    binding.shift === DEFAULT_BINDINGS[action].shift &&
    binding.alt === DEFAULT_BINDINGS[action].alt

  return (
    <div className={`sc-row ${isCapturing ? 'sc-row-capturing' : ''}`}>
      <span className="sc-action-label">{ACTION_LABELS[action]}</span>
      <div className="sc-binding-cell">
        {isCapturing ? (
          <button
            ref={captureRef}
            className="sc-capture-btn"
            onClick={onCancelCapture}
          >
            Press keys...
          </button>
        ) : (
          <button
            className="sc-edit-btn"
            onClick={onStartCapture}
            title="Click to change shortcut"
          >
            <BindingDisplay binding={binding} />
          </button>
        )}
        {!isCapturing && !isDefault && (
          <button
            className="sc-reset-single-btn"
            onClick={() => onBindingCaptured(DEFAULT_BINDINGS[action])}
            title="Reset to default"
          >
            ↺
          </button>
        )}
      </div>
    </div>
  )
}

export default function ShortcutSettings(): JSX.Element {
  const bindings = useShortcutBindings()
  const [capturingAction, setCapturingAction] = useState<ShortcutAction | null>(null)
  const [conflictInfo, setConflictInfo] = useState<{
    action: ShortcutAction
    conflictsWith: ShortcutAction
    binding: ShortcutBinding
  } | null>(null)
  const [systemConflict, setSystemConflict] = useState<{
    action: ShortcutAction
    systemLabel: string
  } | null>(null)

  const saveBinding = useCallback(
    async (action: ShortcutAction, binding: ShortcutBinding | null) => {
      const custom = shortcutBindingsStore.getState().updateBinding(action, binding)
      preferencesStore.getState().updatePreference('customShortcuts', custom)
      await window.smokeAPI?.config.set('customShortcuts', custom)
    },
    []
  )

  const handleBindingCaptured = useCallback(
    (action: ShortcutAction, binding: ShortcutBinding) => {
      // Check system shortcut conflicts first (cannot be overridden)
      const sysLabel = findSystemConflict(binding)
      if (sysLabel) {
        setSystemConflict({ action, systemLabel: sysLabel })
        setConflictInfo(null)
        setCapturingAction(null)
        return
      }

      const conflict = findConflict(binding, action)
      if (conflict) {
        setConflictInfo({ action, conflictsWith: conflict, binding })
        setSystemConflict(null)
        setCapturingAction(null)
        return
      }
      setCapturingAction(null)
      setConflictInfo(null)
      setSystemConflict(null)
      saveBinding(action, binding)
    },
    [saveBinding]
  )

  const handleResolveConflict = useCallback(
    (replace: boolean) => {
      if (!conflictInfo) return
      if (replace) {
        // Unbind the conflicting action, then assign the new binding
        saveBinding(conflictInfo.conflictsWith, null)
        saveBinding(conflictInfo.action, conflictInfo.binding)
      }
      setConflictInfo(null)
    },
    [conflictInfo, saveBinding]
  )

  const handleResetAll = useCallback(async () => {
    shortcutBindingsStore.getState().resetToDefaults()
    preferencesStore.getState().updatePreference('customShortcuts', {})
    await window.smokeAPI?.config.set('customShortcuts', {})
    setConflictInfo(null)
    setSystemConflict(null)
    setCapturingAction(null)
  }, [])

  const startupWarnings = usePreferencesStore((s) => s.shortcutWarnings)

  // Check if any bindings differ from defaults
  const hasCustomBindings = Object.entries(bindings).some(([action, binding]) => {
    const def = DEFAULT_BINDINGS[action as ShortcutAction]
    return binding === null || binding.key !== def.key || binding.mod !== def.mod || binding.shift !== def.shift || binding.alt !== def.alt
  })

  return (
    <div className="sc-container">
      {startupWarnings.length > 0 && (
        <div className="sc-startup-warnings">
          {startupWarnings.map((w, i) => (
            <div key={i} className={`sc-conflict-banner ${w.type === 'system' ? 'sc-system-conflict' : ''}`}>
              <span className="sc-conflict-text">{w.detail}</span>
            </div>
          ))}
        </div>
      )}

      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title} className="sc-group">
          <h4 className="sc-group-title">{group.title}</h4>
          {group.actions.map((action) => (
            <ShortcutRow
              key={action}
              action={action}
              binding={bindings[action]}
              isCapturing={capturingAction === action}
              onStartCapture={() => {
                setCapturingAction(action)
                setConflictInfo(null)
                setSystemConflict(null)
              }}
              onCancelCapture={() => setCapturingAction(null)}
              onBindingCaptured={(b) => handleBindingCaptured(action, b)}
            />
          ))}
        </div>
      ))}

      {systemConflict && (
        <div className="sc-conflict-banner sc-system-conflict">
          <span className="sc-conflict-text">
            Cannot override system shortcut <strong>{systemConflict.systemLabel}</strong>
          </span>
          <div className="sc-conflict-actions">
            <button className="sc-conflict-btn sc-conflict-cancel" onClick={() => setSystemConflict(null)}>
              OK
            </button>
          </div>
        </div>
      )}

      {conflictInfo && (
        <div className="sc-conflict-banner">
          <span className="sc-conflict-text">
            Conflicts with <strong>{ACTION_LABELS[conflictInfo.conflictsWith]}</strong>
          </span>
          <div className="sc-conflict-actions">
            <button className="sc-conflict-btn sc-conflict-replace" onClick={() => handleResolveConflict(true)}>
              Reassign
            </button>
            <button className="sc-conflict-btn sc-conflict-cancel" onClick={() => handleResolveConflict(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="sc-footer">
        <button
          className="sc-reset-all-btn"
          onClick={handleResetAll}
          disabled={!hasCustomBindings}
        >
          Reset All to Defaults
        </button>
      </div>
    </div>
  )
}
