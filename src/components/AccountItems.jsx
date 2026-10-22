import { useState, useEffect, memo } from 'react';
import { Play, Music2 } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';

/* Items coming from a connected SoundCloud / Bandcamp account (tracks, albums, playlists, followed profiles)
   with tap-to-play, as a list or as an icon grid (same look as the liked tracks). Shared by the account page and the Library. */

const fmt = (s) => {
  const n = Math.round(Number(s) || 0);
  return n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '';
};

const _resolvedArtMem = new Map();
const _pinnedPageImages = new Map();
const MAX_PINNED_PAGE_IMAGES = 320;

/**
 * Pins a compact thumbnail in a bounded LRU Image() cache so scrolling down
 * and back up on the same page never unloads or re-decodes already-loaded art.
 */
export function pinImageInMemory(rawUrl, itemId) {
  if (typeof window === 'undefined' || !rawUrl) return '';
  const url = sanitizeArtworkUrl(rawUrl, itemId, false);
  if (!url) return '';
  if (_pinnedPageImages.has(url)) {
    const existing = _pinnedPageImages.get(url);
    _pinnedPageImages.delete(url);
    _pinnedPageImages.set(url, existing);
    return url;
  }
  try {
    const img = new Image();
    img.decoding = 'sync';
    img.loading = 'eager';
    img.src = url;
    if (typeof img.decode === 'function') {
      img.decode().catch(() => {});
    }
    _pinnedPageImages.set(url, img);
    while (_pinnedPageImages.size > MAX_PINNED_PAGE_IMAGES) {
      const oldestKey = _pinnedPageImages.keys().next().value;
      if (!oldestKey) break;
      _pinnedPageImages.delete(oldestKey);
    }
  } catch (_) {}
  return url;
}

export function preloadImagesInMemory(items, maxCount = 18) {
  if (typeof window === 'undefined' || !Array.isArray(items) || !items.length) return;
  const limit = Math.min(items.length, Math.max(1, Math.min(maxCount, 24)));
  for (let i = 0; i < limit; i++) {
    const it = items[i];
    if (!it) continue;
    const raw = it.artworkUrl || it.cover || it.avatar || it.releaseCover;
    if (raw) pinImageInMemory(raw, it.id || it.trackId || it.playlistId);
  }
}

// Clean up any previously cached false-positive artworks for private Apple Music uploads (e.g. am-i.* / i.*)
if (typeof window !== 'undefined') {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('kyoyu-art-') && (!/^kyoyu-art-[0-9a-f-]{20,}-/i.test(k) || /-am-i\.|-i\./i.test(k))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    const histRaw = localStorage.getItem('kyoyu-play-history');
    if (histRaw) {
      const hist = JSON.parse(histRaw);
      if (Array.isArray(hist)) {
        let changed = false;
        const cleaned = hist.map((h) => {
          if (!h) return h;
          const hid = String(h.id || '');
          const htid = String(h.trackId || h.providerItemId || h.appleMusicId || '');
          if (hid.startsWith('am-i.') || htid.startsWith('i.')) {
            if (h.cover || h.artworkUrl || h.releaseCover) {
              changed = true;
              return { ...h, cover: '', artworkUrl: '', releaseCover: '' };
            }
          }
          return h;
        });
        if (changed) {
          localStorage.setItem('kyoyu-play-history', JSON.stringify(cleaned));
          window.dispatchEvent(new CustomEvent('kyoyu-play-history-changed'));
        }
      }
    }

    const likedRaw = localStorage.getItem('kyoyu-liked-uploads');
    if (likedRaw) {
      const liked = JSON.parse(likedRaw);
      if (Array.isArray(liked)) {
        let changed = false;
        const cleanedLiked = liked.map((item) => {
          if (!item) return item;
          const lid = String(item.id || '');
          const ltid = String(item.trackId || item.providerItemId || item.appleMusicId || '');
          if (lid.startsWith('am-i.') || ltid.startsWith('i.')) {
            if (item.cover || item.artworkUrl || item.releaseCover) {
              changed = true;
              return { ...item, cover: '', artworkUrl: '', releaseCover: '' };
            }
          }
          return item;
        });
        if (changed) {
          localStorage.setItem('kyoyu-liked-uploads', JSON.stringify(cleanedLiked));
        }
      }
    }
  } catch {}
}

export function sanitizeArtworkUrl(raw, itemId, hiRes = false) {
  if (itemId && (/^am-i\./i.test(String(itemId)) || /^i\./i.test(String(itemId)))) {
    // Private library items should only use genuine artwork when not accompanied by an invented catalogId
  }
  if (raw && typeof raw === 'string') {
    const s = raw.trim();
    if (s && s !== 'undefined' && s !== 'null' && /^(https?:\/\/|data:|blob:|\/)/i.test(s)) {
      const dim = hiRes ? '600' : '300';
      let url = s
        .replace('{w}', dim)
        .replace('{h}', dim)
        .replace('{f}', 'jpg')
        .replace('{c}', 'bb');
      if (url.includes('bcbits.com')) {
        url = url.replace(/_[0-9]+\.jpg/, hiRes ? '_10.jpg' : '_14.jpg');
      } else if (url.includes('mzstatic.com')) {
        url = url.replace(/\/[0-9]+x[0-9]+(bb|cc|sr|bf)?\.(jpg|jpeg|png|webp)/i, `/${dim}x${dim}$1.$2`);
      } else if (!hiRes && url.includes('sndcdn.com')) {
        url = url.replace(/-t500x500\./i, '-t300x300.');
      } else if (!hiRes && url.includes('resources.tidal.com')) {
        url = url.replace(/\/(640x640|1280x1280|750x750)\.jpg/i, '/320x320.jpg');
      }
      return url;
    }
  }
  if (itemId && _resolvedArtMem.has(itemId)) {
    return _resolvedArtMem.get(itemId);
  }
  return '';
}

function getExactAppleMusicCatalogId(item) {
  if (!item || item.provider !== 'applemusic') return '';
  const tid = String(item.trackId || item.providerItemId || item.appleMusicId || '');
  const aid = String(item.albumId || '');
  const id = String(item.id || '').replace(/^am-(?:alb-|al-|pl-)?/, '');
  // Private uploaded tracks have library IDs starting with "i." or "l." or "p." — never look those up on iTunes
  if (tid.startsWith('i.') || aid.startsWith('l.') || id.startsWith('i.') || id.startsWith('l.') || id.startsWith('p.')) {
    return '';
  }
  for (const cand of [tid, aid, id]) {
    if (/^\d+$/.test(cand)) return cand;
  }
  return '';
}

function useResolvedArtwork(item) {
  const itemId = item?.id || item?.trackId || item?.playlistId || '';
  const tid = String(item?.trackId || item?.providerItemId || item?.appleMusicId || '');
  const aid = String(item?.albumId || '');
  const isFakePrivateArt =
    item?.provider === 'applemusic' &&
    (((tid.startsWith('i.') || String(itemId).startsWith('am-i.')) && !!item?.catalogId) ||
     (aid.startsWith('l.') && !!item?.catalogId));

  const rawArt = isFakePrivateArt ? '' : (item?.artworkUrl || item?.cover || item?.avatar);
  const initial = sanitizeArtworkUrl(rawArt, itemId, false);
  if (initial) pinImageInMemory(initial, itemId);
  const [art, setArt] = useState(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const nextRaw = isFakePrivateArt ? '' : (item?.artworkUrl || item?.cover || item?.avatar);
    const next = sanitizeArtworkUrl(nextRaw, itemId, false);
    if (next) pinImageInMemory(next, itemId);
    setArt(prev => {
      if (prev !== next) setFailed(false);
      return next;
    });
  }, [item?.artworkUrl, item?.cover, item?.avatar, itemId, isFakePrivateArt]);

  useEffect(() => {
    if (art && !failed) return;
    // Only resolve via exact numeric Apple Music catalog ID — never search by title/artist
    const exactCatId = getExactAppleMusicCatalogId(item);
    if (!exactCatId) return;
    let cancelled = false;
    fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(exactCatId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const raw = d?.results?.[0]?.artworkUrl100 || d?.results?.[0]?.artworkUrl60;
        if (raw) {
          const thumb = raw.replace(/\/[0-9]+x[0-9]+([a-zA-Z0-9._-]*)$/, '/300x300$1');
          pinImageInMemory(thumb, itemId);
          setArt(thumb);
          setFailed(false);
          if (item) {
            item.artworkUrl = thumb;
            item.cover = thumb;
          }
          if (itemId) {
            _resolvedArtMem.set(itemId, thumb);
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
  const tid = String(it?.trackId || it?.providerItemId || it?.appleMusicId || '');
  const aid = String(it?.albumId || '');
  const isFakePrivateArt =
    it?.provider === 'applemusic' &&
    (((tid.startsWith('i.') || String(it?.id || '').startsWith('am-i.')) && !!it?.catalogId) ||
     (aid.startsWith('l.') && !!it?.catalogId));
  const art = isFakePrivateArt ? '' : sanitizeArtworkUrl(it.artworkUrl || it.cover, it.id, true);
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

const Art = memo(function Art({ item, src, round }) {
  const { src: resolvedSrc, onError } = useResolvedArtwork(item || { artworkUrl: src });
  return (
    <div style={{
      width: 64, height: 64, borderRadius: round ? 32 : 8, overflow: 'hidden', flexShrink: 0,
      background: 'var(--grey-800)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {resolvedSrc ? <img src={resolvedSrc} alt="" onError={onError} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="eager" decoding="sync" />
           : <Music2 size={22} color="var(--text-dim)" />}
    </div>
  );
});

const Row = memo(function Row({ item, onClick, right, sub, round }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', cursor: onClick ? 'pointer' : 'default' }}
    >
      <Art item={item} src={item.artworkUrl} round={round} isPlaylist={item.kind === 'playlist'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub ?? item.artistName}</div>
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14, flexShrink: 0 }}>{right}</div>}
    </div>
  );
});

/** One cell of the icon view (same classes as the liked-tracks grid) */
const GridCell = memo(function GridCell({ item, onClick, cols, isActive, isPlaying }) {
  const isPlaylist = item.kind === 'playlist';
  const { src: cleanSrc, onError } = useResolvedArtwork(item);
  return (
    <div className={`upl-grid-cell${isActive ? ' active' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="upl-grid-art" style={item.kind === 'profile' ? { borderRadius: '50%' } : isPlaylist ? { aspectRatio: '4/3' } : undefined}>
        {cleanSrc
          ? <img src={cleanSrc} alt={item.title} onError={onError} loading="eager" decoding="sync" style={isPlaylist ? { objectFit: 'cover' } : undefined} />
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
});

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

  const isAlbumItem = (it) => {
    if (!it || it.kind === 'playlist' || it.kind === 'profile') return false;
    const u = String(it.trackUrl || it.url || '');
    if (it.provider === 'bandcamp') {
      if (u.includes('/track/')) return false;
      if (u.includes('/album/')) return true;
    }
    return it.kind === 'album';
  };

  const playList = (list, item) => {
    const queue = list.filter(x => x.kind === 'track' && !isAlbumItem(x)).map(toPlayable);
    const playable = toPlayable(item);
    const idx = queue.findIndex(q => q.id === item.id);
    setSearchQueue(queue.length > 0 ? queue : [playable], idx >= 0 ? idx : 0);
    playSearchItem(playable);
  };

  const handlePlaylistClick = async (pl) => {
    if (onOpenPlaylist) {
      onOpenPlaylist(pl);
      return;
    }
    // Fallback: post directly to native Swift playerBridge
    const ts = Date.now();
    window.__lastFastOpenTs = ts;
    const isAlbum = pl.kind === 'album';
    const creator = pl.artistName || pl.creator || 'You';
    const cover = pl.artworkUrl || pl.cover || null;

    const postSheet = (tracksList) => {
      const mappedTracks = (tracksList || []).map(t => ({
        id: t.id || String(Date.now() + Math.random()),
        title: t.title || t.name || 'Unknown Track',
        artist: t.artist || t.artistName || creator || '',
        url: t.url || t.streamUrl || t.audioUrl || t.trackUrl || '',
        cover: t.artworkUrl || t.cover || cover || null,
        provider: t.provider || pl.provider || null,
      }));
      try {
        if (isAlbum) {
          window.webkit?.messageHandlers?.player?.postMessage({
            albumOpen: true,
            nativeAlbum: {
              _ts: String(ts),
              id: pl.id,
              title: pl.title,
              artist: creator,
              cover,
              genre: pl.genre || null,
              year: pl.year ? String(pl.year) : null,
              label: pl.label || null,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        } else {
          window.webkit?.messageHandlers?.player?.postMessage({
            playlistOpen: true,
            nativePlaylist: {
              _ts: String(ts),
              id: pl.id,
              title: pl.title,
              cover,
              creator,
              provider: pl.provider || null,
              tracks: mappedTracks,
            }
          });
        }
      } catch(e) {}
    };

    const initialTracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    postSheet(initialTracks);

    if (!initialTracks.length && pl.provider === 'bandcamp' && (pl.trackUrl || pl.url)) {
      try {
        const r = await fetch('/api/bandcamp-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch-album', albumUrl: pl.trackUrl || pl.url }),
        });
        const data = r.ok ? await r.json() : { tracks: [] };
        const now = Date.now();
        const tracks = (data.tracks || []).map((t, i) => ({
          id: `bc-${t.trackId || i}`,
          kind: 'track',
          provider: 'bandcamp',
          title: t.title,
          artist: t.artistName || creator,
          artistName: t.artistName || creator,
          artworkUrl: t.artworkUrl || cover,
          cover: t.artworkUrl || cover,
          duration: t.duration || 0,
          streamUrl: t.streamUrl || '',
          audioUrl: t.streamUrl || '',
          url: t.streamUrl || t.trackUrl || '',
          trackUrl: t.trackUrl || '',
          providerItemId: t.trackUrl || '',
          streamFetchedAt: t.streamUrl ? now : undefined,
        }));
        if (tracks.length > 0) {
          pl.tracks = tracks;
          if (!window.__lastFastOpenTs || String(window.__lastFastOpenTs) === String(ts)) {
            postSheet(tracks);
          }
        }
      } catch {}
    }
  };

  const onItemClick = (it) => {
    if (it.kind === 'playlist') return () => handlePlaylistClick(it);
    if (isAlbumItem(it)) return () => {
      it.kind = 'album';
      handlePlaylistClick(it);
    };
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
                right={<Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />}
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
                 right={<Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />} />
          );
        })
      )}
    </>
  );
}
