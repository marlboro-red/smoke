import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import type { PluginError } from './pluginTypes'

interface Props {
  pluginId: string
  onError: (error: PluginError) => void
  fallback?: ReactNode
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * React error boundary that catches render-time crashes in plugin components.
 * When a plugin throws during render, this boundary catches it, reports it
 * via onError, and renders a fallback UI instead of letting the error
 * propagate up and crash the entire app.
 */
export default class PluginErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError({
      message: error.message,
      stack: errorInfo.componentStack ?? error.stack,
      phase: 'render',
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="plugin-error-fallback">
          <div className="plugin-error-icon">!</div>
          <div className="plugin-error-title">Plugin crashed</div>
          <div className="plugin-error-message">
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <button
            className="plugin-error-retry"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
