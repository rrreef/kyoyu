import { useState, useEffect } from 'react';
import { Play, Music2 } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';

/* Items coming from a connected SoundCloud / Bandcamp account (tracks, albums, playlists, followed profiles)
   with tap-to-play, as a list or as an icon grid (same look as the liked tracks). Shared by the account page and the Library. */

const fmt = (s) => {
  const n = Math.round(Number(s) || 0);
  return n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '';
};

const _resolvedArtMem = new Map();

export function sanitizeArtworkUrl(raw, itemId) {
  if (raw && typeof raw === 'string') {
    const s = raw.trim();
    if (s && s !== 'undefined' && s !== 'null' && /^(https?:\/\/|data:|blob:|\/)/i.test(s)) {
      let url = s
        .replace('{w}', '600')
        .replace('{h}', '600')
        .replace('{f}', 'jpg')
        .replace('{c}', 'bb');
      if (url.includes('bcbits.com')) url = url.replace(/_[0-9]+\.jpg/, '_10.jpg');
      return url;
    }
  }
  if (itemId) {
    if (_resolvedArtMem.has(itemId)) return _resolvedArtMem.get(itemId);
    try {
      const cached = localStorage.getItem(`kyoyu-art-${itemId}`);
      if (cached && /^https?:\/\//i.test(cached)) {
        _resolvedArtMem.set(itemId, cached);
        return cached;
      }
    } catch {}
  }
  return '';
}

function useResolvedArtwork(item) {
  const itemId = item?.id || item?.trackId || item?.playlistId || '';
  const initial = sanitizeArtworkUrl(item?.artworkUrl || item?.cover || item?.avatar, itemId);
  const [art, setArt] = useState(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = sanitizeArtworkUrl(item?.artworkUrl || item?.cover || item?.avatar, itemId);
    setArt(next);
    setFailed(false);
  }, [item?.artworkUrl, item?.cover, item?.avatar, itemId]);

  useEffect(() => {
    if ((art && !failed) || !item?.title) return;
    if (item.kind === 'profile') return;
    let cancelled = false;
    const artist = item.artistName || item.artist || '';
    const q = `${item.title} ${artist === 'Apple Music' ? '' : artist}`.trim();
    if (!q) return;
    const entity = item.kind === 'album' ? 'album' : 'song';
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=${entity}&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const raw = d?.results?.[0]?.artworkUrl100 || d?.results?.[0]?.artworkUrl60;
        if (raw) {
          const hiRes = raw.replace(/\/[0-9]+x[0-9]+([a-zA-Z0-9._-]*)$/, '/600x600$1');
          setArt(hiRes);
          setFailed(false);
          if (item) {
            item.artworkUrl = hiRes;
            item.cover = hiRes;
          }
          if (itemId) {
            _resolvedArtMem.set(itemId, hiRes);
            try { localStorage.setItem(`kyoyu-art-${itemId}`, hiRes); } catch {}
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [art, failed, item, itemId]);

  return { src: failed ? '' : art, onError: () => setFailed(true) };
}

/** Account item → the shape playSearchItem / the search queue understand */
export function toPlayable(it) {
  const art = sanitizeArtworkUrl(it.artworkUrl || it.cover, it.id);
  if (it.provider === 'soundcloud') {
    return {
      id: it.id, title: it.title, artistName: it.artistName, artworkUrl: art, duration: it.duration || 0,
      provider: 'soundcloud', providerItemId: it.permalinkUrl, scTrackId: it.trackId, trackId: it.trackId,
    };
  }
  if (it.provider === 'spotify') {
    return {
      id: it.id, title: it.title, artistName: it.artistName, artworkUrl: art, duration: it.duration || 0,
      provider: 'spotify', providerItemId: it.spotifyId || it.trackId, spotifyId: it.spotifyId || it.trackId,
      albumName: it.albumName, uri: it.uri,
    };
  }
  if (it.provider === 'applemusic') {
    const amId = it.appleMusicId || it.trackId || it.providerItemId || String(it.id || '').replace(/^am-/, '');
    return {
      id: it.id, title: it.title, artistName: it.artistName, artworkUrl: art, duration: it.duration || 0,
      provider: 'applemusic', providerItemId: amId, appleMusicId: amId, trackId: amId,
      albumName: it.albumName, url: it.url,
    };
  }
  if (it.provider === 'tidal') {
    return {
      id: it.id, title: it.title, artistName: it.artistName, artworkUrl: art, duration: it.duration || 0,
      provider: 'tidal', providerItemId: it.tidalId || it.trackId, tidalId: it.tidalId || it.trackId,
      albumName: it.albumName, url: it.url,
    };
  }
  if (it.provider === 'discogs') {
    return {
      id: it.id, title: it.title, artistName: it.artistName, artworkUrl: art, duration: it.duration || 0,
      provider: 'discogs', providerItemId: it.trackUrl || it.id, trackUrl: it.trackUrl,
      albumName: it.albumName || it.title, url: it.url,
    };
  }
  if (it.provider === 'youtube') {
    const vid = it.videoId || it.trackId || it.providerItemId || String(it.id || '').replace(/^yt-|^youtube-/, '');
    return {
      id: it.id || `yt-${vid}`, title: it.title, artistName: it.artistName || it.artist, artworkUrl: art, duration: it.duration || 0,
      provider: 'youtube', providerItemId: vid, videoId: vid, trackId: vid,
      albumName: it.albumName, url: it.url || `https://music.youtube.com/watch?v=${vid}`,
    };
  }
  return {
    id: it.id, title: it.title, artistName: it.artistName, artworkUrl: art, duration: it.duration || 0,
    provider: 'bandcamp', providerItemId: it.trackUrl, trackUrl: it.trackUrl, streamUrl: it.streamUrl || undefined,
  };
}

function Art({ item, src, round }) {
  const { src: resolvedSrc, onError } = useResolvedArtwork(item || { artworkUrl: src });
  return (
    <div style={{
      width: 64, height: 64, borderRadius: round ? 32 : 8, overflow: 'hidden', flexShrink: 0,
      background: 'rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {resolvedSrc ? <img src={resolvedSrc} alt="" onError={onError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
           : <Music2 size={22} color="rgba(255,255,255,.3)" />}
    </div>
  );
}

function Row({ item, onClick, right, sub, round }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', cursor: onClick ? 'pointer' : 'default' }}
    >
      <Art item={item} src={item.artworkUrl} round={round} isPlaylist={item.kind === 'playlist'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub ?? item.artistName}</div>
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14, flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

/** One cell of the icon view (same classes as the liked-tracks grid) */
function GridCell({ item, onClick, cols, isActive, isPlaying }) {
  const isPlaylist = item.kind === 'playlist';
  const { src: cleanSrc, onError } = useResolvedArtwork(item);
  return (
    <div className={`upl-grid-cell${isActive ? ' active' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="upl-grid-art" style={item.kind === 'profile' ? { borderRadius: '50%' } : isPlaylist ? { aspectRatio: '4/3' } : undefined}>
        {cleanSrc
          ? <img src={cleanSrc} alt={item.title} onError={onError} loading="lazy" decoding="async" style={isPlaylist ? { objectFit: 'cover' } : undefined} />
          : <div className="upl-grid-art-ph"><Music2 size={cols >= 4 ? 12 : 22} strokeWidth={1.2} /></div>}
        {isActive && (
          <div className="upl-grid-playing">
            <div className={`upl-grid-bars${isPlaying ? '' : ' paused'}`}>
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
      <div className="upl-grid-title">{item.title}</div>
      {item.artistName ? <div className="upl-grid-artist">{item.artistName}</div> : null}
    </div>
  );
}

export default function AccountItemList({ items = [], view = 'list', cols = 3, onOpenPlaylist }) {
  const { setSearchQueue, playSearchItem, state } = usePlayer();
  const [error, setError] = useState('');

  const isItemActive = (it) => {
    const cur = state?.currentTrack;
    if (!cur || !it) return false;
    if (cur.id && it.id && String(cur.id) === String(it.id)) return true;
    if (it.videoId && (cur.videoId === it.videoId || cur.providerItemId === it.videoId)) return true;
    if (it.trackUrl && (cur.providerItemId === it.trackUrl || cur.trackUrl === it.trackUrl || cur.src === it.trackUrl)) return true;
    if (it.permalinkUrl && cur.providerItemId === it.permalinkUrl) return true;
    if (it.kind === 'track' && cur.title && it.title && cur.title === it.title && (cur.artistName || cur.artist || '') === (it.artistName || '')) return true;
    return false;
  };

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

  const handlePlaylistClick = (pl) => {
    if (onOpenPlaylist) {
      onOpenPlaylist(pl);
      return;
    }
    // Fallback: post directly to native Swift playerBridge
    const ts = Date.now();
    window.__lastFastOpenTs = ts;
    try {
      window.webkit?.messageHandlers?.player?.postMessage({
        playlistOpen: true,
        nativePlaylist: {
          _ts: String(ts),
          id: pl.id,
          title: pl.title,
          cover: pl.artworkUrl || pl.cover || null,
          creator: pl.artistName || pl.creator || 'You',
          provider: pl.provider || null,
          tracks: (pl.tracks || []).map(t => ({
            id: t.id || String(Date.now() + Math.random()),
            title: t.title || t.name || 'Unknown Track',
            artist: t.artist || t.artistName || '',
            url: t.url || t.streamUrl || t.audioUrl || t.trackUrl || '',
            cover: t.artworkUrl || t.cover || null,
            provider: t.provider || pl.provider || null,
          }))
        }
      });
    } catch(e) {}
  };

  const onItemClick = (it) => {
    if (it.kind === 'playlist') return () => handlePlaylistClick(it);
    if (it.kind === 'album') {
      if (it.provider === 'spotify' || it.provider === 'applemusic' || it.provider === 'tidal' || it.provider === 'discogs' || it.provider === 'youtube') return () => handlePlaylistClick(it);
      return () => playBandcampAlbum(it);
    }
    if (it.kind === 'track') return () => playList(items, it);
    return undefined;     // profiles: display only
  };

  const safeCols = Math.min(5, Math.max(1, cols));

  return (
    <>
      {error && <p style={{ fontSize: '0.78rem', color: '#ff6b6b', marginBottom: 8 }}>{error}</p>}

      {view === 'grid' ? (
        <div className={`upl-grid upl-grid-${safeCols}`}>
          {items.map(it => (
            <GridCell
              key={it.id}
              item={it}
              cols={safeCols}
              isActive={isItemActive(it)}
              isPlaying={!!state?.isPlaying}
              onClick={onItemClick(it)}
            />
          ))}
        </div>
      ) : (
        items.map(it => {
          if (it.kind === 'playlist') {
            return (
              <Row
                key={it.id}
                item={it}
                sub={`${it.artistName}${it.trackCount ? ` · ${it.trackCount} tracks` : ''}${it.owner === 'liked' ? ' · liked' : ''}${it.isPrivate ? ' · private' : ''}`}
                onClick={onItemClick(it)}
                right={<Play size={20} color="rgba(255,255,255,.6)" fill="rgba(255,255,255,.6)" />}
              />
            );
          }
          // ── followed profiles (SoundCloud / Bandcamp) ──
          if (it.kind === 'profile') {
            return <Row key={it.id} item={it} round sub={it.followers ? `${it.followers.toLocaleString()} followers` : (it.artistName || '')} />;
          }
          // ── albums / tracks ──
          return (
            <Row key={it.id} item={it}
                 sub={`${it.artistName}${it.kind === 'track' && it.duration ? ` · ${fmt(it.duration)}` : ''}`}
                 onClick={onItemClick(it)}
                 right={<Play size={20} color="rgba(255,255,255,.6)" fill="rgba(255,255,255,.6)" />} />
          );
        })
      )}
    </>
  );
}
