import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  name: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Generic React error boundary for core UI subtrees (Canvas, Sidebar, etc.).
 * Catches render errors and shows a recoverable fallback instead of crashing
 * the entire app.
 */
export default class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[ComponentErrorBoundary] ${this.props.name} crashed:`,
      error,
      errorInfo.componentStack,
    )
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="component-error-fallback">
          <div className="component-error-icon">!</div>
          <div className="component-error-title">
            {this.props.name} crashed
          </div>
          <div className="component-error-message">
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <button
            className="component-error-retry"
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
