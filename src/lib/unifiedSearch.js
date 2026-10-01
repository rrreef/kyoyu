/**
 * Unified search across native catalog + Discogs external metadata.
 * Native results are always ranked first when an exact match exists.
 */
import { fetchPublicTracks } from './uploadPipeline';

/**
 * Search Discogs via our proxy API endpoint.
 * Returns normalized results that can be merged with native results.
 */
async function searchDiscogs(query, offset = 0) {
  try {
    const page = Math.floor(offset / 33) + 1;
    const res = await fetch('/api/discogs-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, perPage: 33, page }),
    });
    if (!res.ok) return { results: [], hasMore: false, nextOffset: offset };
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
      isExternal: true,
      nativeAvailable: false,
    }));
    const hasMore = (data.pagination?.pages > page) || (results.length === 33);
    const nextOffset = offset + results.length;
    return { results, hasMore, nextOffset };
  } catch (err) {
    console.warn('Discogs search failed:', err);
    return { results: [], hasMore: false, nextOffset: offset };
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
async function searchBandcamp(query) {
  try {
    const res = await fetch('/api/bandcamp-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r, i) => ({
      id: `bc-${i}-${Date.now()}`,
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
    return [];
  }
}

/**
 * Resolve a Bandcamp track URL to get the audio stream URL.
 * Called when user clicks play on a Bandcamp result.
 */
export async function resolveBandcamp(trackUrl, targetTitle = "") {
  try {
    // If we are inside the native iOS app, use the BandcampBridge to bypass IP blocks
    if (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bandcamp) {
      return new Promise((resolve) => {
        const callbackId = Math.random().toString(36).substring(7);
        window.__kyoyuBandcampCallback = window.__kyoyuBandcampCallback || ((id, data) => {
          if (window.__kyoyuBandcampCallbacks && window.__kyoyuBandcampCallbacks[id]) {
            window.__kyoyuBandcampCallbacks[id](data);
            delete window.__kyoyuBandcampCallbacks[id];
          }
        });
        window.__kyoyuBandcampCallbacks = window.__kyoyuBandcampCallbacks || {};
        
        // Timeout just in case
        const timeout = setTimeout(() => {
           if (window.__kyoyuBandcampCallbacks[callbackId]) {
              window.__kyoyuBandcampCallbacks[callbackId]({ error: "Timeout" });
              delete window.__kyoyuBandcampCallbacks[callbackId];
           }
        }, 10000);
        
        window.__kyoyuBandcampCallbacks[callbackId] = (data) => {
          clearTimeout(timeout);
          if (data && data.streamUrl) resolve(data);
          else resolve(null);
        };
        
        window.webkit.messageHandlers.bandcamp.postMessage({ url: trackUrl, callbackId, title: targetTitle });
      });
    }

    const res = await fetch('/api/bandcamp-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trackUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error || !data.streamUrl) return null;
    return data;
  } catch (err) {
    console.warn('Bandcamp resolve failed:', err);
    return null;
  }
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
export async function unifiedSearch(query) {
  if (!query || query.trim().length === 0) {
    return { nativeTracks: [], external: { artists: [], releases: [], labels: [], youtube: [], soundcloud: [], bandcamp: [] } };
  }
  
  let trimmed = query.trim();
  
  // Run all searches in parallel with the user's exact query
  const [nativeTracks, discogsData, ytData, scData, bcData] = await Promise.all([
    fetchPublicTracks(trimmed).catch(() => []),
    searchDiscogs(trimmed),
    searchYouTube(trimmed),
    searchSoundCloud(trimmed),
    searchBandcamp(trimmed),
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
  
  return { nativeTracks, external, pagination };
}

export { parseDiscogsTitle, searchDiscogs, searchYouTube, searchSoundCloud, searchBandcamp };
