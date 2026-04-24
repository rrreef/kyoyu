import { useEffect, useRef, useState } from 'react';
import './SplashScreen.css';

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
    <line
      x1="26" y1="6" x2="7" y2="25"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      className="splash-tonearm"
      style={{ transformOrigin: '26px 6px' }}
    />
    <circle cx="26" cy="6" r="1.4" fill="currentColor" opacity="0.9" />
  </svg>
);

// Phases: enter → hold → zoom → done
export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('enter');

  useEffect(() => {
    // enter (0–700ms) → hold
    const t1 = setTimeout(() => setPhase('hold'), 700);
    // hold (700ms–2200ms) → zoom
    const t2 = setTimeout(() => setPhase('zoom'), 2200);
    // zoom (2200ms–2700ms) → done
    const t3 = setTimeout(() => { onDone(); }, 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div className={`splash-root splash-${phase}`} aria-hidden="true">
      <div className="splash-orb splash-orb--a" />
      <div className="splash-orb splash-orb--b" />

      <div className="splash-center">
        <div className="splash-logo-wrap">
          <SplashLogo />
          <div className="splash-glow" />
        </div>

        <div className="splash-wordmark-wrap">
          <span className="splash-wordmark">REEF</span>
          <span className="splash-sub">Fair Music Platform</span>
        </div>
      </div>
    </div>
  );
}
