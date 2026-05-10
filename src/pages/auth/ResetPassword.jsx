import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AnimatedLogoMark } from './EntryScreen';
import './Auth.css';
import './CheckEmail.css';

export default function ResetPassword() {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [validLink, setValidLink] = useState(null); // null = checking

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));

    // Supabase error hash (expired/invalid) — show expired immediately
    if (params.get('error') || params.get('error_code')) {
      setValidLink(false);
      return;
    }

    // Listen for PASSWORD_RECOVERY session event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setValidLink(true);
    });

    // No token in hash at all → mark invalid after brief wait
    if (!hash.includes('access_token')) {
      const t = setTimeout(() => setValidLink(v => v === null ? false : v), 900);
      return () => { clearTimeout(t); subscription.unsubscribe(); };
    }

    return () => subscription.unsubscribe();
  }, []);

  async function handleReset(e) {
    e.preventDefault();
    if (!password || password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    setLoading(true);

    try {
      // Race against 5s timeout — server often processes before response arrives
      const timeout = new Promise(resolve =>
        setTimeout(() => resolve({ timedOut: true, error: null }), 5000)
      );
      const result = await Promise.race([
        supabase.auth.updateUser({ password }),
        timeout
      ]);

      if (result?.error && !result?.timedOut) throw result.error;

      // Success or timeout — password changed, redirect with toast
      sessionStorage.setItem('reef_pw_reset_success', '1');
      window.location.href = '/';

    } catch (err) {
      setLoading(false);
      setError(err.message || 'Failed to update password. Please request a new reset link.');
    }
  }

  /* ── Verifying ── */
  if (validLink === null) {
    return (
      <div className="check-email-screen">
        <div className="check-email-card" style={{ gap: 24, alignItems: 'center' }}>
          <AnimatedLogoMark size={48} spin={true}/>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem' }}>Verifying link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="check-email-screen">
      <div className="check-email-card" style={{ gap: 24 }}>

        <div className="check-email-logo">
          <AnimatedLogoMark size={48} spin={false}/>
          <span style={{ fontSize: '0.85rem', letterSpacing: '0.25em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>REEF</span>
        </div>

        {/* ── Expired ── */}
        {!validLink ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: 'rgba(255,255,255,0.88)', marginBottom: 8 }}>Link expired</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginBottom: 20 }}>
              This reset link is invalid or has expired.<br/>Please request a new one from the login page.
            </p>
            <button className="auth-btn auth-btn--ghost" onClick={() => { window.location.href = '/'; }}>
              Back to Login
            </button>
          </div>

        /* ── Form ── */
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
                {loading ? <span className="auth-spinner"/> : 'Save Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
