import { AlertTriangle } from 'lucide-react'
import { Component, type ReactNode } from 'react'

/** Keeps one broken screen from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-7 flex flex-col gap-3 rounded-card border border-danger bg-danger/10 p-5">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={18} className="text-danger" /> This screen ran into a problem
        </div>
        <pre className="selectable overflow-auto whitespace-pre-wrap font-mono text-xs text-muted">{this.state.error.message}</pre>
        <button type="button" className="self-start rounded-lg border border-line bg-raised px-3 py-2 text-[13px] font-semibold" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}
