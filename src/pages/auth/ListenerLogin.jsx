import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AnimatedLogoMark } from './EntryScreen';
import './Auth.css';

export default function ListenerLogin({ onBack, onCreator }) {
  const { signIn, signUp, demoLogin } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [isNew,    setIsNew]    = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      if (isNew) {
        await signUp(email, password, {
          role:         'listener',
          display_name: email.split('@')[0],
        });
        setError('Check your email for a confirmation link, then sign in.');
        setIsNew(false);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen auth-screen--listener">
      <div className="auth-orb auth-orb--orange" />

      <div className="auth-card">
        <button className="auth-back" onClick={onBack} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>

        <div className="auth-logo">
          <AnimatedLogoMark size={32} spin={false} />
          <span className="auth-app-name">REEF</span>
        </div>

        <div className="auth-header">
          <h1>{isNew ? 'Create Account' : 'Welcome back'}</h1>
          <p>{isNew ? 'Join Reef and discover music.' : 'Sign in to your listener account'}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="l-email">Email</label>
            <input
              id="l-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="l-password">Password</label>
            <input
              id="l-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoComplete={isNew ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : (isNew ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button
          type="button"
          className="auth-btn auth-btn--demo"
          onClick={() => demoLogin('listener', { name: 'Demo Listener', email: null, plan: 'Standard' })}
        >
          <span className="auth-demo-dot" />
          Demo Login
          <span className="auth-demo-cred">local-only · no account needed</span>
        </button>

        <button className="auth-btn auth-btn--ghost" onClick={() => demoLogin('listener', { name: 'Guest', email: null, plan: 'Free' })}>
          Continue as Guest
        </button>

        <div className="auth-links">
          <button className="auth-link" onClick={() => { setIsNew(s => !s); setError(''); }}>
            {isNew ? 'Already have an account? Sign in' : 'No account? Create one'}
          </button>
        </div>

        <div className="auth-switch">
          <span>Are you an artist or label?</span>
          <button onClick={onCreator} className="auth-switch-btn">Creator Portal →</button>
        </div>
      </div>
    </div>
  );
}
