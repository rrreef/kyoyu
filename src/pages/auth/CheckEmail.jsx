import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AnimatedLogoMark } from './EntryScreen';
import './Auth.css';
import './CheckEmail.css';

export default function CheckEmail({ email, onConfirmed }) {
  const [checking, setChecking] = useState(false);

  /* Poll every 4 seconds for a confirmed session */
  useEffect(() => {
    const interval = setInterval(async () => {
      setChecking(true);
      const { data } = await supabase.auth.getSession();
      setChecking(false);
      if (data?.session?.user) {
        onConfirmed();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [onConfirmed]);

  /* Also listen for the auth state change event */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') onConfirmed();
    });
    return () => subscription.unsubscribe();
  }, [onConfirmed]);

  return (
    <div className="check-email-screen">
      <div className="check-email-orb" />

      <div className="check-email-card">
        <div className="check-email-logo">
          <AnimatedLogoMark size={36} spin={false} />
          <span className="auth-app-name">REEF</span>
        </div>

        <div className="check-email-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="14" fill="currentColor" fillOpacity="0.08"/>
            <path d="M10 17l14 10 14-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="10" y="15" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </div>

        <div className="check-email-text">
          <h1>Check your inbox</h1>
          <p>We sent a confirmation link to</p>
          <strong>{email}</strong>
          <p className="check-email-hint">Click the link in the email to activate your account. This page will update automatically.</p>
        </div>

        <div className="check-email-pulse">
          <span className={`check-email-dot${checking ? ' checking' : ''}`} />
          <span className="check-email-status">Waiting for confirmation…</span>
        </div>
      </div>
    </div>
  );
}
