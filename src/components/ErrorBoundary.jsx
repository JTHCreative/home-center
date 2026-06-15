import { Component } from 'react'

// Catches render/runtime errors in a page so a single bad screen shows a
// recovery card instead of blanking the whole kiosk. Reset it by changing
// `resetKey` (e.g. on navigation).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    // Peripheral widgets pass an explicit fallback (often null) so their failure
    // degrades quietly instead of taking over the screen.
    if (this.props.fallback !== undefined) return this.props.fallback
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-400">
            This screen hit an error. Try switching to another tab, or reload the app.
          </p>
          {error?.message && (
            <pre className="mt-4 overflow-auto rounded-lg bg-bg p-3 text-left font-mono text-xs text-loss">
              {String(error.message)}
            </pre>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-gray-300 active:scale-95"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg shadow-glow active:scale-95"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
