/**
 * Unified search across native catalog + Discogs external metadata.
 * Native results are always ranked first when an exact match exists.
 */
import { fetchPublicTracks } from './uploadPipeline';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** POST with a retry on rate-limit / server errors, so a busy moment doesn't silently drop a provider. */
async function postWithRetry(url, body, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok || attempt >= retries || (res.status !== 429 && res.status < 500)) return res;
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    await sleep(600 * (attempt + 1));
  }
}

/**
 * Search Discogs via our proxy API endpoint.
 * Returns normalized results that can be merged with native results.
 */
async function searchDiscogs(query, offset = 0) {
  try {
    const page = Math.floor(offset / 33) + 1;
    const res = await postWithRetry('/api/discogs-search', { query, perPage: 33, page }, 0); // server already retries; Search page retries in background
    if (!res.ok) return { results: [], hasMore: false, nextOffset: offset, failed: true };
    const data = await res.json();
    const results = (data.results || []).map(r => ({
      id: `discogs-${offset}-${r.type}-${r.id || r.discogsId}`,
      discogsId: r.id || r.discogsId,
      type: r.type, // 'artist', 'release', 'master', 'label'
      title: r.title,
      thumb: r.thumb || null,
      coverImage: r.cover_image || r.coverImage || null,
      year: r.year,
      genres: r.genre || [],
      styles: r.style || [],
      formats: r.format || [],
      labels: r.label || [],
      country: r.country,
      catno: r.catno,
      masterId: r.master_id || null,
      have: r.community?.have || 0,
      want: r.community?.want || 0,
      isExternal: true,
      nativeAvailable: false,
    }));
    const hasMore = (data.pagination?.pages > page) || (results.length === 33);
    const nextOffset = offset + results.length;
    return { results, hasMore, nextOffset };
  } catch (err) {
    console.warn('Discogs search failed:', err);
    return { results: [], hasMore: false, nextOffset: offset, failed: true };
  }
}

/**
 * Parse a Discogs title string like "Artist - Title" into parts.
 */
function parseDiscogsTitle(title) {
  if (!title) return { artist: '', release: title || '' };
  const parts = title.split(' - ');
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), release: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '', release: title };
}

/**
 * Check if a Discogs result matches any native result (deduplication).
 * Compares by normalized artist + title.
 */
function isNativeMatch(discogsResult, nativeResults) {
  const { artist: dArtist, release: dRelease } = parseDiscogsTitle(discogsResult.title);
  const dArtistNorm = dArtist.toLowerCase().trim();
  const dReleaseNorm = dRelease.toLowerCase().trim();
  
  return nativeResults.some(native => {
    const nArtist = (native.artist || '').toLowerCase().trim();
    const nAlbum = (native.album || '').toLowerCase().trim();
    const nTitle = (native.title || '').toLowerCase().trim();
    
    // Match by artist name for artist-type results
    if (discogsResult.type === 'artist' && nArtist === dArtistNorm) return true;
    if (discogsResult.type === 'label' && (native.label || '').toLowerCase().trim() === dReleaseNorm) return true;
    
    // Match by artist + album/title for releases
    if (discogsResult.type === 'release' || discogsResult.type === 'master') {
      if (nArtist === dArtistNorm && (nAlbum === dReleaseNorm || nTitle === dReleaseNorm)) return true;
    }
    
    return false;
  });
}

/**
 * Categorize Discogs results into artists, releases, and labels.
 */
function categorizeDiscogsResults(discogsResults, nativeResults) {
  const artists = [];
  const releases = [];
  const labels = [];
  
  for (const r of discogsResults) {
    // Skip if already exists in native catalog
    if (isNativeMatch(r, nativeResults)) continue;
    
    const parsed = parseDiscogsTitle(r.title);
    
    if (r.type === 'artist') {
      artists.push({
        ...r,
        name: parsed.release || r.title,
        entityType: 'artist',
      });
    } else if (r.type === 'label') {
      labels.push({
        ...r,
        name: parsed.release || r.title,
        entityType: 'label',
      });
    } else if (r.type === 'release' || r.type === 'master') {
      releases.push({
        ...r,
        artistName: parsed.artist,
        releaseName: parsed.release,
        entityType: 'release',
      });
    }
  }
  
  return { artists, releases, labels };
}

/**
 * Search YouTube via our proxy API endpoint.
 * Returns normalized video results for display.
 */
async function searchYouTube(query, pageToken = null, retries = 2) {
  try {
    const body = { query: `${query} music`, maxResults: 33 };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch('/api/youtube-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (retries > 0) return await searchYouTube(query, pageToken, retries - 1);
      return { results: [] };
    }
    const data = await res.json();
    return {
      results: (data.results || []).map(yt => ({
        id: `yt-${yt.videoId}`,
        videoId: yt.videoId,
        title: yt.title,
        channelTitle: yt.channelTitle,
        thumbnail: yt.thumbnail,
        duration: yt.duration,
        year: yt.publishedAt ? yt.publishedAt.slice(0, 4) : null,
        entityType: 'track',
        isExternal: true,
        nativeAvailable: false,
      })),
      nextPageToken: data.nextPageToken || null
    };
  } catch (err) {
    console.warn('YouTube search failed:', err);
    if (retries > 0) return await searchYouTube(query, pageToken, retries - 1);
    return { results: [] };
  }
}

/**
 * Search SoundCloud via our proxy API endpoint.
 * Returns normalized track results for display and playback.
 */
async function searchSoundCloud(query, offset = 0) {
  try {
    const res = await fetch('/api/soundcloud-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 33, offset }),
    });
    if (!res.ok) {
      return { results: [], playlists: [], hasMore: false, nextOffset: 0 };
    }
    const data = await res.json();
    const results = (data.results || []).map(r => ({
      id: `sc-${r.trackId}`,
      trackId: r.trackId,
      title: r.title,
      artistName: r.artistName,
      artworkUrl: r.artworkUrl,
      duration: r.duration,
      permalinkUrl: r.permalinkUrl,
      playbackCount: r.playbackCount,
      genre: r.genre,
      year: r.year || null,
      isExternal: true,
      provider: 'soundcloud',
    }));
    const playlists = (data.playlists || []).map(pl => ({
      id: `sc-pl-${pl.playlistId}`,
      playlistId: pl.playlistId,
      title: pl.title,
      artistName: pl.artistName,
      artworkUrl: pl.artworkUrl,
      trackCount: pl.trackCount,
      permalinkUrl: pl.permalinkUrl,
      duration: pl.duration,
      tracks: pl.tracks || [],
      isExternal: true,
      provider: 'soundcloud',
      entityType: 'playlist',
    }));
    return { results, playlists, hasMore: !!data.hasMore, nextOffset: data.nextOffset || offset + results.length };
  } catch (err) {
    console.warn('SoundCloud search failed:', err);
    return { results: [], playlists: [], hasMore: false, nextOffset: 0 };
  }
}

/**
 * Search Bandcamp via our scraping proxy endpoint.
 */
async function searchBandcamp(query, { reportFailure = false } = {}) {
  const fail = () => { const out = []; if (reportFailure) out.failed = true; return out; };
  try {
    const res = await postWithRetry('/api/bandcamp-search', { query }, 1);
    if (!res.ok) return fail();
    const data = await res.json();
    // An empty Bandcamp answer for a real query is almost always a temporary hiccup — flag it for a retry
    if (reportFailure && !(data.results || []).length) return fail();
    return (data.results || []).map((r, i) => ({
      id: `bc-${i}-${r.trackId || ''}-${r.type || ''}`,
      entityType: r.type,
      title: r.title,
      artistName: r.artistName,
      artworkUrl: r.artworkUrl,
      trackUrl: r.trackUrl,
      albumName: r.albumName,
      genre: r.genre,
      released: r.released,
      isExternal: true,
      provider: 'bandcamp',
    }));
  } catch (err) {
    console.warn('Bandcamp search failed:', err);
    return fail();
  }
}

/**
 * Resolve a Bandcamp track page URL to its audio stream ({ streamUrl, duration, ... }).
 * - Native iOS bridge first (bypasses Bandcamp IP blocks), server API as fallback.
 * - Results are cached for 10 min and concurrent calls share one request, so a result
 *   that was prefetched (visible in search, or touched) starts instantly when tapped.
 */
const bcResolveCache = new Map(); // trackUrl -> { ts, value } | { promise }
const BC_RESOLVE_TTL = 10 * 60 * 1000;

function resolveViaBridge(trackUrl, targetTitle, timeoutMs) {
  const bridge = typeof window !== 'undefined' && window.webkit?.messageHandlers?.bandcamp;
  if (!bridge) return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackId = Math.random().toString(36).substring(2, 10);
    window.__kyoyuBandcampCallbacks = window.__kyoyuBandcampCallbacks || {};
    window.__kyoyuBandcampCallback = window.__kyoyuBandcampCallback || ((id, data) => {
      const cb = window.__kyoyuBandcampCallbacks && window.__kyoyuBandcampCallbacks[id];
      if (cb) { delete window.__kyoyuBandcampCallbacks[id]; cb(data); }
    });
    const timeout = setTimeout(() => {
      if (window.__kyoyuBandcampCallbacks[callbackId]) {
        delete window.__kyoyuBandcampCallbacks[callbackId];
        resolve(null);
      }
    }, timeoutMs);
    window.__kyoyuBandcampCallbacks[callbackId] = (data) => {
      clearTimeout(timeout);
      resolve(data && data.streamUrl ? data : null);
    };
    try { bridge.postMessage({ url: trackUrl, callbackId, title: targetTitle }); }
    catch (e) { clearTimeout(timeout); delete window.__kyoyuBandcampCallbacks[callbackId]; resolve(null); }
  });
}

async function resolveViaServer(trackUrl) {
  try {
    const res = await fetch('/api/bandcamp-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trackUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && !data.error && data.streamUrl ? data : null;
  } catch (e) { return null; }
}

async function resolveBandcampUncached(trackUrl, targetTitle) {
  const viaBridge = await resolveViaBridge(trackUrl, targetTitle, 6000);
  if (viaBridge) return viaBridge;
  return resolveViaServer(trackUrl);
}

export async function resolveBandcamp(trackUrl, targetTitle = "") {
  if (!trackUrl) return null;
  const hit = bcResolveCache.get(trackUrl);
  if (hit) {
    if (hit.promise) return hit.promise;
    if (Date.now() - hit.ts < BC_RESOLVE_TTL) return hit.value;
    bcResolveCache.delete(trackUrl);
  }
  const promise = resolveBandcampUncached(trackUrl, targetTitle)
    .catch((err) => { console.warn('Bandcamp resolve failed:', err); return null; })
    .then((value) => {
      if (value?.streamUrl) bcResolveCache.set(trackUrl, { ts: Date.now(), value });
      else bcResolveCache.delete(trackUrl);
      return value;
    });
  bcResolveCache.set(trackUrl, { promise });
  if (bcResolveCache.size > 200) bcResolveCache.delete(bcResolveCache.keys().next().value);
  return promise;
}

/** Warm the resolve cache (fire and forget). */
export function prefetchBandcamp(trackUrl, targetTitle = "") {
  if (!trackUrl || !/^https?:\/\//.test(trackUrl)) return;
  resolveBandcamp(trackUrl, targetTitle).catch(() => {});
}

/** Forget a cached stream (e.g. the player reported it could not load it). */
export function invalidateBandcampResolve(trackUrl) {
  if (trackUrl) bcResolveCache.delete(trackUrl);
}

/**
 * Search a single provider by name. Used for retry when provider filter changes.
 * @param {'youtube'|'soundcloud'|'bandcamp'|'discogs'} provider
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchSingleProvider(provider, query, paginationCursor = null) {
  if (!query || query.trim().length === 0) return { results: [], pagination: {} };
  const q = query.trim();
  switch (provider) {
    case 'youtube': {
      const data = await searchYouTube(q, paginationCursor?.nextPageToken || null);
      return { results: data.results, pagination: { nextPageToken: data.nextPageToken } };
    }
    case 'soundcloud': {
      const data = await searchSoundCloud(q, paginationCursor?.nextOffset || 0);
      return { results: data.results, pagination: { hasMore: data.hasMore, nextOffset: data.nextOffset } };
    }
    case 'bandcamp': return { results: await searchBandcamp(q), pagination: {} };
    case 'discogs': {
      const data = await searchDiscogs(q, paginationCursor?.nextOffset || 0);
      return { results: data.results, pagination: { hasMore: data.hasMore, nextOffset: data.nextOffset } };
    }
    default: return { results: [], pagination: {} };
  }
}


/**
 * Run unified search: native catalog + Discogs + YouTube + SoundCloud + Bandcamp, merged and deduplicated.
 * Native results always come first.
 * 
 * @param {string} query - Search query (min 2 chars)
 * @returns {{ nativeTracks: Array, external: { artists: Array, releases: Array, labels: Array, youtube: Array, soundcloud: Array, bandcamp: Array } }}
 */
// Recent complete answers, so re-running the same search is instant and identical
const unifiedCache = new Map();
const UNIFIED_CACHE_TTL = 10 * 60 * 1000;

/** Discogs results → { artists, releases, labels } (same shape unifiedSearch returns). */
export function categorizeDiscogs(discogsResults) {
  return categorizeDiscogsResults(discogsResults || [], []);
}

export async function unifiedSearch(query) {
  if (!query || query.trim().length === 0) {
    return { nativeTracks: [], external: { artists: [], releases: [], labels: [], youtube: [], soundcloud: [], bandcamp: [] } };
  }
  
  let trimmed = query.trim();
  const cacheKey = trimmed.toLowerCase();
  const hit = unifiedCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < UNIFIED_CACHE_TTL) return hit.value;
  
  // Run all searches in parallel with the user's exact query
  const [nativeTracks, discogsData, ytData, scData, bcData] = await Promise.all([
    fetchPublicTracks(trimmed).catch(() => []),
    searchDiscogs(trimmed),
    searchYouTube(trimmed),
    searchSoundCloud(trimmed),
    searchBandcamp(trimmed, { reportFailure: true }),
  ]);
  
  // Categorize and deduplicate Discogs results
  const external = categorizeDiscogsResults(discogsData.results || [], nativeTracks);
  
  external.youtube = ytData.results || [];
  external.soundcloud = scData.results || [];
  external.soundcloudPlaylists = scData.playlists || [];
  external.bandcamp = bcData;
  
  // Pagination cursors for "Load More" per provider
  const pagination = {
    youtube: { nextPageToken: ytData.nextPageToken },
    soundcloud: { hasMore: scData.hasMore, nextOffset: scData.nextOffset },
    discogs: { hasMore: discogsData.hasMore, nextOffset: discogsData.nextOffset }
  };

  // Providers that failed (not "no results") — the Search page retries these in the background
  const failed = [];
  if (discogsData.failed) failed.push('discogs');
  if (bcData.failed) failed.push('bandcamp');

  const value = { nativeTracks, external, pagination, failed };
  if (failed.length === 0) {
    unifiedCache.set(cacheKey, { value, ts: Date.now() });
    if (unifiedCache.size > 50) unifiedCache.delete(unifiedCache.keys().next().value);
  }
  return value;
}

/** Remember a search answer once the background retry has filled in the missing providers. */
export function cacheUnifiedResult(query, value) {
  if (!query) return;
  unifiedCache.set(query.trim().toLowerCase(), { value, ts: Date.now() });
}

export { parseDiscogsTitle, searchDiscogs, searchYouTube, searchSoundCloud, searchBandcamp };
