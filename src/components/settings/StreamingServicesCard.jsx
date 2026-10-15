import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones } from 'lucide-react';
import {
  SERVICES, SERVICE_LABELS, ACCOUNT_SERVICES, ACCOUNT_LABELS, isStreamingAvailable, useStreamingStatus,
  connectService, disconnectService, getPlayThrough, setPlayThrough, callStreaming,
} from '../../lib/streaming';
import '../../pages/Settings.css';
import '../../pages/AppSettings.css';

/* Apple Music / Spotify connection card — shared by listener and creator Settings. */

const PLAY_THROUGH_OPTIONS = [
  { id: 'auto',       label: 'Automatic' },
  { id: 'applemusic', label: 'Apple Music' },
  { id: 'spotify',    label: 'Spotify' },
  { id: 'tidal',      label: 'TIDAL' },
  { id: 'off',        label: 'Off' },
];

function serviceLine(service, s) {
  if (!s) return 'Checking…';
  if (service === 'applemusic') {
    if (s.authorization === 'denied' || s.authorization === 'restricted') return 'Access denied — allow Reef in iOS Settings › Privacy › Media & Apple Music';
    if (!s.connected) return 'Not connected — tap Connect to allow Reef to use Apple Music on this device';
    if (s.canPlay) return 'Connected — playing with this device\u2019s Apple Music subscription';
    return s.canSubscribe
      ? 'Allowed, but this device\u2019s Apple ID has no active Apple Music subscription yet'
      : 'Allowed, but no active Apple Music subscription was found for this device\u2019s Apple ID';
  }
  if (service === 'tidal') {
    if (!s.configured) return 'Coming soon';
    if (!s.connected) return 'Sign in to see your likes, albums, playlists and follows in Kyoyu';
    const who = s.displayName ? ` as ${s.displayName}` : '';
    return `Connected${who}`;
  }
  if (ACCOUNT_SERVICES.includes(service)) {
    if (!s.connected) {
      if (service === 'soundcloud') return 'Sign in to see your likes, playlists and follows in Kyoyu';
      if (service === 'youtube') return 'Sign in to see your YouTube Music likes, albums, playlists and follows in Kyoyu';
      if (service === 'discogs') return 'Sign in to see your collection and wishlist in Kyoyu';
      return 'Sign in to see your collection, purchases and wishlist in Kyoyu';
    }
    return `Connected${s.displayName ? ` as ${s.displayName}` : ''}`;
  }
  if (!s.configured) return 'Coming soon';
  if (!s.connected) return 'Not connected';
  const who = s.displayName ? ` as ${s.displayName}` : '';
  if (!s.premium) return `Connected${who} — Spotify Premium is required to play`;
  if (!s.installed) return `Connected${who} — install the Spotify app to play`;
  if (!s.sdk) return `Connected${who} — playback not enabled in this build yet`;
  return `Connected${who}`;
}

export default function StreamingServicesCard() {
  const status = useStreamingStatus();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [playThrough, setPlayThroughState] = useState(getPlayThrough());

  if (!isStreamingAvailable()) {
    return (
      <div className="s-card glass" style={{ marginTop: 16 }}>
        <div className="s-section-heading"><Headphones size={13} style={{ opacity: 0.6 }} /> Streaming Services</div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Connect Apple Music, Spotify, or TIDAL in the Reef iOS app.
        </p>
      </div>
    );
  }

  const toggle = async (service) => {
    setError('');
    setBusy(service);
    try {
      if (status?.[service]?.connected) await disconnectService(service);
      else await connectService(service);
    } catch (e) {
      setError(e?.message || 'Something went wrong');
    }
    setBusy('');
  };

  const subscribe = async (service) => {
    setError('');
    try { await callStreaming('subscribe', { service }); }
    catch (e) { setError(e?.message || 'Something went wrong'); }
  };

  const choose = (id) => { setPlayThrough(id); setPlayThroughState(id); };

  return (
    <div className="s-card glass" style={{ marginTop: 16 }}>
      <div className="s-section-heading"><Headphones size={13} style={{ opacity: 0.6 }} /> Streaming Services</div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 16 }}>
        When a song from YouTube is also on your service, Reef plays it from there — without interruptions when you leave the app.
      </p>

      {[...SERVICES, ...ACCOUNT_SERVICES].map((service, i) => {
        const s = status?.[service];
        const isAccount = ACCOUNT_SERVICES.includes(service);
        const connectable = isAccount || service === 'applemusic' || service === 'tidal' || s?.configured;
        return (
          <div key={service}>
            {i > 0 && <div className="s-layout-divider" />}
            <div className="s-layout-row" style={{ alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s-layout-row-label">{SERVICE_LABELS[service] || ACCOUNT_LABELS[service]}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>{serviceLine(service, s)}</div>
                {(isAccount || service === 'tidal') && s?.connected && (
                  <button
                    data-kyoyu-injected="1"
                    onClick={() => navigate(`/accounts/${service}`)}
                    style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, fontSize: '0.74rem', color: '#ff5500', cursor: 'pointer', textAlign: 'left' }}
                  >
                    Open your {ACCOUNT_LABELS[service] || SERVICE_LABELS[service]} library →
                  </button>
                )}
              </div>
              {service === 'applemusic' && s?.connected && !s?.canPlay && (
                <button
                  className="s-layout-btn active" data-kyoyu-injected="1"
                  style={{ width: 'auto', padding: '0 14px' }}
                  disabled={!!busy}
                  onClick={() => subscribe(service)}
                >
                  Get Apple Music
                </button>
              )}
              {connectable && (
                <button
                  className={`s-layout-btn${s?.connected ? '' : ' active'}`}
                  data-kyoyu-injected="1"
                  style={{ width: 'auto', padding: '0 14px' }}
                  disabled={!!busy}
                  onClick={() => toggle(service)}
                >
                  {busy === service ? '…' : s?.connected ? 'Disconnect' : 'Connect'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {error && <p style={{ fontSize: '0.72rem', color: '#ff6b6b', marginTop: 10 }}>{error}</p>}

      <div className="s-layout-divider" />
      <div className="s-layout-row">
        <div className="s-layout-row-label">Play through</div>
        <div className="s-layout-picker">
          {PLAY_THROUGH_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`s-layout-btn${playThrough === opt.id ? ' active' : ''}`}
              data-kyoyu-injected="1"
              style={{ width: 'auto', padding: '0 10px' }}
              onClick={() => choose(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
