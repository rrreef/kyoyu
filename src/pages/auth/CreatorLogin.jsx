import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AnimatedLogoMark } from './EntryScreen';
import './Auth.css';

export default function CreatorLogin({ onBack, onListener }) {
  const { signIn, signUp, demoLogin } = useAuth();
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [artistName, setArtistName] = useState('');
  const [isNew,      setIsNew]      = useState(false); // toggle sign-up mode
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in email and password.'); return; }
    setError('');
    setLoading(true);
    try {
      if (isNew) {
        // Sign up — include role + artist_name in metadata
        await signUp(email, password, {
          role:         'creator',
          artist_name:  artistName || email.split('@')[0],
          display_name: artistName || email.split('@')[0],
        });
        setError('Check your email for a confirmation link, then sign in.');
        setIsNew(false);
      } else {
        await signIn(email, password);
        // AuthContext hydrates role automatically via onAuthStateChange
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen auth-screen--creator">
      <div className="auth-orb auth-orb--silver" />

      <div className="auth-card auth-card--creator">
        <button className="auth-back" onClick={onBack} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>

        <div className="auth-logo">
          <AnimatedLogoMark size={32} spin={false} />
          <span className="auth-app-name">REEF</span>
        </div>

        <div className="auth-header">
          <span className="auth-portal-badge">Artist &amp; Label Portal</span>
          <h1>{isNew ? 'Create Creator Account' : 'Creator Sign In'}</h1>
          <p>Your music. Your terms. Your data.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isNew && (
            <div className="auth-field">
              <label htmlFor="c-artist">Artist / Label Name</label>
              <input
                id="c-artist"
                type="text"
                placeholder="Formant Value / Obsidian Records"
                value={artistName}
                onChange={e => { setArtistName(e.target.value); setError(''); }}
              />
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="c-email">Email</label>
            <input
              id="c-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="c-password">Password</label>
            <input
              id="c-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoComplete={isNew ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-btn auth-btn--creator-primary" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : (isNew ? 'Create Account' : 'Access Creator Portal')}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        {/* Demo bypass — local only */}
        <button
          type="button"
          className="auth-btn auth-btn--demo auth-btn--demo-creator"
          onClick={() => demoLogin('creator', {
            name: 'Admin', email: 'admin@reef.com', artistName: 'Admin', plan: 'Standard (70/30)'
          })}
        >
          <span className="auth-demo-dot" />
          Demo Login
          <span className="auth-demo-cred">local-only · no account needed</span>
        </button>

        <div className="auth-links">
          <button className="auth-link" onClick={() => { setIsNew(s => !s); setError(''); }}>
            {isNew ? 'Already have an account? Sign in' : 'New creator? Create account'}
          </button>
        </div>

        <div className="auth-switch">
          <span>Looking for music?</span>
          <button onClick={onListener} className="auth-switch-btn">Listener Login →</button>
        </div>
      </div>
    </div>
  );
}
