// ── Premium streaming services (Apple Music, Spotify) ──
// Thin wrapper around the native iOS bridge (Kyoyu/StreamingBridge.swift).
// Only available inside the iOS app; on the website every call resolves to "unavailable".

import { useEffect, useState } from 'react';

export const SERVICES = ['applemusic', 'spotify', 'tidal'];
export const SERVICE_LABELS = { applemusic: 'Apple Music', spotify: 'Spotify', tidal: 'TIDAL' };
const PREF_KEY = 'kyoyu-play-through'; // 'auto' | 'applemusic' | 'spotify' | 'tidal' | 'off'

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

/** kind: soundcloud → likes | playlists | following | playlistTracks · bandcamp → collection | wishlist · discogs → collection | wishlist · youtube → likes | playlists | albums | following | playlistTracks */
export async function fetchAccountLibrary(service, kind, extra = {}) {
  const r = await callStreaming('library', { service, kind, ...extra }, 90000);
  return Array.isArray(r?.items) ? r.items : [];
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
