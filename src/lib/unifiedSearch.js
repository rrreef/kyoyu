/**
 * Unified search across native catalog + Discogs external metadata.
 * Native results are always ranked first when an exact match exists.
 */
import { fetchPublicTracks } from './uploadPipeline';

/**
 * Search Discogs via our proxy API endpoint.
 * Returns normalized results that can be merged with native results.
 */
async function searchDiscogs(query) {
  try {
    const res = await fetch('/api/discogs-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, perPage: 100 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(r => ({
      id: `discogs-${r.type}-${r.discogsId}`,
      discogsId: r.discogsId,
      type: r.type, // 'artist', 'release', 'master', 'label'
      title: r.title,
      thumb: r.thumb || null,
      coverImage: r.coverImage || null,
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
  } catch (err) {
    console.warn('Discogs search failed:', err);
    return [];
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
async function searchYouTube(query) {
  try {
    // Page 1
    const res = await fetch('/api/youtube-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${query} music`, maxResults: 50 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const page1 = (data.results || []).map(r => ({
      id: `yt-${r.videoId}`,
      videoId: r.videoId,
      title: r.title,
      channelTitle: r.channelTitle,
      thumbnail: r.thumbnail,
      duration: r.duration,
      publishedAt: r.publishedAt,
      isExternal: true,
      provider: 'youtube',
    }));

    // Page 2 if there's a nextPageToken
    if (data.nextPageToken) {
      try {
        const res2 = await fetch('/api/youtube-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `${query} music`, maxResults: 50, pageToken: data.nextPageToken }),
        });
        if (res2.ok) {
          const data2 = await res2.json();
          const page2 = (data2.results || []).map(r => ({
            id: `yt-${r.videoId}`,
            videoId: r.videoId,
            title: r.title,
            channelTitle: r.channelTitle,
            thumbnail: r.thumbnail,
            duration: r.duration,
            publishedAt: r.publishedAt,
            isExternal: true,
            provider: 'youtube',
          }));
          return [...page1, ...page2];
        }
      } catch {}
    }
    return page1;
  } catch (err) {
    console.warn('YouTube search failed:', err);
    return [];
  }
}

/**
 * Search SoundCloud via our proxy API endpoint.
 * Returns normalized track results for display and playback.
 */
async function searchSoundCloud(query) {
  try {
    const res = await fetch('/api/soundcloud-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 50 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(r => ({
      id: `sc-${r.trackId}`,
      trackId: r.trackId,
      title: r.title,
      artistName: r.artistName,
      artworkUrl: r.artworkUrl,
      duration: r.duration,
      permalinkUrl: r.permalinkUrl,
      playbackCount: r.playbackCount,
      genre: r.genre,
      isExternal: true,
      provider: 'soundcloud',
    }));
  } catch (err) {
    console.warn('SoundCloud search failed:', err);
    return [];
  }
}

/**
 * Run unified search: native catalog + Discogs + YouTube + SoundCloud, merged and deduplicated.
 * Native results always come first.
 * 
 * @param {string} query - Search query (min 2 chars)
 * @returns {{ nativeTracks: Array, external: { artists: Array, releases: Array, labels: Array, youtube: Array, soundcloud: Array } }}
 */
export async function unifiedSearch(query) {
  if (!query || query.trim().length < 2) {
    return { nativeTracks: [], external: { artists: [], releases: [], labels: [], youtube: [], soundcloud: [] } };
  }
  
  const trimmed = query.trim();
  
  // Run all searches in parallel
  const [nativeTracks, discogsResults, youtubeResults, soundcloudResults] = await Promise.all([
    fetchPublicTracks(trimmed).catch(() => []),
    searchDiscogs(trimmed),
    searchYouTube(trimmed),
    searchSoundCloud(trimmed),
  ]);
  
  // Categorize and deduplicate Discogs results
  const external = categorizeDiscogsResults(discogsResults, nativeTracks);
  external.youtube = youtubeResults;
  external.soundcloud = soundcloudResults;
  
  return { nativeTracks, external };
}

export { parseDiscogsTitle, searchDiscogs, searchYouTube, searchSoundCloud };
