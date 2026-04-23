import { Component } from 'react';

/**
 * Top-level error boundary.
 * Any uncaught render error in the tree will be caught here and show
 * a recovery screen instead of a blank/black page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info?.componentStack);
  }

  handleReset = () => {
    // Clear the visual-identity store cache — the most common source of
    // corrupted state that leads to crashes on load.
    try { localStorage.removeItem('kyoyu-vi'); } catch (_) {}
    window.location.reload();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'Unknown error';

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0a0814', color: '#e0d6ff', fontFamily: 'Inter,system-ui,sans-serif',
        gap: 20, padding: 32, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', maxWidth: 420, fontSize: 14 }}>
          {msg}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 22px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.07)', color: '#e0d6ff', cursor: 'pointer', fontSize: 14,
            }}
          >
            Reload
          </button>
          <button
            onClick={this.handleReset}
            style={{
              padding: '10px 22px', borderRadius: 10, border: '1px solid rgba(155,109,255,0.4)',
              background: 'rgba(155,109,255,0.15)', color: '#c4a0ff', cursor: 'pointer', fontSize: 14,
            }}
          >
            Reset &amp; Reload
          </button>
        </div>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
          "Reset &amp; Reload" clears cached data and fully reloads the app.
        </p>
      </div>
    );
  }
}
