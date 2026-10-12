import { searchSingleProvider, unifiedSearch } from './unifiedSearch';

function mergeResults(nativeTracks, external) {
  let pool = [];
  // Ensure native tracks have provider: 'native' and normalize artist
  if (nativeTracks) {
    const nt = nativeTracks.map(t => ({ 
      ...t, 
      provider: 'native',
      artistName: t.artistName || t.artist || ''
    }));
    pool.push(...nt);
  }
  if (!external) return pool;
  
  // Normalize external tracks (just in case cache has missing provider)
  const norm = (arr, prov) => (arr || []).map(t => ({ ...t, provider: t.provider || prov, artistName: t.artistName || t.artist || '' }));
  
  pool.push(...norm(external.youtube, 'youtube'));
  pool.push(...norm(external.soundcloud, 'soundcloud'));
  pool.push(...norm(external.bandcamp, 'bandcamp'));
  pool.push(...norm(external.spotify, 'spotify'));
  pool.push(...norm(external.applemusic, 'applemusic'));
  return pool;
}

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export async function resolveAutoplay(currentTrack) {
  if (!currentTrack) return [];
  const p = currentTrack.provider || 'native';
  const cArtist = currentTrack.artistName || currentTrack.artist || '';
  const targetTerm = cArtist || currentTrack.title || 'music';
  
  const isTrack = (t) => (t.entityType === 'track' || !t.entityType) && t.title !== currentTrack.title;

  console.log('[Autoplay] Resolving next track for:', currentTrack.title, 'by', cArtist);

  try {
    // 1. If we have an album, try to fetch it first!
    if (currentTrack.album) {
      console.log('[Autoplay] Tier 1: Same Album');
      // Bypass cache to ensure we get fresh data with proper providers
      const { nativeTracks, external } = await unifiedSearch(currentTrack.album);
      const pool = mergeResults(nativeTracks, external).filter(isTrack);
      
      // Native priority
      const nativeAlbumPool = pool.filter(t => t.provider === 'native' && t.artistName === cArtist);
      if (nativeAlbumPool.length > 0) return [pickRandom(nativeAlbumPool)];
      
      // Original provider priority
      const albumPool = pool.filter(t => t.provider === p && t.artistName === cArtist);
      if (albumPool.length > 0) return [pickRandom(albumPool)];
    }

    // 2. Unified Search for the artist/title
    const { nativeTracks, external } = await unifiedSearch(targetTerm);
    const pool = mergeResults(nativeTracks, external).filter(isTrack);

    // Native Priority Tier: Always check if native app has the artist!
    const nativeArtistPool = pool.filter(t => t.provider === 'native' && t.artistName === cArtist);
    if (nativeArtistPool.length > 0) {
      console.log('[Autoplay] Tier 2: Native Artist Priority');
      return [pickRandom(nativeArtistPool)];
    }

    // Tier 3: Same Provider
    let sameProviderPool = pool.filter(t => t.provider === p && t.artistName === cArtist);
    if (sameProviderPool.length > 0) {
      console.log('[Autoplay] Tier 3: Same Provider');
      return [pickRandom(sameProviderPool)];
    }

    // Tier 4: Same Artist, Different Provider
    console.log('[Autoplay] Tier 4: Diff Provider');
    let diffProviderPool = pool.filter(t => t.provider !== p && t.artistName === cArtist);
    if (diffProviderPool.length > 0) {
      return [pickRandom(diffProviderPool)];
    }
    
    // Tier 4.5: Any track from same provider
    let anySameProvider = pool.filter(t => t.provider === p);
    if (anySameProvider.length > 0) return [pickRandom(anySameProvider)];

    // Tier 5: Fallback Suggestions
    return await fallbackSuggestions(currentTrack);
  } catch (e) {
    console.error('[Autoplay] fail', e);
    return [];
  }
}

async function fallbackSuggestions(track) {
  console.log('[Autoplay] Tier 5: Fallback Suggestions (Rule 5)');
  const firstWord = track.title.split(' ')[0] || 'music';
  try {
    const { nativeTracks, external } = await unifiedSearch(firstWord);
    let pool = mergeResults(nativeTracks, external).filter(t => (t.entityType === 'track' || !t.entityType) && t.title !== track.title);
    if (pool.length > 0) return [pickRandom(pool)];
  } catch (e) {}
  return [];
}
