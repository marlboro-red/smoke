import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  message: string
  severity: ToastSeverity
  createdAt: number
  /** Auto-dismiss duration in ms. 0 = manual dismiss only. */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, severity?: ToastSeverity, duration?: number) => string
  dismissToast: (id: string) => void
}

let nextId = 0

const DEFAULT_DURATIONS: Record<ToastSeverity, number> = {
  info: 4000,
  success: 3000,
  warning: 5000,
  error: 6000,
}

export const toastStore = createStore<ToastState>((set) => ({
  toasts: [],

  addToast: (message, severity = 'info', duration?): string => {
    const id = `toast-${++nextId}`
    const toast: Toast = {
      id,
      message,
      severity,
      createdAt: Date.now(),
      duration: duration ?? DEFAULT_DURATIONS[severity],
    }
    set((state) => ({ toasts: [...state.toasts, toast] }))
    return id
  },

  dismissToast: (id): void => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))

// Selector hooks
export function useToasts(): Toast[] {
  return useStore(toastStore, (s) => s.toasts)
}

// Convenience functions for non-React code
export const addToast = (message: string, severity?: ToastSeverity, duration?: number): string =>
  toastStore.getState().addToast(message, severity, duration)

export const dismissToast = (id: string): void =>
  toastStore.getState().dismissToast(id)
