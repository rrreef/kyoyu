/**
 * Shared "find a playable source for this song" logic.
 * Used by the Discogs album sheet (resolve: tracks), Artist/Label/Genre sheets, and History replay
 * for entries that carry no provider identity.
 * Remembers the resolved provider per title so subsequent plays of the same title
 * always play directly from that provider without re-searching all catalogs.
 */
import { cleanText, parseEntity, isSameTitle, stripTrackPosition, tokens } from './musicMatch';
import { resolveBandcamp } from './unifiedSearch';
import { getProviderPriority, callStreaming, isStreamingAvailable } from './streaming';

const RESOLVED_PROVIDERS_KEY = 'kyoyu-resolved-track-providers-v1';
const _resolvedProviderMap = new Map();

export function normalizeTrackTitleArtistKey(title, artist) {
  const t = cleanText(stripTrackPosition(title || ''));
  const a = cleanText(artist || '');
  if (!t) return '';
  return a ? `${a}|${t}` : `|${t}`;
}

function cleanTrackLookupId(id) {
  const s = String(id || '').split('?ts=')[0].trim();
  if (!s || s.startsWith('saved-') || s.startsWith('resolve:')) return '';
  return s;
}

let _saveResolvedTimer = null;
function persistResolvedProviderMap() {
  if (typeof window === 'undefined') return;
  if (_saveResolvedTimer) clearTimeout(_saveResolvedTimer);
  _saveResolvedTimer = setTimeout(() => {
    try {
      const entries = Array.from(_resolvedProviderMap.entries()).slice(-1000);
      localStorage.setItem(RESOLVED_PROVIDERS_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch (_) {}
  }, 100);
}

/** Extract concrete provider & item identity from a played or saved track. */
function extractConcreteProviderEntry(track) {
  if (!track || typeof track !== 'object') return null;
  const r = track.replay || track.origin || {};
  let provider = String(track.provider || r.provider || '').toLowerCase();
  const id = String(track.id || '');

  const videoId = track.videoId || r.videoId || (id.startsWith('yt-') ? id.slice(3) : '') || (provider === 'youtube' ? track.providerItemId : '');
  const scTrackId = track.scTrackId || r.scTrackId || ((id.match(/^sc-(\d+)/) || [])[1]) || '';
  const bcUrl = [track.providerItemId, track.providerUrl, track.trackUrl, r.url, track.url]
    .find((u) => typeof u === 'string' && /^https?:\/\/[^/]*bandcamp\.com\//i.test(u)) || '';
  const scUrl = [track.providerItemId, track.providerUrl, track.permalinkUrl, r.url, track.url]
    .find((u) => typeof u === 'string' && /^https?:\/\/[^/]*soundcloud\.com\//i.test(u)) || '';
  const spotifyId = track.spotifyId || (provider === 'spotify' ? (track.providerItemId || r.itemId) : '') || '';
  const appleMusicId = track.appleMusicId || (provider === 'applemusic' ? (track.providerItemId || r.itemId) : '') || '';
  const tidalId = track.tidalId || (provider === 'tidal' ? (track.providerItemId || r.itemId) : '') || '';

  if (bcUrl) provider = 'bandcamp';
  else if (scTrackId) provider = 'soundcloud';
  else if (videoId && /^[A-Za-z0-9_-]{11}$/.test(String(videoId))) provider = 'youtube';
  else if (spotifyId) provider = 'spotify';
  else if (appleMusicId) provider = 'applemusic';
  else if (tidalId) provider = 'tidal';

  if (provider === 'bandcamp' && bcUrl) {
    return {
      provider: 'bandcamp',
      providerItemId: bcUrl,
      providerUrl: bcUrl,
      duration: Number(track.duration) || 0,
      artworkUrl: track.releaseCover || track.artworkUrl || track.cover || '',
      updatedAt: Date.now(),
    };
  }
  if (provider === 'soundcloud' && scTrackId) {
    return {
      provider: 'soundcloud',
      scTrackId: String(scTrackId),
      providerItemId: scUrl,
      providerUrl: scUrl,
      duration: Number(track.duration) || 0,
      artworkUrl: track.releaseCover || track.artworkUrl || track.cover || '',
      updatedAt: Date.now(),
    };
  }
  if (provider === 'youtube' && videoId) {
    return {
      provider: 'youtube',
      videoId: String(videoId),
      providerItemId: String(videoId),
      duration: Number(track.duration) || 0,
      artworkUrl: track.releaseCover || track.artworkUrl || track.cover || '',
      updatedAt: Date.now(),
    };
  }
  if (provider === 'spotify' && spotifyId) {
    const cleanSp = String(spotifyId).replace(/^sp-/, '');
    return {
      provider: 'spotify',
      spotifyId: cleanSp,
      providerItemId: cleanSp,
      providerUrl: track.providerUrl || track.url || '',
      duration: Number(track.duration) || 0,
      artworkUrl: track.releaseCover || track.artworkUrl || track.cover || '',
      updatedAt: Date.now(),
    };
  }
  if (provider === 'applemusic' && appleMusicId) {
    const cleanAm = String(appleMusicId).replace(/^am-/, '');
    return {
      provider: 'applemusic',
      appleMusicId: cleanAm,
      providerItemId: cleanAm,
      providerUrl: track.providerUrl || track.url || '',
      duration: Number(track.duration) || 0,
      artworkUrl: track.releaseCover || track.artworkUrl || track.cover || '',
      updatedAt: Date.now(),
    };
  }
  if (provider === 'tidal' && tidalId) {
    const cleanTd = String(tidalId).replace(/^td-/, '');
    return {
      provider: 'tidal',
      tidalId: cleanTd,
      providerItemId: cleanTd,
      providerUrl: track.providerUrl || track.url || '',
      duration: Number(track.duration) || 0,
      artworkUrl: track.releaseCover || track.artworkUrl || track.cover || '',
      updatedAt: Date.now(),
    };
  }
  return null;
}

/** Remember the concrete provider that played a given title so future plays reuse it directly. */
export function rememberResolvedTrackProvider(track) {
  if (!track) return;
  const entry = extractConcreteProviderEntry(track);
  if (!entry) return;
  const title = track.title || track.name || '';
  const artist = track.artistName || track.artist || '';
  const taKey = normalizeTrackTitleArtistKey(title, artist);
  let changed = false;
  if (taKey) {
    _resolvedProviderMap.set(taKey, entry);
    changed = true;
  }
  const cleanId = cleanTrackLookupId(track.id);
  if (cleanId) {
    _resolvedProviderMap.set(`id:${cleanId}`, entry);
    changed = true;
  }
  if (changed) persistResolvedProviderMap();
}

/** Look up a previously resolved provider for a track by id or (title, artist). */
export function getRememberedTrackProvider({ id, title, artist } = {}) {
  const cleanId = cleanTrackLookupId(id);
  if (cleanId && _resolvedProviderMap.has(`id:${cleanId}`)) {
    return _resolvedProviderMap.get(`id:${cleanId}`);
  }
  const taKey = normalizeTrackTitleArtistKey(title, artist);
  if (taKey && _resolvedProviderMap.has(taKey)) {
    return _resolvedProviderMap.get(taKey);
  }
  if (title) {
    const titleOnlyKey = normalizeTrackTitleArtistKey(title, '');
    if (titleOnlyKey && _resolvedProviderMap.has(titleOnlyKey)) {
      return _resolvedProviderMap.get(titleOnlyKey);
    }
  }
  return null;
}

// Hydrate from localStorage on module load (including existing play history & liked tracks)
if (typeof window !== 'undefined') {
  try {
    const rawMap = localStorage.getItem(RESOLVED_PROVIDERS_KEY);
    if (rawMap) {
      const parsed = JSON.parse(rawMap);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (v && v.provider) _resolvedProviderMap.set(k, v);
        }
      }
    }
    for (const histKey of ['kyoyu-play-history', 'kyoyu-liked-uploads']) {
      const rawList = localStorage.getItem(histKey);
      if (!rawList) continue;
      const list = JSON.parse(rawList);
      if (Array.isArray(list)) {
        // Iterate oldest to newest so most recent play wins
        for (let i = list.length - 1; i >= 0; i--) {
          const item = list[i];
          const entry = extractConcreteProviderEntry(item);
          if (!entry) continue;
          const taKey = normalizeTrackTitleArtistKey(item?.title || item?.name, item?.artist || item?.artistName);
          if (taKey && !_resolvedProviderMap.has(taKey)) _resolvedProviderMap.set(taKey, entry);
          const cid = cleanTrackLookupId(item?.id);
          if (cid && !_resolvedProviderMap.has(`id:${cid}`)) _resolvedProviderMap.set(`id:${cid}`, entry);
        }
      }
    }
  } catch (_) {}
}

export async function postJson(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export async function resolveBandcampStream(trackUrl, title) {
  const data = await resolveBandcamp(trackUrl, title);
  return data ? { streamUrl: data.streamUrl, duration: data.duration } : null;
}

export async function resolveSoundCloudStream(trackId, trackUrl = '') {
  const cleanId = trackId ? String(trackId).replace(/^sc-/, '').trim() : '';
  if (isStreamingAvailable()) {
    try {
      const nativeRes = await callStreaming('scResolve', { trackId: cleanId, trackUrl: trackUrl || '' }, 12000);
      if (nativeRes && (nativeRes.streamUrl || nativeRes.url)) {
        return {
          streamUrl: nativeRes.streamUrl || nativeRes.url,
          duration: Number(nativeRes.duration) || 0,
        };
      }
    } catch (_) {}
  }
  return await postJson('/api/soundcloud-search', {
    resolveTrackId: cleanId || undefined,
    resolveUrl: trackUrl || undefined,
  });
}

/**
 * Find a playable source for artist + title.
 * First checks if this title was already played & remembered on a specific provider (e.g. Bandcamp),
 * and if so resolves directly from that provider without searching all catalogs.
 * Returns one of:
 *   { provider: 'bandcamp',   providerItemId: trackUrl,  src }
 *   { provider: 'soundcloud', providerItemId: permalink, scTrackId, src }
 *   { provider: 'youtube',    videoId }
 * or null when nothing matches (or when isCurrent() turns false mid-way).
 */
export async function findTrackSource({ id, artist, title }, isCurrent = () => true) {
  const cleanTitle = stripTrackPosition(title || '');
  const want = { artist: cleanText(artist || ''), title: cleanText(cleanTitle), uploader: '' };
  const searchText = `${artist || ''} ${cleanTitle}`.trim();
  if (!searchText) return null;

  // 0. Check if this title already has a remembered provider from a previous play
  const remembered = getRememberedTrackProvider({ id, title: cleanTitle, artist });
  if (remembered) {
    try {
      if (remembered.provider === 'bandcamp' && remembered.providerItemId) {
        const resolved = await resolveBandcampStream(remembered.providerItemId, cleanTitle);
        if (!isCurrent()) return null;
        if (resolved?.streamUrl) {
          return {
            provider: 'bandcamp',
            providerItemId: remembered.providerItemId,
            src: resolved.streamUrl,
            duration: resolved.duration || remembered.duration,
          };
        }
      } else if (remembered.provider === 'soundcloud' && remembered.scTrackId) {
        const scStream = await resolveSoundCloudStream(remembered.scTrackId, remembered.providerItemId || '');
        if (!isCurrent()) return null;
        if (scStream?.streamUrl) {
          return {
            provider: 'soundcloud',
            providerItemId: remembered.providerItemId || '',
            scTrackId: String(remembered.scTrackId),
            src: scStream.streamUrl,
            duration: remembered.duration || scStream.duration,
          };
        }
      } else if (remembered.provider === 'youtube' && remembered.videoId) {
        return {
          provider: 'youtube',
          videoId: remembered.videoId,
          duration: remembered.duration,
        };
      }
    } catch (e) {
      console.warn('[resolveTrack] remembered provider resolve failed, falling back to catalog search:', e);
    }
  }

  // Order catalog search by the user's preferred provider priority
  const priority = (typeof getProviderPriority === 'function' ? getProviderPriority() : ['bandcamp', 'soundcloud', 'youtube'])
    .filter((p) => p === 'bandcamp' || p === 'soundcloud' || p === 'youtube');
  for (const p of ['bandcamp', 'soundcloud', 'youtube']) {
    if (!priority.includes(p)) priority.push(p);
  }

  try {
    for (const prov of priority) {
      if (!isCurrent()) return null;
      if (prov === 'bandcamp') {
        const bc = await postJson('/api/bandcamp-search', { query: searchText });
        if (!isCurrent()) return null;
        const bcTrack = (bc?.results || []).find(r => r.type === 'track' && isSameTitle(parseEntity(r.title, r.artistName), want));
        if (bcTrack) {
          const resolved = await resolveBandcampStream(bcTrack.trackUrl, cleanTitle);
          if (!isCurrent()) return null;
          if (resolved?.streamUrl) {
            const out = { provider: 'bandcamp', providerItemId: bcTrack.trackUrl, src: resolved.streamUrl, duration: resolved.duration };
            rememberResolvedTrackProvider({ id, title: cleanTitle, artist, ...out });
            return out;
          }
        }
      } else if (prov === 'soundcloud') {
        const sc = await postJson('/api/soundcloud-search', { query: searchText, limit: 15, offset: 0 });
        if (!isCurrent()) return null;
        const scTrack = (sc?.results || []).find(r => isSameTitle(parseEntity(r.title, r.artistName), want));
        if (scTrack) {
          const scStream = await resolveSoundCloudStream(scTrack.trackId, scTrack.permalinkUrl || '');
          if (!isCurrent()) return null;
          if (scStream?.streamUrl) {
            const out = { provider: 'soundcloud', providerItemId: scTrack.permalinkUrl, scTrackId: String(scTrack.trackId), src: scStream.streamUrl, duration: scTrack.duration };
            rememberResolvedTrackProvider({ id, title: cleanTitle, artist, ...out });
            return out;
          }
        }
      } else if (prov === 'youtube') {
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
        if (ytTrack?.videoId) {
          const out = { provider: 'youtube', videoId: ytTrack.videoId, duration: ytTrack.duration };
          rememberResolvedTrackProvider({ id, title: cleanTitle, artist, ...out });
          return out;
        }
      }
    }
  } catch (e) {
    console.warn('[resolveTrack] error:', e);
  }
  return null;
}
