// ── Premium streaming services (Apple Music, Spotify) ──
// Thin wrapper around the native iOS bridge (Kyoyu/StreamingBridge.swift).
// Only available inside the iOS app; on the website every call resolves to "unavailable".

import { useEffect, useState } from 'react';

export const SERVICES = ['applemusic', 'spotify'];
export const SERVICE_LABELS = { applemusic: 'Apple Music', spotify: 'Spotify' };
const PREF_KEY = 'kyoyu-play-through'; // 'auto' | 'applemusic' | 'spotify' | 'off'

const handler = () => window.webkit?.messageHandlers?.streaming;
export const isStreamingAvailable = () => !!handler();
export const isStreamingProvider = (p) => p === 'applemusic' || p === 'spotify';

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
  if (service === 'applemusic') return !!s.canPlay;
  return !!(s.configured && s.sdk && s.installed && s.premium !== false);
};

/** The service YouTube tracks should be played through right now, or null (→ YouTube). */
export function activePlaybackService(status = cachedStatus) {
  if (!isStreamingAvailable() || !status) return null;
  const pref = getPlayThrough();
  if (pref === 'off') return null;
  if (pref === 'applemusic' || pref === 'spotify') return canPlay(pref, status) ? pref : null;
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
