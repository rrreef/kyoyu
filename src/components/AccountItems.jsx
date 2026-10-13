import { useState } from 'react';
import { Play, Music2, ChevronDown, ChevronUp, EyeOff } from 'lucide-react';
import { fetchAccountLibrary } from '../lib/streaming';
import { usePlayer } from '../contexts/PlayerContext';

/* Rows for items coming from a connected SoundCloud / Bandcamp account
   (tracks, albums, playlists, followed profiles) — with tap-to-play. Shared by the account page and the Library. */

const fmt = (s) => {
  const n = Math.round(Number(s) || 0);
  return n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '';
};

/** Account item → the shape playSearchItem / the search queue understand */
export function toPlayable(it) {
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

const hiddenTag = (it) => (it.isHidden ? <EyeOff size={13} color="rgba(255,255,255,.4)" style={{ flexShrink: 0 }} /> : null);

export default function AccountItemList({ items = [] }) {
  const { setSearchQueue, playSearchItem } = usePlayer();
  const [openPlaylist, setOpenPlaylist] = useState(null);   // { id, tracks | null }
  const [error, setError] = useState('');

  const playList = (list, item) => {
    const queue = list.filter(x => x.kind === 'track').map(toPlayable);
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

  return (
    <>
      {error && <p style={{ fontSize: '0.78rem', color: '#ff6b6b', marginBottom: 8 }}>{error}</p>}
      {items.map(it => {
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
                 sub={`${it.artistName} · album${it.purchased ? ' · purchased' : ''}${it.isHidden ? ' · hidden' : ''}`}
                 onClick={() => playBandcampAlbum(it)}
                 right={<>{hiddenTag(it)}<Play size={14} color="rgba(255,255,255,.5)" /></>} />
          );
        }
        // ── Tracks (SoundCloud likes, Bandcamp single tracks) ──
        return (
          <Row key={it.id} item={it}
               sub={`${it.artistName}${it.duration ? ` · ${fmt(it.duration)}` : ''}${it.purchased ? ' · purchased' : ''}${it.isHidden ? ' · hidden' : ''}`}
               onClick={() => playList(items, it)}
               right={<>{hiddenTag(it)}<Play size={14} color="rgba(255,255,255,.5)" /></>} />
        );
      })}
    </>
  );
}
