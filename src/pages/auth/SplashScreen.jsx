import { useEffect, useRef, useState } from 'react';
import './SplashScreen.css';

/* ── The same logo SVG used in EntryScreen ─────────────────── */
const SplashLogo = () => (
  <svg
    width="120" height="120"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="splash-logo-svg"
    aria-hidden="true"
  >
    <g className="splash-record-spin" style={{ transformOrigin: '16px 16px' }}>
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.9" />
      <circle cx="16" cy="16" r="7.5" stroke="currentColor" strokeWidth="0.7" fill="none" opacity="0.18" />
      <circle cx="16" cy="16" r="3.8" stroke="currentColor" strokeWidth="0.7" fill="none" opacity="0.22" />
      <circle cx="16" cy="16" r="1" fill="currentColor" opacity="0.6" />
    </g>
    {/* Tonearm */}
    <line
      x1="26" y1="6" x2="7" y2="25"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      className="splash-tonearm"
      style={{ transformOrigin: '26px 6px' }}
    />
    <circle cx="26" cy="6" r="1.4" fill="currentColor" opacity="0.9" />
  </svg>
);

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('enter'); // enter → hold → zoom → done
  const containerRef = useRef(null);

  useEffect(() => {
    // Phase 1: logo floats in (0 → 800ms)
    const holdTimer = setTimeout(() => setPhase('zoom'), 1800);
    return () => clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (phase === 'zoom') {
      // Phase 2: smash-zoom (800ms → 1150ms) then exit
      const doneTimer = setTimeout(() => {
        setPhase('done');
        onDone();
      }, 500);
      return () => clearTimeout(doneTimer);
    }
  }, [phase, onDone]);

  if (phase === 'done') return null;

  return (
    <div ref={containerRef} className={`splash-root splash-${phase}`} aria-hidden="true">
      {/* Ambient orbs */}
      <div className="splash-orb splash-orb--a" />
      <div className="splash-orb splash-orb--b" />

      <div className="splash-center">
        {/* Logo mark */}
        <div className="splash-logo-wrap">
          <SplashLogo />
          {/* Glow ring behind logo */}
          <div className="splash-glow" />
        </div>

        {/* Wordmark */}
        <div className="splash-wordmark-wrap">
          <span className="splash-wordmark">REEF</span>
          <span className="splash-sub">Fair Music Platform</span>
        </div>
      </div>
    </div>
  );
}
