import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Play, Music2 } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { cleanTrackOrReleaseTitle, splitCleanMetadata } from '../lib/streaming';

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
    if (s && s !== 'undefined' && s !== 'null' && !s.includes('spacer.gif') && /^(https?:\/\/|data:|blob:|\/)/i.test(s)) {
      const dim = hiRes ? '600' : '300';
      let url = s
        .replace('{w}', dim)
        .replace('{h}', dim)
        .replace('{f}', 'jpg')
        .replace('{c}', 'bb');
      if (url.includes('bcbits.com')) {
        // Heal any 32-bit signed int overflow URLs cached in localStorage (e.g. /img/a-403732729_10.jpg -> unsigned 10-digit ID)
        url = url.replace(/\/img\/(a?)-(\d+)_(\d+\.(?:jpg|png|webp))/i, (_, prefix, negDigits, tail) => {
          const unsigned = 4294967296 - Number(negDigits);
          if (Number.isFinite(unsigned) && unsigned > 0) {
            return `/img/${prefix}${String(unsigned).padStart(10, '0')}_${tail}`;
          }
          return `/img/${prefix}${negDigits}_${tail}`;
        });
        // Pad any unpadded short album art IDs (/img/a123456789_10.jpg -> 10 digits)
        url = url.replace(/\/img\/a(\d{1,9})_(\d+\.(?:jpg|png|webp))/i, (_, digits, tail) => {
          return `/img/a${String(digits).padStart(10, '0')}_${tail}`;
        });
        if (/\/img\/a\d+_/i.test(url)) {
          url = url.replace(/_[0-9]+\.jpg/i, '_10.jpg');
        }
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
    if (isFakePrivateArt) return;
    let cancelled = false;

    const applyResolvedThumb = (rawUrl) => {
      const thumb = sanitizeArtworkUrl(rawUrl, itemId, false);
      if (!thumb || cancelled) return false;
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
      return true;
    };

    const exactCatId = getExactAppleMusicCatalogId(item);
    if (exactCatId) {
      fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(exactCatId)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          const raw = d?.results?.[0]?.artworkUrl100 || d?.results?.[0]?.artworkUrl60;
          if (raw) applyResolvedThumb(raw.replace(/\/[0-9]+x[0-9]+([a-zA-Z0-9._-]*)$/, '/300x300$1'));
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }

    const bcUrl = String(item?.albumUrl || item?.trackUrl || item?.url || '');
    const title = String(item?.title || item?.album || '').trim();
    const artist = String(item?.artistName || item?.artist || '').trim();
    if (!bcUrl && !title && !artist) return;

    (async () => {
      if (bcUrl.includes('bandcamp.com')) {
        try {
          const bcRes = await fetch('/api/bandcamp-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch-album', albumUrl: bcUrl }),
          }).then(r => (r.ok ? r.json() : null));
          const bcCov = bcRes?.album?.artworkUrl || bcRes?.album?.cover;
          if (bcCov && applyResolvedThumb(bcCov)) return;
        } catch {}
      }

      if (title || artist) {
        try {
          const q = `${artist} ${title}`.trim();
          const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=3`)
            .then(r => (r.ok ? r.json() : null));
          const rawIt = itRes?.results?.[0]?.artworkUrl100 || itRes?.results?.[0]?.artworkUrl60;
          if (rawIt && applyResolvedThumb(rawIt.replace(/\/[0-9]+x[0-9]+([a-zA-Z0-9._-]*)$/, '/600x600$1'))) return;
        } catch {}
      }
    })();

    return () => { cancelled = true; };
  }, [art, failed, item, itemId, isFakePrivateArt]);

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
  const meta = splitCleanMetadata(it.title, it.artistName || it.artist || '', it.label || it.labelName || '', it.albumName || it.album || '');
  const cleanTitle = meta.title || it.title;
  const cleanArtist = meta.artist || it.artistName || it.artist || '';
  const cleanLabel = meta.label || it.label || it.labelName || undefined;
  const cleanAlbum = meta.album || it.albumName || it.album || undefined;
  if (it.provider === 'soundcloud') {
    return {
      id: it.id, title: cleanTitle, artistName: cleanArtist, label: cleanLabel, albumName: cleanAlbum, artworkUrl: art, duration: it.duration || 0,
      provider: 'soundcloud', providerItemId: it.permalinkUrl, scTrackId: it.trackId, trackId: it.trackId,
    };
  }
  if (it.provider === 'spotify') {
    return {
      id: it.id, title: cleanTitle, artistName: cleanArtist, label: cleanLabel, artworkUrl: art, duration: it.duration || 0,
      provider: 'spotify', providerItemId: it.spotifyId || it.trackId, spotifyId: it.spotifyId || it.trackId,
      albumName: cleanAlbum, uri: it.uri,
    };
  }
  if (it.provider === 'applemusic') {
    const amId = it.appleMusicId || it.trackId || it.providerItemId || String(it.id || '').replace(/^am-/, '');
    return {
      id: it.id, title: cleanTitle, artistName: cleanArtist, label: cleanLabel, artworkUrl: art, duration: it.duration || 0,
      provider: 'applemusic', providerItemId: amId, appleMusicId: amId, trackId: amId,
      albumName: cleanAlbum, url: it.url,
    };
  }
  if (it.provider === 'tidal') {
    return {
      id: it.id, title: cleanTitle, artistName: cleanArtist, label: cleanLabel, artworkUrl: art, duration: it.duration || 0,
      provider: 'tidal', providerItemId: it.tidalId || it.trackId, tidalId: it.tidalId || it.trackId,
      albumName: cleanAlbum, url: it.url,
    };
  }
  if (it.provider === 'discogs') {
    return {
      id: it.id, title: cleanTitle, artistName: cleanArtist, label: cleanLabel, artworkUrl: art, duration: it.duration || 0,
      provider: 'discogs', providerItemId: it.trackUrl || it.id, trackUrl: it.trackUrl,
      albumName: cleanAlbum || cleanTitle, url: it.url, year: it.year || undefined,
    };
  }
  if (it.provider === 'youtube') {
    const vid = it.videoId || it.trackId || it.providerItemId || String(it.id || '').replace(/^yt-|^youtube-/, '');
    return {
      id: it.id || `yt-${vid}`, title: cleanTitle, artistName: cleanArtist, label: cleanLabel, artworkUrl: art, duration: it.duration || 0,
      provider: 'youtube', providerItemId: vid, videoId: vid, trackId: vid,
      albumName: cleanAlbum, url: it.url || `https://music.youtube.com/watch?v=${vid}`,
    };
  }
  return {
    id: it.id, title: cleanTitle, artistName: cleanArtist, label: cleanLabel, albumName: cleanAlbum, year: it.year || undefined,
    artworkUrl: art, duration: it.duration || 0,
    provider: 'bandcamp', providerItemId: it.trackUrl, trackUrl: it.trackUrl, streamUrl: it.streamUrl || undefined,
  };
}

export function isBandcampPlaylistItem(item) {
  if (!item) return false;
  const id = String(item.id || item.playlistId || '');
  if (id.startsWith('bandcamp-pl') || id.startsWith('bc-basket-') || id.startsWith('bcbasket-')) return true;
  if (item.isBandcampBasket) return true;
  return item.kind === 'playlist' && String(item.provider || '').toLowerCase() === 'bandcamp';
}

let _lastLongPressActionTs = 0;

export function openContentActionCard(rawItem) {
  if (!rawItem) return;
  _lastLongPressActionTs = Date.now();
  const title = String(rawItem.title || rawItem.album || rawItem.name || 'Untitled').trim();
  const artist = String(rawItem.artistName || rawItem.artist || rawItem.sub || '').trim();
  const artwork = sanitizeArtworkUrl(rawItem.artworkUrl || rawItem.cover || rawItem.avatar || '', rawItem.id, false);
  const provider = String(rawItem.provider || 'kyoyu').toLowerCase();
  const type = String(rawItem.kind || rawItem.entityType || rawItem.type || 'album').toLowerCase();
  const url = String(rawItem.url || rawItem.trackUrl || rawItem.albumUrl || rawItem.permalinkUrl || '').trim();
  const id = String(rawItem.id || rawItem.postId || rawItem.trackId || rawItem.playlistId || `${artist}|${title}`).trim();
  const itemPayload = { id, title, artist, artwork, provider, type, url };
  try {
    window.webkit?.messageHandlers?.player?.postMessage({
      cmd: 'open_content_action_card',
      item: itemPayload,
    });
  } catch {}
}

export function useLongPressContentAction(item) {
  const timerRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const triggeredRef = useRef(false);
  const itemRef = useRef(item);
  itemRef.current = item;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onTouchStart = useCallback((e) => {
    triggeredRef.current = false;
    const t = e.touches?.[0];
    if (!t) return;
    startPosRef.current = { x: t.clientX, y: t.clientY };
    clearTimer();
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      openContentActionCard(itemRef.current);
    }, 460);
  }, [clearTimer]);

  const onTouchMove = useCallback((e) => {
    if (!timerRef.current) return;
    const t = e.touches?.[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - startPosRef.current.x);
    const dy = Math.abs(t.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimer();
    }
  }, [clearTimer]);

  const onTouchEnd = useCallback((e) => {
    clearTimer();
    if (triggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [clearTimer]);

  const onContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimer();
    triggeredRef.current = true;
    openContentActionCard(itemRef.current);
  }, [clearTimer]);

  const wrapClick = useCallback((fn) => {
    if (!fn) return undefined;
    return (e) => {
      if (triggeredRef.current || Date.now() - _lastLongPressActionTs < 650) {
        triggeredRef.current = false;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        return;
      }
      fn(e);
    };
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: clearTimer,
    onContextMenu,
    wrapClick,
  };
}

export function usePinnedAndHiddenContent() {
  const readList = (key) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const [pinnedItems, setPinnedItems] = useState(() => readList('kyoyu-pinned-content-v1'));
  const [hiddenItems, setHiddenItems] = useState(() => readList('kyoyu-hidden-content-v1'));

  useEffect(() => {
    const sync = () => {
      setPinnedItems(readList('kyoyu-pinned-content-v1'));
      setHiddenItems(readList('kyoyu-hidden-content-v1'));
    };
    window.addEventListener('kyoyu-pinned-hidden-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('kyoyu-pinned-hidden-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const hiddenKeys = useRef(new Set());
  const nextSet = new Set();
  for (const h of hiddenItems) {
    if (!h) continue;
    if (h.id) nextSet.add(`id::${String(h.id).toLowerCase()}`);
    const t = String(h.title || '').trim().toLowerCase();
    const a = String(h.artist || '').trim().toLowerCase();
    if (t) nextSet.add(`ta::${a}|${t}`);
  }
  hiddenKeys.current = nextSet;

  const isItemHidden = useCallback((it) => {
    if (!it || hiddenKeys.current.size === 0) return false;
    const id = String(it.id || it.postId || it.trackId || it.playlistId || '').toLowerCase();
    if (id && hiddenKeys.current.has(`id::${id}`)) return true;
    const t = String(it.title || it.album || it.name || '').trim().toLowerCase();
    const a = String(it.artistName || it.artist || '').trim().toLowerCase();
    if (t && hiddenKeys.current.has(`ta::${a}|${t}`)) return true;
    return false;
  }, [hiddenItems]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pinnedItems, hiddenItems, isItemHidden };
}

const Art = memo(function Art({ item, src, round }) {
  const { src: resolvedSrc, onError } = useResolvedArtwork(item || { artworkUrl: src });
  const isBcPl = item?.kind === 'playlist' && (item?.provider === 'bandcamp' || String(item?.id || '').startsWith('bcpl-'));
  const isCustomCover = Boolean(item?.hasCustomCover || String(resolvedSrc || '').startsWith('data:'));
  return (
    <div style={{
      width: 64, height: 64, borderRadius: round ? 32 : 8, overflow: 'hidden', flexShrink: 0,
      background: 'var(--grey-800)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt=""
          onError={onError}
          style={(isBcPl && !isCustomCover)
            ? { position: 'absolute', top: 0, left: 0, height: '100%', width: 'auto', minWidth: '100%', maxWidth: 'none', objectFit: 'cover', objectPosition: 'left center', display: 'block' }
            : { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }}
          loading="eager"
          decoding="sync"
        />
      ) : <Music2 size={22} color="var(--text-dim)" />}
    </div>
  );
});

const Row = memo(function Row({ item, onClick, right, sub, round }) {
  const isProfile = item.kind === 'profile';
  const meta = isProfile ? { title: item.title, artist: item.artistName } : splitCleanMetadata(item.title, item.artistName || item.artist || '', item.label || item.labelName || '');
  const displayTitle = meta.title || item.title;
  const displayArtist = sub ?? (meta.artist || item.artistName);
  const lp = useLongPressContentAction({ ...item, title: displayTitle, artistName: displayArtist });
  return (
    <div
      onClick={lp.wrapClick(onClick)}
      onTouchStart={lp.onTouchStart}
      onTouchMove={lp.onTouchMove}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      onContextMenu={lp.onContextMenu}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', cursor: onClick ? 'pointer' : 'default' }}
    >
      <Art item={item} src={item.artworkUrl} round={round} isPlaylist={item.kind === 'playlist'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayArtist}</div>
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14, flexShrink: 0 }}>{right}</div>}
    </div>
  );
});

/** One cell of the icon view (same classes as the liked-tracks grid) */
const GridCell = memo(function GridCell({ item, onSelect, cols, isActive, isPlaying }) {
  const isProfile = item.kind === 'profile';
  const isBcPl = item?.kind === 'playlist' && (item?.provider === 'bandcamp' || String(item?.id || '').startsWith('bcpl-'));
  const { src: cleanSrc, onError } = useResolvedArtwork(item);
  const isCustomCover = Boolean(item?.hasCustomCover || String(cleanSrc || '').startsWith('data:'));
  const meta = isProfile ? { title: item.title, artist: item.artistName } : splitCleanMetadata(item.title, item.artistName || item.artist || '', item.label || item.labelName || '');
  const displayTitle = meta.title || item.title;
  const displayArtist = meta.artist || item.artistName;
  const lp = useLongPressContentAction({ ...item, title: displayTitle, artistName: displayArtist });
  const handleClick = onSelect ? lp.wrapClick(() => onSelect(item)) : undefined;
  return (
    <div
      className={`upl-grid-cell${isActive ? ' active' : ''}`}
      onClick={handleClick}
      onTouchStart={lp.onTouchStart}
      onTouchMove={lp.onTouchMove}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      onContextMenu={lp.onContextMenu}
      style={{ cursor: onSelect ? 'pointer' : 'default' }}
    >
      <div className="upl-grid-art" style={isProfile ? { borderRadius: '50%' } : { aspectRatio: '1/1', overflow: 'hidden', position: 'relative' }}>
        {cleanSrc
          ? (
            <img
              src={cleanSrc}
              alt={displayTitle}
              onError={onError}
              loading="eager"
              decoding="sync"
              style={(isBcPl && !isCustomCover)
                ? { position: 'absolute', top: 0, left: 0, height: '100%', width: 'auto', minWidth: '100%', maxWidth: 'none', objectFit: 'cover', objectPosition: 'left center', display: 'block' }
                : { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }}
            />
          )
          : <div className="upl-grid-art-ph"><Music2 size={cols >= 4 ? 12 : 22} strokeWidth={1.2} /></div>}
        {isActive && (
          <div className="upl-grid-playing">
            <div className={`upl-grid-bars${isPlaying ? '' : ' paused'}`}>
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
      <div className="upl-grid-title">{displayTitle}</div>
      {displayArtist ? <div className="upl-grid-artist">{displayArtist}</div> : null}
    </div>
  );
});

const AccountItemList = memo(function AccountItemList({ items = [], view = 'list', cols = 3, onOpenPlaylist }) {
  const { setSearchQueue, playSearchItem, state } = usePlayer();
  const { isItemHidden } = usePinnedAndHiddenContent();
  const visibleItems = items.filter(it => !isItemHidden(it));
  const [error] = useState('');
  const itemsRef = useRef(visibleItems);
  itemsRef.current = visibleItems;
  const onOpenPlaylistRef = useRef(onOpenPlaylist);
  onOpenPlaylistRef.current = onOpenPlaylist;
  const setSearchQueueRef = useRef(setSearchQueue);
  setSearchQueueRef.current = setSearchQueue;
  const playSearchItemRef = useRef(playSearchItem);
  playSearchItemRef.current = playSearchItem;

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

  const handleSelect = useCallback(async (it) => {
    if (!it || it.kind === 'profile') return;
    const handlePlaylistClick = async (pl) => {
      if (onOpenPlaylistRef.current) {
        onOpenPlaylistRef.current(pl);
        return;
      }
      // Fallback: post directly to native Swift playerBridge
      const ts = Date.now();
      window.__lastFastOpenTs = ts;
      const isAlbum = pl.kind === 'album';
      const rawCreator = pl.artistName || pl.artist || pl.creator || 'You';
      const meta = splitCleanMetadata(pl.title, rawCreator, pl.label || pl.labelName || '');
      let creator = meta.artist || rawCreator;
      let cleanAlbumTitle = meta.title || pl.title;
      let resolvedLabel = meta.label || pl.label || pl.labelName || null;
      let resolvedYear = pl.year ? String(pl.year) : null;
      const cover = pl.artworkUrl || pl.cover || null;

      const postSheet = (tracksList) => {
        const mappedTracks = (tracksList || []).map(t => {
          const tm = splitCleanMetadata(t.title || t.name || 'Unknown Track', t.artist || t.artistName || creator || '', resolvedLabel || '');
          const isPlayable = t.playable !== false && !t.unplayable && t.isPlayable !== false;
          return {
            id: t.id || String(Date.now() + Math.random()),
            title: tm.title || t.title || t.name || 'Unknown Track',
            artist: tm.artist || t.artist || t.artistName || creator || '',
            url: t.url || t.streamUrl || t.audioUrl || t.trackUrl || '',
            streamUrl: t.streamUrl || t.audioUrl || '',
            cover: t.artworkUrl || t.cover || cover || null,
            provider: t.provider || pl.provider || null,
            playable: isPlayable,
            unplayable: !isPlayable,
          };
        });
        try {
          if (isAlbum) {
            window.webkit?.messageHandlers?.player?.postMessage({
              albumOpen: true,
              nativeAlbum: {
                _ts: String(ts),
                id: pl.id,
                title: cleanAlbumTitle,
                artist: creator,
                cover,
                genre: pl.genre || null,
                year: resolvedYear,
                label: resolvedLabel,
                provider: pl.provider || null,
                isPreorder: Boolean(pl.isPreorder),
                tracks: mappedTracks,
              }
            });
          } else {
            window.webkit?.messageHandlers?.player?.postMessage({
              playlistOpen: true,
              nativePlaylist: {
                _ts: String(ts),
                id: pl.id,
                title: cleanAlbumTitle,
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
          if (data.album) {
            if (data.album.label && !resolvedLabel) resolvedLabel = data.album.label;
            if (data.album.year && !resolvedYear) resolvedYear = String(data.album.year);
            if (data.album.artistName) {
              const m2 = splitCleanMetadata(data.album.title || cleanAlbumTitle, data.album.artistName, resolvedLabel || '');
              creator = m2.artist || creator;
              cleanAlbumTitle = m2.title || cleanAlbumTitle;
              if (m2.label && !resolvedLabel) resolvedLabel = m2.label;
            }
          }
          const now = Date.now();
          const tracks = (data.tracks || []).map((t, i) => {
            const isPlayable = t.playable !== false && !t.unplayable;
            return {
              id: `bc-${t.trackId || i}`,
              kind: 'track',
              provider: 'bandcamp',
              title: cleanTrackOrReleaseTitle(t.title, t.artistName || creator),
              artist: t.artistName || creator,
              artistName: t.artistName || creator,
              label: resolvedLabel || undefined,
              year: resolvedYear || undefined,
              artworkUrl: t.artworkUrl || cover,
              cover: t.artworkUrl || cover,
              duration: t.duration || 0,
              streamUrl: t.streamUrl || '',
              audioUrl: t.streamUrl || '',
              url: t.streamUrl || t.trackUrl || '',
              trackUrl: t.trackUrl || '',
              providerItemId: t.trackUrl || '',
              streamFetchedAt: t.streamUrl ? now : undefined,
              playable: isPlayable,
              unplayable: !isPlayable,
            };
          });
          if (tracks.length > 0) {
            pl.tracks = tracks;
            pl.label = resolvedLabel || pl.label;
            pl.year = resolvedYear || pl.year;
            pl.isPreorder = Boolean(data.isPreorder || data.album?.isPreorder || tracks.some(t => !t.playable));
            if (!window.__lastFastOpenTs || String(window.__lastFastOpenTs) === String(ts)) {
              postSheet(tracks);
            }
          }
        } catch {}
      }
    };

    if (it.kind === 'playlist') {
      await handlePlaylistClick(it);
      return;
    }
    if (isAlbumItem(it)) {
      it.kind = 'album';
      await handlePlaylistClick(it);
      return;
    }
    if (it.kind === 'track') {
      const list = itemsRef.current || [];
      const queue = list.filter(x => x.kind === 'track' && !isAlbumItem(x)).map(toPlayable);
      const playable = toPlayable(it);
      const idx = queue.findIndex(q => q.id === it.id);
      setSearchQueueRef.current(queue.length > 0 ? queue : [playable], idx >= 0 ? idx : 0);
      playSearchItemRef.current(playable);
    }
  }, []);

  const safeCols = Math.min(5, Math.max(1, cols));

  return (
    <>
      {error && <p style={{ fontSize: '0.78rem', color: '#ff6b6b', marginBottom: 8 }}>{error}</p>}

      {view === 'grid' ? (
        <div className={`upl-grid upl-grid-${safeCols}`}>
          {visibleItems.map(it => (
            <GridCell
              key={it.id}
              item={it}
              cols={safeCols}
              isActive={isItemActive(it)}
              isPlaying={!!state?.isPlaying}
              onSelect={it.kind === 'profile' ? undefined : handleSelect}
            />
          ))}
        </div>
      ) : (
        visibleItems.map(it => {
          if (it.kind === 'playlist') {
            return (
              <Row
                key={it.id}
                item={it}
                sub={`${it.artistName}${it.trackCount ? ` · ${it.trackCount} tracks` : ''}${it.owner === 'liked' ? ' · liked' : ''}${it.isPrivate ? ' · private' : ''}`}
                onClick={() => handleSelect(it)}
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
                 onClick={() => handleSelect(it)}
                 right={<Play size={20} color="var(--text-secondary)" fill="var(--text-secondary)" />} />
          );
        })
      )}
    </>
  );
});

export default AccountItemList;
