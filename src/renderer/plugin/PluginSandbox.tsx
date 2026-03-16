import { useRef, useEffect, useState, useCallback } from 'react'
import type { PluginManifest, PluginError, PluginSandboxState } from './pluginTypes'
import { createHostBridge, buildSandboxHtml } from './pluginBridge'
import type { HostBridge } from './pluginBridge'
import PluginErrorBoundary from './PluginErrorBoundary'

interface PluginSandboxProps {
  /** Session ID for this plugin instance */
  sessionId: string
  /** The plugin's manifest */
  manifest: PluginManifest
  /** The plugin's JavaScript source code */
  source: string
  /** Current container dimensions */
  width: number
  height: number
  /** Called when the plugin requests a title change */
  onTitleChange?: (title: string) => void
  /** Called when the plugin requests a resize */
  onResizeRequest?: (width: number, height: number) => void
  /** Called when the plugin reports an error */
  onError?: (error: PluginError) => void
  /** Called when the plugin sends a custom message */
  onPluginMessage?: (type: string, payload: unknown) => void
}

/**
 * PluginSandbox renders a plugin inside a sandboxed iframe with strict isolation.
 *
 * Isolation guarantees:
 * - The iframe uses `sandbox="allow-scripts"` — no access to parent DOM,
 *   no form submission, no popups, no top-level navigation, no same-origin access.
 * - Content is loaded via srcdoc (no network request for the frame itself).
 * - CSP restricts the iframe to inline scripts/styles only — no external loads.
 * - All communication goes through postMessage with a structured protocol.
 * - The iframe cannot access `window.smokeAPI`, Electron APIs, or Node.js.
 *
 * A React ErrorBoundary wraps the entire component so that even if the host-side
 * bridge code throws, the app remains stable.
 */
export default function PluginSandbox({
  sessionId,
  manifest,
  source,
  width,
  height,
  onTitleChange,
  onResizeRequest,
  onError,
  onPluginMessage,
}: PluginSandboxProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const bridgeRef = useRef<HostBridge | null>(null)
  const [state, setState] = useState<PluginSandboxState>('loading')
  const [error, setError] = useState<PluginError | null>(null)

  const handleError = useCallback(
    (err: PluginError) => {
      setError(err)
      setState('error')
      onError?.(err)
    },
    [onError]
  )

  // Set up iframe and bridge
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    // Build and inject the sandboxed HTML
    const html = buildSandboxHtml(source)
    iframe.srcdoc = html

    const bridge = createHostBridge(iframe, sessionId)
    bridgeRef.current = bridge

    // Handle messages from the plugin
    const unsubMessage = bridge.onMessage((type, payload) => {
      switch (type) {
        case '__ready':
          setState('ready')
          break
        case '__error': {
          const err = payload as { message: string; stack?: string; phase?: string }
          handleError({
            message: err.message,
            stack: err.stack,
            phase: (err.phase as PluginError['phase']) ?? 'runtime',
          })
          break
        }
        case '__setTitle': {
          const p = payload as { title: string }
          onTitleChange?.(p.title)
          break
        }
        case '__requestResize': {
          const p = payload as { width: number; height: number }
          onResizeRequest?.(p.width, p.height)
          break
        }
        default:
          // Forward plugin: prefixed messages to the host handler
          if (type.startsWith('plugin:')) {
            onPluginMessage?.(type.slice(7), payload)
          }
          break
      }
    })

    // Initialize the plugin once the iframe loads
    const handleLoad = (): void => {
      bridge.initialize(manifest, { width, height })
    }
    iframe.addEventListener('load', handleLoad)

    // Timeout — if plugin doesn't report ready within 10s, mark as error
    const timeout = setTimeout(() => {
      if (state === 'loading') {
        handleError({
          message: 'Plugin timed out during initialization',
          phase: 'load',
        })
      }
    }, 10_000)

    return () => {
      clearTimeout(timeout)
      iframe.removeEventListener('load', handleLoad)
      unsubMessage()
      bridge.destroy()
      bridgeRef.current = null
    }
    // Only re-run when sessionId or source changes — not on every resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, source, manifest.id])

  // Forward resize events to the plugin
  useEffect(() => {
    bridgeRef.current?.resize(width, height)
  }, [width, height])

  const handleBoundaryError = useCallback(
    (err: PluginError) => {
      setState('crashed')
      onError?.(err)
    },
    [onError]
  )

  return (
    <PluginErrorBoundary
      pluginId={manifest.id}
      onError={handleBoundaryError}
    >
      <div className="plugin-sandbox" data-state={state}>
        {state === 'loading' && (
          <div className="plugin-sandbox-loading">
            <div className="plugin-sandbox-spinner" />
            Loading {manifest.name}...
          </div>
        )}
        {(state === 'error' || state === 'crashed') && error && (
          <div className="plugin-sandbox-error">
            <div className="plugin-error-icon">!</div>
            <div className="plugin-error-title">
              {state === 'crashed' ? 'Plugin crashed' : 'Plugin error'}
            </div>
            <div className="plugin-error-message">{error.message}</div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          className="plugin-sandbox-frame"
          sandbox="allow-scripts"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: state === 'ready' ? 'block' : 'none',
          }}
        />
      </div>
    </PluginErrorBoundary>
  )
}
