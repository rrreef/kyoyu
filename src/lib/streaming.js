// ── Premium streaming services (Apple Music, Spotify) ──
// Thin wrapper around the native iOS bridge (Kyoyu/StreamingBridge.swift).
// Only available inside the iOS app; on the website every call resolves to "unavailable".

import { useEffect, useState } from 'react';

export const SERVICES = ['applemusic', 'spotify', 'tidal'];
export const SERVICE_LABELS = { applemusic: 'Apple Music', spotify: 'Spotify', tidal: 'TIDAL' };
const PREF_KEY = 'kyoyu-play-through'; // 'auto' | 'applemusic' | 'spotify' | 'tidal' | 'off'
const PRIORITY_KEY = 'providerPriority';
export const DEFAULT_PROVIDER_PRIORITY = ['bandcamp', 'soundcloud', 'youtube', 'discogs', 'spotify', 'applemusic', 'tidal'];
export const ALL_PROVIDERS = DEFAULT_PROVIDER_PRIORITY;
export const ALL_PROVIDER_LABELS = {
  bandcamp: 'Bandcamp',
  soundcloud: 'SoundCloud',
  youtube: 'YouTube Music',
  discogs: 'Discogs',
  spotify: 'Spotify',
  applemusic: 'Apple Music',
  tidal: 'TIDAL',
};

export function normalizeProviderPriority(list) {
  const valid = new Set(DEFAULT_PROVIDER_PRIORITY);
  const seen = new Set();
  const out = [];
  if (Array.isArray(list)) {
    for (const item of list) {
      const k = String(item || '').toLowerCase();
      if (valid.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  for (const k of DEFAULT_PROVIDER_PRIORITY) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export function getProviderPriority() {
  try {
    const raw = localStorage.getItem('kyoyu-provider-priority') || localStorage.getItem(PRIORITY_KEY);
    if (raw) {
      const parsed = normalizeProviderPriority(JSON.parse(raw));
      try {
        localStorage.setItem(PRIORITY_KEY, JSON.stringify(parsed));
      } catch {}
      return parsed;
    }
  } catch { /* ignore */ }
  return [...DEFAULT_PROVIDER_PRIORITY];
}

export function setProviderPriority(order) {
  const normalized = normalizeProviderPriority(order);
  try {
    const json = JSON.stringify(normalized);
    localStorage.setItem(PRIORITY_KEY, json);
    localStorage.setItem('kyoyu-provider-priority', json);
  } catch { /* ignore */ }
  listeners.forEach((fn) => {
    try { fn({ type: 'providerPriority', order: normalized }); } catch { /* ignore */ }
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kyoyu-provider-priority', { detail: normalized }));
    window.dispatchEvent(new CustomEvent('kyoyu-provider-priority-change', { detail: normalized }));
  }
  if (isStreamingAvailable()) {
    callStreaming('setProviderPriority', { order: normalized }).catch(() => {});
  }
  return normalized;
}

export function useProviderPriority() {
  const [priority, setPriorityState] = useState(() => getProviderPriority());
  useEffect(() => {
    const off = onStreamingEvent((evt) => {
      if (evt?.type === 'providerPriority' && Array.isArray(evt.order)) {
        const next = normalizeProviderPriority(evt.order);
        try {
          const json = JSON.stringify(next);
          localStorage.setItem(PRIORITY_KEY, json);
          localStorage.setItem('kyoyu-provider-priority', json);
        } catch {}
        setPriorityState(next);
      } else if (evt?.type === 'status' && Array.isArray(evt.status?.providerPriority)) {
        const next = normalizeProviderPriority(evt.status.providerPriority);
        try {
          const json = JSON.stringify(next);
          localStorage.setItem(PRIORITY_KEY, json);
          localStorage.setItem('kyoyu-provider-priority', json);
        } catch {}
        setPriorityState(next);
      }
    });
    const onWin = (e) => {
      const rawOrder = Array.isArray(e?.detail) ? e.detail : (Array.isArray(e?.detail?.order) ? e.detail.order : null);
      if (rawOrder) {
        const next = normalizeProviderPriority(rawOrder);
        try {
          const json = JSON.stringify(next);
          localStorage.setItem(PRIORITY_KEY, json);
          localStorage.setItem('kyoyu-provider-priority', json);
        } catch {}
        setPriorityState(next);
      } else {
        setPriorityState(getProviderPriority());
      }
    };
    const onStorage = (e) => {
      if (!e || !e.key || e.key === PRIORITY_KEY || e.key === 'kyoyu-provider-priority') {
        setPriorityState(getProviderPriority());
      }
    };
    const onFocusOrVisible = () => {
      setPriorityState(getProviderPriority());
    };
    window.addEventListener('kyoyu-provider-priority', onWin);
    window.addEventListener('kyoyu-provider-priority-change', onWin);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      off();
      window.removeEventListener('kyoyu-provider-priority', onWin);
      window.removeEventListener('kyoyu-provider-priority-change', onWin);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);
  const update = (nextOrder) => {
    const next = typeof nextOrder === 'function' ? nextOrder(getProviderPriority()) : nextOrder;
    const saved = setProviderPriority(next);
    setPriorityState(saved);
  };
  return [priority, update];
}

// ── Home Page Rows per Section (3 titles per row, default 3 rows = 9 titles) ──
const HOME_ROWS_KEY = 'kyoyu-home-section-rows';
export const HOME_TITLES_PER_ROW = 3;
export const DEFAULT_HOME_SECTION_ROWS = 3;

const _CATNO_SEGMENT_RE = /^(?:\[|\()?([A-Z]{2,8}\s*[-#.]?\s*\d{1,5}[A-Z]?|[A-Z]{1,5}\d{2,5}[A-Z]?)(?:\]|\))?$/i;

function _stripCatnoNoise(str) {
  let s = String(str || '').trim()
    .replace(/^\s*\[([A-Z]{2,8}\s*[-#.]?\s*\d{1,5}[A-Z]?|[A-Z]{1,5}\d{2,5}[A-Z]?)\]\s*[-–—]?\s*/i, '')
    .replace(/\s*[-–—]?\s*\[([A-Z]{2,8}\s*[-#.]?\s*\d{1,5}[A-Z]?|[A-Z]{1,5}\d{2,5}[A-Z]?)\]\s*$/i, '')
    .replace(/\s*\(([A-Z]{2,8}\s*[-#.]?\s*\d{1,5}[A-Z]?|[A-Z]{1,5}\d{2,5}[A-Z]?)\)\s*$/i, '')
    .trim();
  for (const sep of [' — ', ' – ', ' - ', ' // ']) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (_CATNO_SEGMENT_RE.test(parts[parts.length - 1])) {
        parts.pop();
      }
      if (parts.length >= 2 && _CATNO_SEGMENT_RE.test(parts[0])) {
        parts.shift();
      }
      if (parts.length > 0) {
        s = parts.join(' - ');
        break;
      }
    }
  }
  return s || String(str || '').trim();
}

export function cleanTrackOrReleaseTitle(rawTitle, rawArtist = '') {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  let t = _stripCatnoNoise(rawTitle);
  if (!t) return '';

  const norm = (s) => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const artistClean = String(rawArtist || '').replace(/\s*\(\d+\)\s*$/, '').trim();
  const artistNorm = norm(artistClean);
  const artistPartsNorm = artistClean
    .split(/\s*(?:&|\band\b|,|\bx\b|\bvs\.?\b|\bfeat\.?\b|\bft\.?\b|\/|\+)\s*/i)
    .map(norm)
    .filter(s => s.length >= 2);

  const matchesArtist = (candidate) => {
    const cNorm = norm(candidate);
    if (!cNorm) return false;
    if (artistNorm && (cNorm === artistNorm || (artistNorm.length >= 3 && cNorm.includes(artistNorm)) || (cNorm.length >= 3 && artistNorm.includes(cNorm)))) {
      return true;
    }
    if (artistPartsNorm.length > 0 && artistPartsNorm.some(ap => cNorm === ap || (ap.length >= 4 && cNorm.includes(ap)))) {
      return true;
    }
    return false;
  };

  // Strip leading track numbers when followed by separator + artist/title, e.g. "03. Benedikt Frey - Trace"
  const leadingTrackMatch = t.match(/^(?:[A-D]\d{1,2}|\d{1,2})\s*[.)\-]\s*(.+-.+)$/i);
  if (leadingTrackMatch && leadingTrackMatch[1]) {
    t = leadingTrackMatch[1].trim();
  }

  const seps = [' — ', ' – ', ' - ', ' —', '— ', ' –', '– '];
  for (const sep of seps) {
    const idx = t.indexOf(sep);
    if (idx > 0) {
      const left = t.slice(0, idx).trim();
      const right = t.slice(idx + sep.length).trim();
      if (left && right) {
        if (_CATNO_SEGMENT_RE.test(right)) {
          return left;
        }
        if (_CATNO_SEGMENT_RE.test(left)) {
          return right;
        }
        if (matchesArtist(left)) {
          return right;
        }
        if (matchesArtist(right)) {
          return left;
        }
      }
    }
  }

  // Also check if no artist was matched yet, or if title is in "Artist - Title" format from Bandcamp/SoundCloud/Discogs
  for (const sep of [' — ', ' – ', ' - ']) {
    const idx = t.indexOf(sep);
    if (idx > 0) {
      const left = t.slice(0, idx).trim();
      const right = t.slice(idx + sep.length).trim();
      if (!left || !right) continue;
      if (_CATNO_SEGMENT_RE.test(right)) {
        return left;
      }
      const isLeftTrackPos = /^([A-D]\d{1,2}|\d{1,3}|track\s*\d+|part\s*[0-9ivx]+|pt\.?\s*[0-9ivx]+|side\s*[a-d]|cd\s*\d+|disc\s*\d+|intro|outro|[a-z]{2,8}\s*[-#.]?\s*\d{1,5}[a-z]?)$/i.test(left);
      if (isLeftTrackPos) {
        return right;
      }
      const isLeftAlbumPhrase = /\b(ep|lp|incl\.|including|sampler|remixes|various|ost|soundtrack)\b/i.test(left);
      const isRightDescriptor = /^(ep|lp|single|album|ost|soundtrack|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|act\s*[0-9ivx]+|chapter\s*\d+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|bootleg|flip|refix|instru|instrumental|acapella|bonus.*))$/i.test(right);
      if (!isRightDescriptor && !isLeftAlbumPhrase && left.length >= 2 && right.length >= 1) {
        return right;
      }
    }
  }

  return t;
}

export function splitCleanMetadata(rawTitle, rawArtist = '', rawLabel = '', rawAlbum = '') {
  const origTitle = String(rawTitle || '').trim();
  let artist = String(rawArtist || '').replace(/\s*\(\d+\)\s*$/, '').trim();
  let label = String(rawLabel || '').replace(/\s*\(\d+\)\s*$/, '').trim();
  let title = _stripCatnoNoise(origTitle);

  // Heal items previously cached with inverted catno title + EP/LP phrase in artist (e.g. title="MOCD024", artist="Phenomena EP (Incl. ...)")
  if (_CATNO_SEGMENT_RE.test(title) && artist && /\b(ep|lp|incl\.|including|sampler|remixes|ost|soundtrack|album)\b/i.test(artist)) {
    title = _stripCatnoNoise(artist);
    artist = label || '';
  }

  const norm = (s) => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  // Strip leading track numbers when followed by "Artist - Title"
  const leadingTrackMatch = title.match(/^(?:[A-D]\d{1,2}|\d{1,2})\s*[.)\-]\s*(.+-.+)$/i);
  if (leadingTrackMatch && leadingTrackMatch[1]) {
    title = leadingTrackMatch[1].trim();
  }

  for (const sep of [' — ', ' – ', ' - ']) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      const left = title.slice(0, idx).trim();
      const right = title.slice(idx + sep.length).trim();
      if (!left || !right) continue;
      if (_CATNO_SEGMENT_RE.test(right)) {
        title = left;
        break;
      }
      if (_CATNO_SEGMENT_RE.test(left)) {
        title = right;
        break;
      }
      const leftNorm = norm(left);
      const rightNorm = norm(right);
      const artistNorm = norm(artist);

      if (artistNorm && (leftNorm === artistNorm || leftNorm.includes(artistNorm) || artistNorm.includes(leftNorm))) {
        if (leftNorm.includes(artistNorm) && left.length > artist.length && left.length <= 64) {
          artist = left;
        }
        title = right;
        break;
      }
      if (artistNorm && (rightNorm === artistNorm || rightNorm.includes(artistNorm))) {
        title = left;
        break;
      }

      const isLeftTrackPosOrCatno = /^([A-D]\d{1,2}|\d{1,3}|track\s*\d+|part\s*[0-9ivx]+|pt\.?\s*[0-9ivx]+|side\s*[a-d]|cd\s*\d+|disc\s*\d+|[a-z]{2,8}\s*[-#.]?\s*\d{1,5}[a-z]?)$/i.test(left);
      if (isLeftTrackPosOrCatno) {
        title = right;
        break;
      }

      const isLeftAlbumPhrase = /\b(ep|lp|incl\.|including|sampler|remixes|various|ost|soundtrack)\b/i.test(left);
      const isRightDescriptor = /^(ep|lp|single|album|ost|soundtrack|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|act\s*[0-9ivx]+|chapter\s*\d+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|bootleg|flip|refix|instru|instrumental|acapella|bonus.*))$/i.test(right);
      if (!isRightDescriptor && !isLeftAlbumPhrase && left.length >= 2) {
        if (!artist || /^(various(\s+artists)?|unknown(\s+artist)?|—|-)$/i.test(artist)) {
          artist = left;
        } else if (leftNorm !== artistNorm) {
          // Existing artist was likely the label/channel that uploaded "Artist - Title"
          if (!label) label = artist;
          artist = left;
        }
        title = right;
        break;
      }
    }
  }

  const labelNorm = norm(label);
  const finalArtistNorm = norm(artist);
  const artistCollabs = String(artist || '').split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i).map(norm).filter(Boolean);
  if (
    !labelNorm ||
    labelNorm === finalArtistNorm ||
    artistCollabs.includes(labelNorm) ||
    /^(not on label.*|self[- ]?released.*|independent|no label|\[no label\]|none|unknown.*|various(\s+artists)?)$/i.test(label.trim())
  ) {
    label = '';
  }

  title = cleanTrackOrReleaseTitle(title, artist);
  const album = rawAlbum ? cleanTrackOrReleaseTitle(rawAlbum, artist) : '';
  return { title, artist, label, album };
}

export const HOME_PROVIDER_SECTIONS = {
  bandcamp: [
    { key: 'bandcamp-new',  shortLabel: 'New on Bandcamp', title: 'New on Bandcamp' },
    { key: 'bandcamp-col',  shortLabel: 'Collection', title: 'Bandcamp · Collection' },
    { key: 'bandcamp-wish', shortLabel: 'Wishlist',   title: 'Bandcamp · Wishlist' },
    { key: 'bandcamp-pl',   shortLabel: 'Playlists',  title: 'Bandcamp · Playlists' },
  ],
  discogs: [
    { key: 'discogs-new',   shortLabel: 'New Stuff',  title: 'Discogs · New Stuff' },
    { key: 'discogs-col',   shortLabel: 'Collection', title: 'Discogs · Collection' },
    { key: 'discogs-wish',  shortLabel: 'Wishlist',   title: 'Discogs · Wishlist' },
  ],
  soundcloud: [
    { key: 'soundcloud-new',   shortLabel: 'New Stuff', title: 'SoundCloud · New Stuff' },
    { key: 'soundcloud-likes', shortLabel: 'Likes',     title: 'SoundCloud · Likes' },
    { key: 'soundcloud-pl',    shortLabel: 'Playlists', title: 'SoundCloud · Playlists' },
  ],
  youtube: [
    { key: 'youtube-new',   shortLabel: 'New Stuff', title: 'YouTube · New Stuff' },
    { key: 'youtube-likes', shortLabel: 'Likes',     title: 'YouTube · Likes' },
    { key: 'youtube-pl',    shortLabel: 'Playlists', title: 'YouTube · Playlists' },
  ],
  spotify: [
    { key: 'spotify-new',   shortLabel: 'New Stuff', title: 'Spotify · New Stuff' },
    { key: 'spotify-likes', shortLabel: 'Likes',     title: 'Spotify · Likes' },
    { key: 'spotify-pl',    shortLabel: 'Playlists', title: 'Spotify · Playlists' },
  ],
  applemusic: [
    { key: 'applemusic-new',   shortLabel: 'New Stuff', title: 'Apple Music · New Stuff' },
    { key: 'applemusic-likes', shortLabel: 'Likes',     title: 'Apple Music · Likes' },
    { key: 'applemusic-pl',    shortLabel: 'Playlists', title: 'Apple Music · Playlists' },
  ],
  tidal: [
    { key: 'tidal-new',   shortLabel: 'New Stuff', title: 'TIDAL · New Stuff' },
    { key: 'tidal-likes', shortLabel: 'Likes',     title: 'TIDAL · Likes' },
    { key: 'tidal-pl',    shortLabel: 'Playlists', title: 'TIDAL · Playlists' },
  ],
};

export const ALL_HOME_SECTION_KEYS = [
  'home-playlists',
  ...Object.values(HOME_PROVIDER_SECTIONS)
    .flat()
    .map((s) => s.key),
];

export function normalizeHomeSectionRows(rawMap) {
  const source = (rawMap && typeof rawMap === 'object' && rawMap.rows && typeof rawMap.rows === 'object')
    ? rawMap.rows
    : (rawMap && typeof rawMap === 'object' ? rawMap : {});
  const legacyAliases = {
    'bandcamp-new': ['bandcamp-daily'],
    'bandcamp-col': ['bandcamp-collection'],
    'bandcamp-wish': ['bandcamp-wishlist'],
    'soundcloud-likes': ['sc-likes'],
    'soundcloud-pl': ['sc-playlists'],
    'soundcloud-new': ['sc-feed', 'sc-reposts'],
    'discogs-col': ['discogs-collection'],
    'discogs-wish': ['discogs-wantlist'],
  };
  const out = {};
  for (const key of ALL_HOME_SECTION_KEYS) {
    let rawVal = source[key];
    if (rawVal === undefined && legacyAliases[key]) {
      for (const alias of legacyAliases[key]) {
        if (source[alias] !== undefined) {
          rawVal = source[alias];
          break;
        }
      }
    }
    const val = Number(rawVal);
    out[key] = Number.isFinite(val) && val >= 0 ? Math.min(50, Math.round(val)) : DEFAULT_HOME_SECTION_ROWS;
  }
  return out;
}

export function getHomeSectionRows() {
  try {
    const raw = localStorage.getItem(HOME_ROWS_KEY);
    if (raw) return normalizeHomeSectionRows(JSON.parse(raw));
  } catch { /* ignore */ }
  return normalizeHomeSectionRows({});
}

export function setHomeSectionRows(nextMap) {
  const normalized = normalizeHomeSectionRows(nextMap);
  try {
    localStorage.setItem(HOME_ROWS_KEY, JSON.stringify(normalized));
  } catch { /* ignore */ }
  listeners.forEach((fn) => {
    try { fn({ type: 'homeSectionRows', rows: normalized }); } catch { /* ignore */ }
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kyoyu-home-section-rows', { detail: normalized }));
    window.dispatchEvent(new CustomEvent('kyoyu-home-section-rows-change', { detail: normalized }));
  }
  if (isStreamingAvailable()) {
    callStreaming('setHomeSectionRows', { rows: normalized }).catch(() => {});
  }
  return normalized;
}

export function useHomeSectionRows() {
  const [rowsMap, setRowsMap] = useState(() => getHomeSectionRows());
  useEffect(() => {
    const applyAndPersist = (incoming) => {
      const merged = { ...getHomeSectionRows(), ...(incoming?.rows && typeof incoming.rows === 'object' ? incoming.rows : incoming) };
      const next = normalizeHomeSectionRows(merged);
      try {
        localStorage.setItem(HOME_ROWS_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      setRowsMap(next);
    };
    const off = onStreamingEvent((evt) => {
      if (evt?.type === 'homeSectionRows' && evt.rows && typeof evt.rows === 'object') {
        applyAndPersist(evt.rows);
      } else if (evt?.type === 'status' && evt.status?.homeSectionRows && typeof evt.status.homeSectionRows === 'object') {
        if (Object.keys(evt.status.homeSectionRows).length > 0) {
          applyAndPersist(evt.status.homeSectionRows);
        }
      }
    });
    const onWin = (e) => {
      if (e?.detail && typeof e.detail === 'object') {
        applyAndPersist(e.detail);
      } else {
        setRowsMap(getHomeSectionRows());
      }
    };
    const onStorage = (e) => {
      if (!e || !e.key || e.key === HOME_ROWS_KEY) {
        setRowsMap(getHomeSectionRows());
      }
    };
    const onFocusOrVisible = () => {
      setRowsMap(getHomeSectionRows());
    };
    window.addEventListener('kyoyu-home-section-rows', onWin);
    window.addEventListener('kyoyu-home-section-rows-change', onWin);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      off();
      window.removeEventListener('kyoyu-home-section-rows', onWin);
      window.removeEventListener('kyoyu-home-section-rows-change', onWin);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);
  const update = (updater) => {
    const current = getHomeSectionRows();
    const next = typeof updater === 'function' ? updater(current) : updater;
    const saved = setHomeSectionRows(next);
    setRowsMap(saved);
  };
  return [rowsMap, update];
}

const handler = () => window.webkit?.messageHandlers?.streaming;
export const isStreamingAvailable = () => !!handler();
export const isStreamingProvider = (p) => p === 'applemusic' || p === 'spotify' || p === 'tidal';

// ── Request / reply ──
let seq = 0;
const pending = new Map();
if (typeof window !== 'undefined') {
  window.__kyoyuStreamingReply = (id, result) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (result && result.ok === false) p.reject(new Error(result.error || 'Streaming error'));
    else p.resolve(result);
  };
}

/** Send a command to the native bridge. Resolves with the native result. */
export function callStreaming(cmd, args = {}, timeoutMs = 20000) {
  const h = handler();
  if (!h) return Promise.reject(new Error('Streaming services are only available in the iOS app'));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    // Login can take a while (user types a password) — no timeout for connect
    const timer = cmd === 'connect' ? null : setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Streaming ${cmd} timed out`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { h.postMessage({ id, cmd, ...args }); }
    catch (e) { pending.delete(id); clearTimeout(timer); reject(e); }
  });
}

// ── Events (progress / state / ended / status) ──
const listeners = new Set();
let cachedStatus = null;
if (typeof window !== 'undefined') {
  window.__kyoyuStreamingEvent = (evt) => {
    if (evt?.type === 'artwork' && evt?.service === 'applemusic' && String(evt.itemId || '').startsWith('i.')) {
      return;
    }
    if (evt?.type === 'status' && evt.status) cachedStatus = evt.status;
    listeners.forEach((fn) => { try { fn(evt); } catch { /* ignore */ } });
  };
}
export function onStreamingEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Status ──
export async function refreshStreamingStatus() {
  if (!isStreamingAvailable()) return null;
  try {
    const localOrder = getProviderPriority();
    callStreaming('setProviderPriority', { order: localOrder }).catch(() => {});
    cachedStatus = await callStreaming('status');
    listeners.forEach((fn) => { try { fn({ type: 'status', status: cachedStatus }); } catch { /* ignore */ } });
  } catch { /* keep last known */ }
  return cachedStatus;
}
export const getCachedStreamingStatus = () => cachedStatus;

/** React hook: live connection status of both services (null on the website). */
export function useStreamingStatus() {
  const [status, setStatus] = useState(cachedStatus);
  useEffect(() => {
    const off = onStreamingEvent((evt) => { if (evt.type === 'status') setStatus(evt.status); });
    refreshStreamingStatus();
    return off;
  }, []);
  return status;
}

export const connectService = (service) => callStreaming('connect', { service });
export const disconnectService = (service) => callStreaming('disconnect', { service });

// ── Personal accounts (SoundCloud / Bandcamp / Discogs / YouTube Music): web sign-in handled natively, library read on-device ──
export const ACCOUNT_SERVICES = ['soundcloud', 'bandcamp', 'discogs', 'youtube'];
export const ACCOUNT_LABELS = { soundcloud: 'SoundCloud', bandcamp: 'Bandcamp', discogs: 'Discogs', youtube: 'YouTube Music' };

function sanitizeAppleMusicLibraryItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    if (!it || typeof it !== 'object') return it;
    const tid = String(it.trackId || it.providerItemId || it.appleMusicId || '');
    const aid = String(it.albumId || '');
    const id = String(it.id || '');
    // In AppleMusicService, genuine catalog songs have a numeric bestTrackId (not starting with "i.").
    // If trackId starts with "i." (or albumId starts with "l.") AND catalogId is set, that catalogId and artworkUrl
    // were invented by the legacy fuzzy MusicCatalogSearchRequest fallback for a private uploaded item that had no artwork.
    const hasInventedCatalogArt =
      ((tid.startsWith('i.') || id.startsWith('am-i.')) && !!it.catalogId) ||
      (aid.startsWith('l.') && !!it.catalogId);
    if (hasInventedCatalogArt) {
      return { ...it, artworkUrl: '', cover: '', catalogId: '' };
    }
    return it;
  });
}

/** kind: soundcloud → likes | playlists | following | playlistTracks · bandcamp → collection | wishlist · discogs → collection | wishlist · youtube → likes | playlists | albums | following | playlistTracks */
export async function fetchAccountLibrary(service, kind, extra = {}) {
  const r = await callStreaming('library', { service, kind, ...extra }, 90000);
  const items = Array.isArray(r?.items) ? r.items : [];
  return service === 'applemusic' ? sanitizeAppleMusicLibraryItems(items) : items;
}

/** Detect which external provider(s) a track or album belongs to. */
export function detectItemProviders(item) {
  if (!item) return [];
  const found = new Set();
  const id = String(item.id || '');
  const albumId = String(item.albumId || item.releaseId || '');
  const urls = [
    item.trackUrl, item.providerUrl, item.providerItemId,
    item.permalinkUrl, item.url, item.audioUrl, item.src,
    item.replay?.url, item.origin?.url,
  ].filter((u) => typeof u === 'string' && u.length > 0);

  const checkProvider = (p) => {
    const norm = String(p || '').toLowerCase();
    if (['bandcamp', 'soundcloud', 'discogs', 'spotify', 'applemusic', 'tidal', 'youtube'].includes(norm)) {
      found.add(norm);
    }
  };

  checkProvider(item.provider);
  checkProvider(item.albumProvider);
  checkProvider(item.sourceProvider);
  checkProvider(item.origin?.provider);
  checkProvider(item.replay?.provider);

  if (/^bcpl?-|^bandcamp-/i.test(id) || /^bc-|^bandcamp-/i.test(albumId)) found.add('bandcamp');
  if (/^sc(-?pl)?-|^soundcloud-/i.test(id) || item.scTrackId || item.playlistId || item.replay?.scTrackId) found.add('soundcloud');
  if (/^(dg|discogs)-/i.test(id) || /^(dg|discogs)-/i.test(albumId) || /^discogs-track-/i.test(id)) found.add('discogs');
  if (/^sp(ab|pl|-al|-pl)?-|^spotify[-:]/i.test(id) || /^sp(ab|-al)?-|^spotify[-:]/i.test(albumId) || item.spotifyId || String(item.uri || '').startsWith('spotify:')) found.add('spotify');
  if (/^am-(alb-|al-|pl-)?|^applemusic-/i.test(id) || /^am-(alb-|al-)?|^applemusic-/i.test(albumId) || item.appleMusicId) found.add('applemusic');
  if (/^td(ab|pl|-al|-pl)?-|^tidal[-:]/i.test(id) || /^td(ab|-al)?-|^tidal[-:]/i.test(albumId) || item.tidalId || String(item.uri || '').startsWith('tidal:')) found.add('tidal');
  if (/^yt(-pl|-al)?-|^youtube-/i.test(id) || /^yt-al-|^youtube-/i.test(albumId) || item.videoId || item.replay?.videoId || item.origin?.videoId) found.add('youtube');

  for (const u of urls) {
    if (u.includes('bandcamp.com') && !u.includes('bcbits.com')) found.add('bandcamp');
    if (u.includes('soundcloud.com') && !u.includes('sndcdn.com')) found.add('soundcloud');
    if (u.includes('discogs.com')) found.add('discogs');
    if (u.includes('spotify.com') || u.startsWith('spotify:')) found.add('spotify');
    if (u.includes('music.apple.com') || u.includes('itunes.apple.com')) found.add('applemusic');
    if (u.includes('tidal.com') || u.startsWith('tidal:')) found.add('tidal');
    if (u.includes('youtube.com') || u.includes('youtu.be')) found.add('youtube');
  }

  return Array.from(found);
}

/**
 * Two-way sync: when a user likes/unlikes a track or album in Kyoyu,
 * sync the like/wishlist state back to the connected provider(s).
 */
export async function syncProviderLike(item, liked = true) {
  if (!isStreamingAvailable() || !item) return;
  const providers = detectItemProviders(item);
  if (!providers.length) return;

  const status = cachedStatus || await refreshStreamingStatus();
  if (!status) return;

  const id = String(item.id || '');
  const albumId = String(item.albumId || item.releaseId || '');
  const title = String(item.title || item.name || '');
  const artist = String(item.artistName || item.artist || '');
  const album = String(item.album || item.albumName || item.releaseTitle || '');
  const isPlaylistKind = item.kind === 'playlist' || item.entityType === 'playlist' || /^(sc(-?pl)|sp(-?pl)|td(-?pl)|am-pl|yt-pl)-/i.test(id);
  const isAlbumKind = item.kind === 'album' || item.entityType === 'album' || item.entityType === 'release' || /^(sp(ab|-al)|td(ab|-al)|am-(alb|al)|yt-al)-/i.test(id);
  const baseKind = isPlaylistKind ? 'playlist' : (isAlbumKind ? 'album' : 'track');

  const urls = [
    item.uri, item.trackUrl, item.providerUrl, item.providerItemId,
    item.permalinkUrl, item.url, item.audioUrl, item.src,
    item.replay?.url, item.origin?.url,
  ].filter((u) => typeof u === 'string' && u.length > 0);

  await Promise.all(providers.map(async (service) => {
    if (!status?.[service]?.connected) return;

    let itemId = id;
    let kind = baseKind;
    let url = '';

    if (service === 'bandcamp') {
      url = urls.find((u) => u.includes('bandcamp.com') && !u.includes('bcbits.com')) || '';
      if (/^bc(pl)?-/i.test(id)) itemId = id;
      else if (/^bc-/i.test(albumId)) itemId = albumId;
      else if (url) itemId = url;
      if (url.includes('/album/') && baseKind === 'album') kind = 'album';
    } else if (service === 'soundcloud') {
      url = urls.find((u) => u.includes('soundcloud.com') && !u.includes('sndcdn.com')) || '';
      itemId = String(item.scTrackId || item.playlistId || item.replay?.scTrackId || (/^sc(-?pl)?-/i.test(id) ? id : '') || id);
      if (url.includes('/sets/') || /^sc(-?pl)-/i.test(id)) kind = 'playlist';
    } else if (service === 'discogs') {
      url = urls.find((u) => u.includes('discogs.com')) || '';
      itemId = /^(dg|discogs)-/i.test(albumId) ? albumId : id;
      kind = 'album'; // Discogs wantlist is release-level
    } else if (service === 'spotify') {
      url = urls.find((u) => u.includes('spotify.com') || u.startsWith('spotify:')) || '';
      itemId = String(item.spotifyId || (item.replay?.provider === 'spotify' ? item.replay?.itemId : '') || (/^sp/i.test(id) ? id : (/^sp/i.test(albumId) ? albumId : id)));
      if (url.includes('/playlist/') || url.includes(':playlist:') || /^sp(-?pl)-/i.test(itemId)) kind = 'playlist';
      else if (url.includes('/album/') || url.includes(':album:') || /^sp(ab|-al)-/i.test(itemId)) kind = 'album';
    } else if (service === 'applemusic') {
      url = urls.find((u) => u.includes('music.apple.com') || u.includes('itunes.apple.com')) || '';
      itemId = String(item.appleMusicId || (item.replay?.provider === 'applemusic' ? item.replay?.itemId : '') || (/^am-|^applemusic-/i.test(id) ? id : (/^am-|^applemusic-/i.test(albumId) ? albumId : id)));
      if (url.includes('/playlist/') || /^am-pl-/i.test(itemId)) kind = 'playlist';
      else if ((url.includes('/album/') && !url.includes('?i=')) || /^am-(alb|al)-/i.test(itemId)) kind = 'album';
    } else if (service === 'tidal') {
      url = urls.find((u) => u.includes('tidal.com') || u.startsWith('tidal:')) || '';
      itemId = String(item.tidalId || (item.replay?.provider === 'tidal' ? item.replay?.itemId : '') || (/^td|^tidal/i.test(id) ? id : (/^td|^tidal/i.test(albumId) ? albumId : id)));
      if (url.includes('/playlist/') || url.includes(':playlist:') || /^td(-?pl)-/i.test(itemId)) kind = 'playlist';
      else if (url.includes('/album/') || url.includes(':album:') || /^td(ab|-al)-/i.test(itemId)) kind = 'album';
    } else if (service === 'youtube') {
      url = urls.find((u) => u.includes('youtube.com') || u.includes('youtu.be')) || '';
      const vid = item.videoId || item.replay?.videoId || item.origin?.videoId || (item.provider === 'youtube' ? item.providerItemId : '');
      itemId = String(vid ? `yt-${String(vid).replace(/^yt-|^youtube-/, '')}` : (/^yt-|^youtube-/i.test(id) ? id : id));
      if (url.includes('playlist?list=') || /^yt-pl-/i.test(id)) kind = 'playlist';
      else if (/^yt-al-|^MPREb_/i.test(id) || /^yt-al-|^MPREb_/i.test(albumId)) kind = 'album';
    }

    // Notify listeners for instant optimistic update
    listeners.forEach((fn) => {
      try { fn({ type: 'libraryOptimistic', service, kind, item, itemId, url, liked: !!liked }); } catch { /* ignore */ }
    });

    try {
      await callStreaming('like', {
        service,
        liked: !!liked,
        itemId,
        kind,
        url,
        title,
        artist,
        album,
      }, 30000);
    } catch (err) {
      console.warn(`[syncProviderLike] ${service} error:`, err?.message || err);
    } finally {
      listeners.forEach((fn) => {
        try { fn({ type: 'libraryChanged', service, kind }); } catch { /* ignore */ }
      });
    }
  }));
}

// ── "Play through" preference ──
export function getPlayThrough() {
  try { return localStorage.getItem(PREF_KEY) || 'auto'; } catch { return 'auto'; }
}
export function setPlayThrough(value) {
  try { localStorage.setItem(PREF_KEY, value); } catch { /* ignore */ }
  listeners.forEach((fn) => { try { fn({ type: 'pref', value }); } catch { /* ignore */ } });
}

const canPlay = (service, status) => {
  const s = status?.[service];
  if (!s?.connected) return false;
  if (service === 'applemusic' || service === 'tidal') return !!s.canPlay;
  return !!(s.configured && s.sdk && s.installed && s.premium !== false);
};

/** The service YouTube tracks should be played through right now, or null (→ YouTube). */
export function activePlaybackService(status = cachedStatus) {
  if (!isStreamingAvailable() || !status) return null;
  const pref = getPlayThrough();
  if (pref === 'off') return null;
  if (pref === 'applemusic' || pref === 'spotify' || pref === 'tidal') return canPlay(pref, status) ? pref : null;
  return SERVICES.find((s) => canPlay(s, status)) || null; // auto: Apple Music first
}

// ── Matching a YouTube video to a catalog song ──
const JUNK = /\b(official( music)?( video| audio| lyric video| visualizer)?|music video|lyrics?( video)?|audio|video|hd|hq|4k|visuali[sz]er|mv|m\/v|explicit|clean|full album)\b/gi;

function normalize(s = '') {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(feat|ft|featuring|with)\.?\s.*$/i, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function cleanYouTube(title = '', channel = '') {
  let t = title
    .replace(/[([{【][^)\]}】]*(official|video|audio|lyric|visuali|hd|4k|mv|explicit)[^)\]}】]*[)\]}】]/gi, ' ')
    .replace(JUNK, ' ')
    .replace(/\s*\|\s*.*$/, ' ')
    .replace(/\s+/g, ' ').trim();
  const ch = channel.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').replace(/\bofficial\b/i, '').trim();
  let artist = ch;
  let song = t;
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) { artist = dash[1]; song = dash[2]; }
  return { artist: artist.trim(), song: song.trim(), term: dash ? `${dash[1]} ${dash[2]}` : `${ch} ${t}`.trim() };
}

const tokens = (s) => new Set(normalize(s).split(' ').filter((w) => w.length > 1));
function overlap(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((w) => { if (B.has(w)) hit += 1; });
  return hit / Math.min(A.size, B.size);
}

const VARIANT = /\b(remix|live|acoustic|instrumental|karaoke|cover|edit|version|sped up|slowed|nightcore)\b/i;

function score(cand, yt) {
  const titleScore = overlap(cand.title, yt.song);
  const artistScore = Math.max(overlap(cand.artist, yt.artist), overlap(cand.artist, `${yt.rawTitle} ${yt.channel}`));
  let s = titleScore * 0.6 + artistScore * 0.4;
  // A remix/live version only counts if the YouTube title says so too (and vice versa)
  if (VARIANT.test(cand.title) !== VARIANT.test(yt.rawTitle)) s -= 0.3;
  if (yt.duration > 0 && cand.duration > 0) {
    const diff = Math.abs(yt.duration - cand.duration);
    if (diff <= 4) s += 0.1;
    else if (diff > 30) s -= 0.25;
  }
  return s;
}

/**
 * Find the same song in the service's catalog.
 * @returns {Promise<null | {id,title,artist,album,duration,artworkUrl,url,isrc}>}
 */
export async function findStreamingMatch(service, { title = '', channel = '', duration = 0 }) {
  const yt = cleanYouTube(title, channel);
  if (!yt.song) return null;
  let results = [];
  try {
    results = await callStreaming('search', { service, term: yt.term, limit: 8 }, 8000);
  } catch { return null; }
  if (!Array.isArray(results) || !results.length) return null;
  const ctx = { ...yt, rawTitle: title, channel, duration: Number(duration) || 0 };
  let best = null, bestScore = 0;
  for (const c of results) {
    const s = score(c, ctx);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return bestScore >= 0.7 ? best : null;
}
