import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function ForgotPassword({ onClose }) {
  const { resetPassword } = useAuth();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  async function handleSend(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true);
    setError('');
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fp-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="fp-modal" onClick={e => e.stopPropagation()}>

        <button className="fp-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l12 12M13 1L1 13"/>
          </svg>
        </button>

        {!sent ? (
          <>
            <div className="fp-header">
              <div className="fp-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="3"/>
                  <path d="M2 7l10 7 10-7"/>
                </svg>
              </div>
              <h3>Forgot password?</h3>
              <p>Enter your email and we'll send a reset link instantly.</p>
            </div>

            <form onSubmit={handleSend} className="fp-form">
              <div className="auth-field">
                <label htmlFor="fp-email">Email address</label>
                <input
                  id="fp-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  autoFocus
                  autoComplete="email"
                />
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
                {loading ? <span className="auth-spinner"/> : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <div className="fp-success">
            <div className="fp-success-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h3>Check your inbox</h3>
            <p>We sent a reset link to <strong>{email}</strong>.<br/>Click it to choose a new password.</p>
            <button className="auth-btn auth-btn--ghost fp-close-btn" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
