import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import {
  SERVICES, SERVICE_LABELS, ACCOUNT_LABELS, ACCOUNT_SERVICES, fetchAccountLibrary, useStreamingStatus, isStreamingAvailable,
} from '../lib/streaming';
import AccountItemList from '../components/AccountItems';
import './Library.css';

/* Personal SoundCloud / Bandcamp / TIDAL library (likes, playlists, follows / collection, wishlist) read on-device
   through the account the user signed into in Settings › Streaming Services. */

const TABS = {
  soundcloud: [
    { key: 'likes',     label: 'Likes' },
    { key: 'playlists', label: 'Playlists' },
    { key: 'following', label: 'Following' },
  ],
  bandcamp: [
    { key: 'collection', label: 'Collection' },
    { key: 'wishlist',   label: 'Wishlist' },
  ],
  tidal: [
    { key: 'likes',     label: 'Likes' },
    { key: 'albums',    label: 'Albums' },
    { key: 'playlists', label: 'Playlists' },
    { key: 'following', label: 'Following' },
  ],
};

export default function AccountLibrary() {
  const { service } = useParams();
  const navigate = useNavigate();
  const status = useStreamingStatus();
  const tabs = TABS[service] || [];
  const [tab, setTab] = useState(tabs[0]?.key);
  const [items, setItems] = useState(null);       // null = loading
  const [error, setError] = useState('');

  const acct = status?.[service];
  const connected = !!acct?.connected;

  const load = useCallback(async () => {
    if (!connected || !tab) return;
    setItems(null); setError('');
    try { setItems(await fetchAccountLibrary(service, tab)); }
    catch (e) { setItems([]); setError(e?.message || 'Could not load your library'); }
  }, [service, tab, connected]);

  useEffect(() => { load(); }, [load]);

  if (!ACCOUNT_SERVICES.includes(service) && !SERVICES.includes(service)) return <div className="page library-page"><div className="lib-empty"><p>Unknown account.</p></div></div>;

  return (
    <div className="page library-page animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => navigate(-1)} data-kyoyu-injected="1" style={{ background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer' }}>
          <ChevronLeft size={22} />
        </button>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{ACCOUNT_LABELS[service] || SERVICE_LABELS[service]}</div>
          {acct?.displayName && <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{acct.displayName}</div>}
        </div>
      </div>

      {!isStreamingAvailable() && <div className="lib-empty"><p>Available in the Kyoyu iOS app.</p></div>}

      {isStreamingAvailable() && !connected && (
        <div className="lib-empty">
          <p>You’re not connected to {ACCOUNT_LABELS[service]}.</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Connect it in Settings › Streaming Services.</p>
        </div>
      )}

      {connected && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                data-kyoyu-injected="1"
                onClick={() => setTab(t.key)}
                style={{
                  padding: '5px 14px', borderRadius: 16, border: 'none', fontSize: '0.8rem', cursor: 'pointer',
                  background: tab === t.key ? 'var(--text-primary)' : 'var(--glass-bg)',
                  color: tab === t.key ? '#000' : 'var(--text-primary)',
                }}
              >{t.label}</button>
            ))}
          </div>

          {error && <p style={{ fontSize: '0.78rem', color: '#ff6b6b', marginBottom: 8 }}>{error}</p>}
          {items === null && <div className="lib-empty"><Loader2 size={20} /><p>Loading your {tab}…</p></div>}
          {items && items.length === 0 && !error && <div className="lib-empty"><p>Nothing here yet.</p></div>}
          {items && <AccountItemList items={items} />}
        </>
      )}
    </div>
  );
}
