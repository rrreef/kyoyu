import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, ArrowUp, ArrowDown, ListOrdered, RotateCcw } from 'lucide-react';
import {
  SERVICES, SERVICE_LABELS, ACCOUNT_SERVICES, ACCOUNT_LABELS,
  ALL_PROVIDER_LABELS, DEFAULT_PROVIDER_PRIORITY,
  isStreamingAvailable, useStreamingStatus,
  connectService, disconnectService, getPlayThrough, setPlayThrough, callStreaming,
  useProviderPriority,
} from '../../lib/streaming';
import '../../pages/Settings.css';
import '../../pages/AppSettings.css';

/* Apple Music / Spotify / connected accounts card — shared by listener and creator Settings. */

const PLAY_THROUGH_OPTIONS = [
  { id: 'auto',       label: 'Automatic' },
  { id: 'applemusic', label: 'Apple Music' },
  { id: 'spotify',    label: 'Spotify' },
  { id: 'tidal',      label: 'TIDAL' },
  { id: 'off',        label: 'Off' },
];

const PROVIDER_ICONS = {
  bandcamp:   '/icons/bandcamp_light_24x24.png',
  soundcloud: '/icons/soundcloud_light_24x24.png',
  youtube:    '/icons/youtube_light_24x24.png',
  discogs:    '/icons/discogs_light_24x24.png',
  spotify:    '/icons/spotify_light_24x24.png',
  applemusic: '/icons/apple_light_24x24.png',
  tidal:      '/icons/tidal_light_24x24.png',
};

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
  const [providerPriority, setProviderPriority] = useProviderPriority();
  const [pickingOrder, setPickingOrder] = useState(false);
  const [pickedSoFar, setPickedSoFar] = useState([]);

  const moveProvider = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= providerPriority.length) return;
    const next = [...providerPriority];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setProviderPriority(next);
  };

  const handleTapPick = (service) => {
    if (pickedSoFar.includes(service)) {
      const nextPicked = pickedSoFar.filter((s) => s !== service);
      setPickedSoFar(nextPicked);
      return;
    }
    const nextPicked = [...pickedSoFar, service];
    setPickedSoFar(nextPicked);
    const remaining = providerPriority.filter((s) => !nextPicked.includes(s));
    setProviderPriority([...nextPicked, ...remaining]);
    if (nextPicked.length === providerPriority.length) {
      setPickingOrder(false);
      setPickedSoFar([]);
    }
  };

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

      {/* ── Provider Priority Order (Most to Least Preferred) ── */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: '12px 14px',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>
            <ListOrdered size={14} style={{ opacity: 0.75, color: '#fb7f33' }} />
            <span>Provider Priority</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              data-kyoyu-injected="1"
              onClick={() => {
                if (pickingOrder) {
                  setPickingOrder(false);
                  setPickedSoFar([]);
                } else {
                  setPickingOrder(true);
                  setPickedSoFar([]);
                }
              }}
              style={{
                background: pickingOrder ? 'rgba(251,127,51,0.22)' : 'rgba(255,255,255,0.08)',
                border: pickingOrder ? '1px solid rgba(251,127,51,0.6)' : '1px solid rgba(255,255,255,0.12)',
                color: pickingOrder ? '#fb7f33' : 'rgba(255,255,255,0.8)',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {pickingOrder ? (pickedSoFar.length > 0 ? `Done (${pickedSoFar.length}/${providerPriority.length})` : 'Cancel') : 'Select in order'}
            </button>
            <button
              type="button"
              data-kyoyu-injected="1"
              title="Reset to default order"
              onClick={() => {
                setPickingOrder(false);
                setPickedSoFar([]);
                setProviderPriority(DEFAULT_PROVIDER_PRIORITY);
              }}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)',
                borderRadius: 999,
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
          {pickingOrder
            ? `Tap providers from most preferred (#1) to least preferred (#${providerPriority.length}).`
            : 'Most to least preferred — defines the order of collections on Home and the provider filters in Library & Search.'}
        </p>

        {pickingOrder ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {providerPriority.map((service) => {
              const pickIdx = pickedSoFar.indexOf(service);
              const isPicked = pickIdx !== -1;
              return (
                <button
                  key={service}
                  type="button"
                  data-kyoyu-injected="1"
                  onClick={() => handleTapPick(service)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 12px',
                    borderRadius: 999,
                    background: isPicked ? 'rgba(251,127,51,0.22)' : 'rgba(255,255,255,0.06)',
                    border: isPicked ? '1.5px solid #fb7f33' : '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: isPicked ? '#fb7f33' : 'rgba(255,255,255,0.12)',
                    color: isPicked ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {isPicked ? pickIdx + 1 : '·'}
                  </span>
                  {PROVIDER_ICONS[service] && (
                    <img src={PROVIDER_ICONS[service]} alt="" width={14} height={14} style={{ opacity: 0.9 }} />
                  )}
                  <span>{ALL_PROVIDER_LABELS[service] || service}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {providerPriority.map((service, idx) => (
              <div
                key={service}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: idx === 0 ? 'rgba(251,127,51,0.25)' : 'rgba(255,255,255,0.08)',
                  color: idx === 0 ? '#fb7f33' : 'rgba(255,255,255,0.65)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {idx + 1}
                </span>
                {PROVIDER_ICONS[service] && (
                  <img src={PROVIDER_ICONS[service]} alt="" width={15} height={15} style={{ opacity: 0.85, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 500, color: '#fff' }}>
                  {ALL_PROVIDER_LABELS[service] || SERVICE_LABELS[service] || ACCOUNT_LABELS[service] || service}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    data-kyoyu-injected="1"
                    disabled={idx === 0}
                    onClick={() => moveProvider(idx, -1)}
                    aria-label="Move up"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.06)',
                      color: idx === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: idx === 0 ? 'default' : 'pointer',
                      padding: 0,
                    }}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    data-kyoyu-injected="1"
                    disabled={idx === providerPriority.length - 1}
                    onClick={() => moveProvider(idx, 1)}
                    aria-label="Move down"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.06)',
                      color: idx === providerPriority.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: idx === providerPriority.length - 1 ? 'default' : 'pointer',
                      padding: 0,
                    }}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isStreamingAvailable() ? (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Connect Apple Music, Spotify, TIDAL, YouTube Music, SoundCloud, Bandcamp, or Discogs in the Reef iOS app.
        </p>
      ) : (
        <>
          {providerPriority.map((service, i) => {
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
        </>
      )}
    </div>
  );
}
