import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(e: Error): State { return { error: e } }
  render() {
    if (this.state.error)
      return (
        <div style={{ padding: 32, maxWidth: 480, margin: '0 auto' }}>
          <div className="card">
            <h2 style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: 'var(--text-1)' }}>
              Terjadi kesalahan
            </h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Muat ulang halaman untuk mencoba lagi.
            </p>
            <button className="btn" onClick={() => window.location.reload()}>
              Muat Ulang
            </button>
          </div>
        </div>
      )
    return this.props.children
  }
}
