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
  const [validLink, setValidLink] = useState(null); // null = checking

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));

    // Supabase error (expired/invalid link) — show immediately
    if (params.get('error') || params.get('error_code')) {
      setValidLink(false);
      return;
    }

    // Valid recovery token — wait for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setValidLink(true);
    });

    // Fallback: if no token at all, mark invalid after brief wait
    if (!hash.includes('access_token')) {
      const t = setTimeout(() => setValidLink(v => v === null ? false : v), 800);
      return () => { clearTimeout(t); subscription.unsubscribe(); };
    }

    return () => subscription.unsubscribe();
  }, []);

  async function handleReset(e) {
    e.preventDefault();
    if (!password || password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Password updated — get role to redirect correctly
      setDone(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      let role = 'listener';
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        if (profile?.role) role = profile.role;
      }

      // Redirect to correct home after brief success message
      setTimeout(() => {
        navigate(role === 'creator' ? '/dashboard' : '/');
      }, 2000);

    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  // Still checking token
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

        {/* ── Invalid / expired link ── */}
        {!validLink ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: 'rgba(255,255,255,0.88)', marginBottom: 8 }}>Link expired</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginBottom: 20 }}>
              This reset link is invalid or has expired.<br/>Please request a new one.
            </p>
            <button className="auth-btn auth-btn--ghost" onClick={() => navigate('/')}>
              Back to Login
            </button>
          </div>

        /* ── Success ── */
        ) : done ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
              color: 'rgba(34,197,94,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h2 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.2rem' }}>Password updated!</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.83rem' }}>Taking you back to the app…</p>
          </div>

        /* ── Reset form ── */
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
