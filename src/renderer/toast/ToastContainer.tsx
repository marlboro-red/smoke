import { useEffect, useRef, useCallback } from 'react'
import { useToasts, toastStore, type ToastSeverity } from '../stores/toastStore'
import '../styles/toast.css'

const SEVERITY_ICONS: Record<ToastSeverity, string> = {
  info: '\u2139\uFE0F',
  success: '\u2714',
  warning: '\u26A0',
  error: '\u2718',
}

export default function ToastContainer(): JSX.Element {
  const toasts = useToasts()
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const exitingRef = useRef<Set<string>>(new Set())

  const dismiss = useCallback((id: string) => {
    // Clear any existing timer
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }

    // Trigger exit animation
    exitingRef.current.add(id)
    // Force re-render to apply exit class
    toastStore.getState().dismissToast(id)
  }, [])

  // Set up auto-dismiss timers
  useEffect(() => {
    for (const toast of toasts) {
      if (toast.duration > 0 && !timersRef.current.has(toast.id) && !exitingRef.current.has(toast.id)) {
        const timer = setTimeout(() => {
          timersRef.current.delete(toast.id)
          dismiss(toast.id)
        }, toast.duration)
        timersRef.current.set(toast.id, timer)
      }
    }

    // Cleanup timers for removed toasts
    const currentIds = new Set(toasts.map((t) => t.id))
    for (const [id, timer] of timersRef.current) {
      if (!currentIds.has(id)) {
        clearTimeout(timer)
        timersRef.current.delete(id)
      }
    }
  }, [toasts, dismiss])

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  if (toasts.length === 0) return <></>

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.severity}`}>
          <span className="toast-icon">{SEVERITY_ICONS[toast.severity]}</span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-dismiss" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
