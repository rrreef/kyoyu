/**
 * Shared "find a playable source for this song" logic.
 * Used by the Discogs album sheet (resolve: tracks) and by History replay
 * for entries that carry no provider identity.
 * Priority: Bandcamp → SoundCloud → YouTube. Each source must actually be this song.
 */
import { cleanText, parseEntity, isSameTitle, stripTrackPosition, tokens } from './musicMatch';

export async function postJson(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

/** Resolve a Bandcamp track page to an mp3 stream (native bridge in the iOS app, serverless API on web). */
export async function resolveBandcampStream(trackUrl, title) {
  const bridge = typeof window !== 'undefined' && window.webkit?.messageHandlers?.bandcamp;
  if (!bridge) {
    const data = await postJson('/api/bandcamp-resolve', { url: trackUrl });
    return data?.streamUrl || null;
  }
  return new Promise((resolve) => {
    const callbackId = Math.random().toString(36).substring(7);
    window.__kyoyuBandcampCallback = window.__kyoyuBandcampCallback || ((id, data) => {
      if (window.__kyoyuBandcampCallbacks && window.__kyoyuBandcampCallbacks[id]) {
        window.__kyoyuBandcampCallbacks[id](data);
        delete window.__kyoyuBandcampCallbacks[id];
      }
    });
    window.__kyoyuBandcampCallbacks = window.__kyoyuBandcampCallbacks || {};
    const timeout = setTimeout(() => {
      if (window.__kyoyuBandcampCallbacks[callbackId]) {
        window.__kyoyuBandcampCallbacks[callbackId]({ error: 'Timeout' });
        delete window.__kyoyuBandcampCallbacks[callbackId];
      }
    }, 10000);
    window.__kyoyuBandcampCallbacks[callbackId] = (data) => {
      clearTimeout(timeout);
      resolve(data && data.streamUrl ? data.streamUrl : null);
    };
    bridge.postMessage({ url: trackUrl, callbackId, title });
  });
}

/**
 * Find a playable source for artist + title.
 * Returns one of:
 *   { provider: 'bandcamp',   providerItemId: trackUrl,  src }
 *   { provider: 'soundcloud', providerItemId: permalink, scTrackId, src }
 *   { provider: 'youtube',    videoId }
 * or null when nothing matches (or when isCurrent() turns false mid-way).
 */
export async function findTrackSource({ artist, title }, isCurrent = () => true) {
  const cleanTitle = stripTrackPosition(title || '');
  const want = { artist: cleanText(artist || ''), title: cleanText(cleanTitle), uploader: '' };
  const searchText = `${artist || ''} ${cleanTitle}`.trim();
  if (!searchText) return null;
  try {
    // 1. Bandcamp
    const bc = await postJson('/api/bandcamp-search', { query: searchText });
    if (!isCurrent()) return null;
    const bcTrack = (bc?.results || []).find(r => r.type === 'track' && isSameTitle(parseEntity(r.title, r.artistName), want));
    if (bcTrack) {
      const streamUrl = await resolveBandcampStream(bcTrack.trackUrl, cleanTitle);
      if (!isCurrent()) return null;
      if (streamUrl) return { provider: 'bandcamp', providerItemId: bcTrack.trackUrl, src: streamUrl };
    }

    // 2. SoundCloud
    const sc = await postJson('/api/soundcloud-search', { query: searchText, limit: 15, offset: 0 });
    if (!isCurrent()) return null;
    const scTrack = (sc?.results || []).find(r => isSameTitle(parseEntity(r.title, r.artistName), want));
    if (scTrack) {
      const scStream = await postJson('/api/soundcloud-search', { resolveTrackId: scTrack.trackId });
      if (!isCurrent()) return null;
      if (scStream?.streamUrl) {
        return { provider: 'soundcloud', providerItemId: scTrack.permalinkUrl, scTrackId: String(scTrack.trackId), src: scStream.streamUrl };
      }
    }

    // 3. YouTube (titles are messy: accept an exact match, else every title word + the artist present)
    const yt = await postJson('/api/youtube-search', { query: `${searchText} audio` });
    if (!isCurrent()) return null;
    const ytResults = yt?.results || [];
    const ytEnt = (r) => parseEntity(r.title, r.channelTitle);
    const looseYt = (r) => {
      const all = tokens(`${r.title} ${r.channelTitle}`);
      const need = [...tokens(want.title), ...tokens(want.artist)];
      return need.length > 0 && need.every(w => all.has(w));
    };
    const ytTrack = ytResults.find(r => isSameTitle(ytEnt(r), want)) || ytResults.find(looseYt);
    if (ytTrack?.videoId) return { provider: 'youtube', videoId: ytTrack.videoId };
  } catch (e) {
    console.warn('[resolveTrack] error:', e);
  }
  return null;
}
