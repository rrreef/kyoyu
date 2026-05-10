import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AnimatedLogoMark } from './EntryScreen';
import './Auth.css';
import './CheckEmail.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);
  const [validLink, setValidLink] = useState(true);

  // Supabase puts the recovery token in the URL hash; it auto-sets the session
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidLink(true);
      }
    });
    // If no hash params, the link is invalid/expired
    if (!window.location.hash.includes('access_token')) {
      setValidLink(false);
    }
  }, []);

  async function handleReset(e) {
    e.preventDefault();
    if (!password || password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate('/'), 2500);
    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="check-email-screen">
      <div className="check-email-card" style={{ gap: 24 }}>

        <div className="check-email-logo">
          <AnimatedLogoMark size={48} spin={false}/>
          <span style={{ fontSize: '0.85rem', letterSpacing: '0.25em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>REEF</span>
        </div>

        {!validLink ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: 'rgba(255,255,255,0.88)', marginBottom: 8 }}>Link expired</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginBottom: 20 }}>
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <button className="auth-btn auth-btn--ghost" onClick={() => navigate('/')}>Back to Login</button>
          </div>
        ) : done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✓</div>
            <h2 style={{ color: 'rgba(255,255,255,0.88)', marginBottom: 8 }}>Password updated!</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Redirecting you to the app…</p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'rgba(255,255,255,0.88)', marginBottom: 6 }}>Set new password</h2>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.83rem' }}>Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleReset} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="auth-field">
                <label htmlFor="rp-password">New password</label>
                <input
                  id="rp-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  autoFocus
                  autoComplete="new-password"
                />
              </div>
              <div className="auth-field">
                <label htmlFor="rp-confirm">Confirm password</label>
                <input
                  id="rp-confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(''); }}
                  autoComplete="new-password"
                />
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
                {loading ? <span className="auth-spinner"/> : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
