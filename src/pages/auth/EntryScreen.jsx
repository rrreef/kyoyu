import { useState } from 'react';
import ListenerLogin from './ListenerLogin';
import CreatorLogin from './CreatorLogin';
import './EntryScreen.css';

/* ─── Animated Logo Mark ─────────────────────────────────── */
export const AnimatedLogoMark = ({ size = 96, spin = true }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="reef-logo-svg"
    aria-label="Reef logo"
  >
    {/* Record group — spins */}
    <g className={spin ? 'record-spin' : ''} style={{ transformOrigin: '16px 16px' }}>
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.9" />
      <circle cx="16" cy="16" r="7.5" stroke="currentColor" strokeWidth="0.7" fill="none" opacity="0.12" />
      <circle cx="16" cy="16" r="3.8" stroke="currentColor" strokeWidth="0.7" fill="none" opacity="0.18" />
      <circle cx="16" cy="16" r="1" fill="currentColor" opacity="0.55" />
    </g>
    {/* Tonearm */}
    <line
      x1="26" y1="6"
      x2="7" y2="25"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="tonearm-glitch"
      style={{ transformOrigin: '26px 6px' }}
    />
    <circle cx="26" cy="6" r="1.4" fill="currentColor" opacity="0.9" />
  </svg>
);

/* ─── Listener icon — headphones ────────────────────────── */
const ListenerIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
);

/* ─── Creator icon — vinyl wave ─────────────────────────── */
const CreatorIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2" strokeOpacity="0.4" />
    <path d="M7 7l1.5 1.5M15.5 15.5L17 17M17 7l-1.5 1.5M8.5 15.5L7 17" strokeOpacity="0.25" />
  </svg>
);

/* ─── Entry Screen ───────────────────────────────────────── */
export default function EntryScreen() {
  const [view, setView] = useState('choose');

  if (view === 'listener') return <ListenerLogin onBack={() => setView('choose')} onCreator={() => setView('creator')} />;
  if (view === 'creator')  return <CreatorLogin  onBack={() => setView('choose')} onListener={() => setView('listener')} />;

  return (
    <div className="entry-screen">
      {/* Grain overlay */}
      <div className="entry-grain" aria-hidden="true" />

      {/* Breathing orbs */}
      <div className="entry-orb entry-orb--deep" />
      <div className="entry-orb entry-orb--cold" />

      {/* Radial vignette */}
      <div className="entry-vignette" aria-hidden="true" />

      <div className="entry-inner">

        {/* ── Logo ── */}
        <div className="entry-hero">
          <div className="entry-logo-wrap">
            <AnimatedLogoMark size={96} />
          </div>
          <div className="entry-brand">
            <span className="entry-wordmark">REEF</span>
            <span className="entry-wordmark-sub">Fair Music Platform</span>
          </div>
        </div>

        <p className="entry-tagline">Where the music runs deep.</p>

        {/* ── Cards ── */}
        <div className="entry-cards">

          {/* Listener */}
          <button className="entry-card entry-card--listener" onClick={() => setView('listener')}>
            <div className="entry-card__top">
              <div className="entry-card__icon">
                <ListenerIcon />
              </div>
              <div className="entry-card__badge">Listener</div>
            </div>
            <div className="entry-card__body">
              <h2>Dive in.</h2>
              <p>Stream, discover and own music from artists who actually get paid.</p>
            </div>
            <ul className="entry-card__features">
              <li>Unlimited streaming</li>
              <li>Buy vinyl &amp; downloads direct</li>
              <li>Transparent artist revenue</li>
            </ul>
            <span className="entry-card__cta">Enter as Listener →</span>
          </button>

          <div className="entry-divider" aria-hidden="true">
            <span>or</span>
          </div>

          {/* Creator */}
          <button className="entry-card entry-card--creator" onClick={() => setView('creator')}>
            <div className="entry-card__top">
              <div className="entry-card__icon">
                <CreatorIcon />
              </div>
              <div className="entry-card__badge">Creator</div>
            </div>
            <div className="entry-card__body">
              <h2>Claim your cut.</h2>
              <p>Upload your work. Track what it earns. Get paid what you deserve.</p>
            </div>
            <ul className="entry-card__features">
              <li>Direct-to-fan sales</li>
              <li>Real-time stream analytics</li>
              <li>70 / 30 revenue share</li>
            </ul>
            <span className="entry-card__cta">Enter Creator Portal →</span>
          </button>

        </div>

        <p className="entry-footer">
          By continuing you agree to Reef's <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
