import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Play, Music2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  ACCOUNT_LABELS, ACCOUNT_SERVICES, fetchAccountLibrary, useStreamingStatus, isStreamingAvailable,
} from '../lib/streaming';
import { usePlayer } from '../contexts/PlayerContext';
import './Library.css';

/* Personal SoundCloud / Bandcamp library (likes, playlists, follows / collection, wishlist) read on-device
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
};

const fmt = (s) => {
  const n = Math.round(Number(s) || 0);
  return n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '';
};

/** Library item → the shape playSearchItem / the search queue understand */
function toPlayable(it) {
  if (it.provider === 'soundcloud') {
    return {
      id: it.id, title: it.title, artistName: it.artistName, artworkUrl: it.artworkUrl, duration: it.duration || 0,
      provider: 'soundcloud', providerItemId: it.permalinkUrl, scTrackId: it.trackId, trackId: it.trackId,
    };
  }
  return {
    id: it.id, title: it.title, artistName: it.artistName, artworkUrl: it.artworkUrl, duration: 0,
    provider: 'bandcamp', providerItemId: it.trackUrl, trackUrl: it.trackUrl,
  };
}

function Art({ src, round }) {
  return (
    <div style={{
      width: 48, height: 48, borderRadius: round ? 24 : 6, overflow: 'hidden', flexShrink: 0,
      background: 'rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
           : <Music2 size={18} color="rgba(255,255,255,.3)" />}
    </div>
  );
}

function Row({ item, onClick, right, sub, round }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: onClick ? 'pointer' : 'default' }}
    >
      <Art src={item.artworkUrl} round={round} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub ?? item.artistName}</div>
      </div>
      {right}
    </div>
  );
}

export default function AccountLibrary() {
  const { service } = useParams();
  const navigate = useNavigate();
  const status = useStreamingStatus();
  const { setSearchQueue, playSearchItem } = usePlayer();
  const tabs = TABS[service] || [];
  const [tab, setTab] = useState(tabs[0]?.key);
  const [items, setItems] = useState(null);       // null = loading
  const [error, setError] = useState('');
  const [openPlaylist, setOpenPlaylist] = useState(null);   // { id, tracks | null }

  const acct = status?.[service];
  const connected = !!acct?.connected;

  const load = useCallback(async () => {
    if (!connected || !tab) return;
    setItems(null); setError(''); setOpenPlaylist(null);
    try { setItems(await fetchAccountLibrary(service, tab)); }
    catch (e) { setItems([]); setError(e?.message || 'Could not load your library'); }
  }, [service, tab, connected]);

  useEffect(() => { load(); }, [load]);

  const playList = (list, item) => {
    const queue = list.filter(x => x.kind === 'track' || (service === 'bandcamp' && x.kind === 'track')).map(toPlayable);
    const idx = queue.findIndex(q => q.id === item.id);
    setSearchQueue(queue, idx >= 0 ? idx : 0);
    playSearchItem(toPlayable(item));
    window.__kyoyuPlayerCmd?.('expand');
  };

  // Bandcamp album → its tracks (same endpoint the album sheet uses), then play from the first
  const playBandcampAlbum = async (album) => {
    try {
      const r = await fetch('/api/bandcamp-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch-album', albumUrl: album.trackUrl }),
      });
      const data = r.ok ? await r.json() : { tracks: [] };
      const tracks = (data.tracks || []).map(t => ({
        id: `bc-${t.trackId}`, kind: 'track', provider: 'bandcamp', title: t.title,
        artistName: t.artistName || album.artistName, artworkUrl: t.artworkUrl || album.artworkUrl, trackUrl: t.trackUrl,
      }));
      if (!tracks.length) { setError('Couldn’t load this album’s tracks'); return; }
      setSearchQueue(tracks.map(toPlayable), 0);
      playSearchItem(toPlayable(tracks[0]));
      window.__kyoyuPlayerCmd?.('expand');
    } catch { setError('Couldn’t load this album’s tracks'); }
  };

  const togglePlaylist = async (pl) => {
    if (openPlaylist?.id === pl.id) { setOpenPlaylist(null); return; }
    setOpenPlaylist({ id: pl.id, tracks: null });
    try {
      const tracks = await fetchAccountLibrary('soundcloud', 'playlistTracks', { playlistId: pl.playlistId });
      setOpenPlaylist({ id: pl.id, tracks });
    } catch (e) { setOpenPlaylist({ id: pl.id, tracks: [] }); setError(e?.message || 'Could not load the playlist'); }
  };

  if (!ACCOUNT_SERVICES.includes(service)) return <div className="page library-page"><div className="lib-empty"><p>Unknown account.</p></div></div>;

  return (
    <div className="page library-page animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => navigate(-1)} data-kyoyu-injected="1" style={{ background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer' }}>
          <ChevronLeft size={22} />
        </button>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{ACCOUNT_LABELS[service]}</div>
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

          {items === null && <div className="lib-empty"><Loader2 size={20} className="spin" /><p>Loading your {tab}…</p></div>}
          {items && items.length === 0 && !error && <div className="lib-empty"><p>Nothing here yet.</p></div>}

          {items && items.map(it => {
            // ── SoundCloud playlists: tap to expand its tracks ──
            if (it.kind === 'playlist') {
              const open = openPlaylist?.id === it.id;
              return (
                <div key={it.id}>
                  <Row
                    item={it}
                    sub={`${it.artistName}${it.trackCount ? ` · ${it.trackCount} tracks` : ''}${it.owner === 'liked' ? ' · liked' : ''}${it.isPrivate ? ' · private' : ''}`}
                    onClick={() => togglePlaylist(it)}
                    right={open ? <ChevronUp size={16} color="rgba(255,255,255,.5)" /> : <ChevronDown size={16} color="rgba(255,255,255,.5)" />}
                  />
                  {open && (
                    <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,.1)', marginLeft: 6 }}>
                      {openPlaylist.tracks === null && <div style={{ padding: 8, fontSize: '0.78rem', color: 'var(--text-dim)' }}>Loading tracks…</div>}
                      {openPlaylist.tracks?.map(t => (
                        <Row key={t.id} item={t} sub={`${t.artistName}${t.duration ? ` · ${fmt(t.duration)}` : ''}`}
                             onClick={() => playList(openPlaylist.tracks, t)}
                             right={<Play size={14} color="rgba(255,255,255,.5)" />} />
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            // ── SoundCloud followings ──
            if (it.kind === 'profile') {
              return <Row key={it.id} item={it} round sub={it.followers ? `${it.followers.toLocaleString()} followers` : it.artistName} />;
            }
            // ── Bandcamp albums: play from the first track ──
            if (it.kind === 'album') {
              return (
                <Row key={it.id} item={it}
                     sub={`${it.artistName} · album${it.purchased ? ' · purchased' : ''}`}
                     onClick={() => playBandcampAlbum(it)}
                     right={<Play size={14} color="rgba(255,255,255,.5)" />} />
              );
            }
            // ── Tracks (SoundCloud likes, Bandcamp single tracks) ──
            return (
              <Row key={it.id} item={it}
                   sub={`${it.artistName}${it.duration ? ` · ${fmt(it.duration)}` : ''}${it.purchased ? ' · purchased' : ''}`}
                   onClick={() => playList(items, it)}
                   right={<Play size={14} color="rgba(255,255,255,.5)" />} />
            );
          })}
        </>
      )}
    </div>
  );
}
