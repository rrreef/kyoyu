const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW_MS = 60000;

// Simple in-memory rate limiting
let requestCounts = {
  count: 0,
  resetTime: Date.now() + RATE_LIMIT_WINDOW_MS
};

function checkRateLimit() {
  const now = Date.now();
  if (now > requestCounts.resetTime) {
    requestCounts.count = 0;
    requestCounts.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  
  if (requestCounts.count >= RATE_LIMIT) {
    return false;
  }
  requestCounts.count++;
  return true;
}

function parseISO8601Duration(iso) {
  if (!iso) return 0;
  
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = (parseInt(match[1]) || 0);
  const minutes = (parseInt(match[2]) || 0);
  const seconds = (parseInt(match[3]) || 0);
  
  return hours * 3600 + minutes * 60 + seconds;
}


async function scrapeYouTube(query) {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{.*?\});/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const items = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    
    return items.filter(i => i.videoRenderer).map(i => {
      const v = i.videoRenderer;
      return {
        videoId: v.videoId,
        title: v.title?.runs?.[0]?.text || '',
        channelTitle: v.ownerText?.runs?.[0]?.text || '',
        thumbnail: v.thumbnail?.thumbnails?.[0]?.url || '',
        duration: v.lengthText?.simpleText || '0:00'
      };
    }).slice(0, 33);
  } catch (err) {
    console.error("Scraper fallback failed:", err);
    return [];
  }
}

export default async function handler(req, res) {
  // CORS configuration
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  // Allow localhost for local development testing
  else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check rate limit
  if (!checkRateLimit()) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Parse body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const query = body?.query;
  const provider = body?.provider;

  if (provider === 'spotify') {
    const limit = Math.min(parseInt(body?.limit) || 10, 10);
    const offset = parseInt(body?.offset) || 0;
    const clientId = process.env.SPOTIFY_CLIENT_ID || '2f6a4c4add46410f83e1550aaf07690a';
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '589bed253e4f4395a1c4e77f93719ecd';

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
        },
        body: 'grant_type=client_credentials'
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return res.status(500).json({ error: 'Failed to get Spotify token' });

      if (body?.action === 'fetch-spotify-album') {
        const albumId = body.albumId.replace('sp-al-', '');
        const albumRes = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const albumData = await albumRes.json();
        return res.status(200).json({
          tracks: (albumData.tracks?.items || []).map(t => ({
            id: `sp-${t.id}`,
            spotifyId: t.id,
            title: t.name,
            artistName: t.artists.map(a => a.name).join(', '),
            duration: Math.floor(t.duration_ms / 1000),
            url: t.external_urls?.spotify,
            provider: 'spotify',
          }))
        });
      }

      const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,album,artist,playlist&limit=${limit}&offset=${offset}`, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok) {
        return res.status(200).json({ results: [], hasMore: false, nextOffset: offset, error: searchData?.error?.message || `Spotify ${searchRes.status}` });
      }
      // Spotify returns `null` entries inside item arrays (esp. playlists) — drop them
      for (const k of ['artists', 'albums', 'tracks', 'playlists']) {
        if (searchData[k]?.items) searchData[k].items = searchData[k].items.filter(Boolean);
      }
      
      const results = [];
      
      if (searchData.artists?.items) {
        searchData.artists.items.forEach(a => {
          results.push({
            id: `sp-ar-${a.id}`,
            spotifyId: a.id,
            title: a.name,
            artistName: a.name,
            artworkUrl: a.images?.[0]?.url,
            url: a.external_urls?.spotify,
            provider: 'spotify',
            entityType: 'artist',
            isExternal: true
          });
        });
      }

      if (searchData.albums?.items) {
        searchData.albums.items.forEach(a => {
          results.push({
            id: `sp-al-${a.id}`,
            spotifyId: a.id,
            title: a.name,
            artistName: (a.artists || []).map(x => x.name).join(', '),
            artworkUrl: a.images?.[0]?.url,
            url: a.external_urls?.spotify,
            provider: 'spotify',
            entityType: 'album',
            isExternal: true
          });
        });
      }

      if (searchData.tracks?.items) {
        searchData.tracks.items.forEach(t => {
          results.push({
            id: `sp-${t.id}`,
            spotifyId: t.id,
            title: t.name,
            artistName: (t.artists || []).map(a => a.name).join(', '),
            artworkUrl: t.album?.images?.[0]?.url,
            duration: Math.floor((t.duration_ms || 0) / 1000),
            albumName: t.album?.name,
            url: t.external_urls?.spotify,
            provider: 'spotify',
            entityType: 'track',
            isExternal: true
          });
        });
      }

      if (searchData.playlists?.items) {
        searchData.playlists.items.forEach(p => {
          results.push({
            id: `sp-pl-${p.id}`,
            spotifyId: p.id,
            title: p.name,
            artistName: p.owner?.display_name || 'Spotify',
            artworkUrl: p.images?.[0]?.url,
            url: p.external_urls?.spotify,
            provider: 'spotify',
            entityType: 'playlist',
            isExternal: true
          });
        });
      }

      return res.status(200).json({ 
        results,
        hasMore: !!searchData.tracks?.next || !!searchData.albums?.next || !!searchData.artists?.next || !!searchData.playlists?.next,
        nextOffset: offset + limit
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (provider === 'tidal') {
    const limit = Math.min(parseInt(body?.limit) || 15, 20);
    const offset = parseInt(body?.offset) || 0;
    const clientId = process.env.TIDAL_CLIENT_ID || 'jU87e7CKYfOO2pzi';
    const clientSecret = process.env.TIDAL_CLIENT_SECRET || '2LOdXyTnJviPOjTP3R3Pr7PU4BwMtxuZyDHD6ba6GdA=';
    const countryCode = body?.countryCode || 'US';

    const mergeIntoIndex = (json, idx = {}) => {
      if (!json) return idx;
      const d = json.data;
      if (Array.isArray(d)) {
        for (const item of d) {
          if (item?.type && item?.id) idx[`${item.type}:${item.id}`] = item;
        }
      } else if (d?.type && d?.id) {
        idx[`${d.type}:${d.id}`] = d;
      }
      if (Array.isArray(json.included)) {
        for (const item of json.included) {
          if (item?.type && item?.id) idx[`${item.type}:${item.id}`] = item;
        }
      }
      return idx;
    };

    const resolveArtists = (refs = [], idx = {}) => {
      const names = refs
        .map((r) => idx[`artists:${r.id}`]?.attributes?.name)
        .filter(Boolean);
      return names.length ? names.join(', ') : 'Unknown Artist';
    };

    const resolveArtwork = (refs = [], idx = {}) => {
      for (const r of refs) {
        const art = idx[`artworks:${r.id}`];
        const files = art?.attributes?.files || art?.attributes?.imageLinks || [];
        if (files.length) {
          const pick640 = files.find((f) => f?.meta?.width === 640);
          const pick320 = files.find((f) => f?.meta?.width === 320);
          const href = (pick640 || pick320 || files[0])?.href;
          if (href) return href;
        }
      }
      return '';
    };

    const v1CoverUrl = (uuid) => {
      if (!uuid) return '';
      return `https://resources.tidal.com/images/${String(uuid).replace(/-/g, '/')}/640x640.jpg`;
    };

    try {
      const tokenRes = await fetch('https://auth.tidal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
        },
        body: 'grant_type=client_credentials'
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return res.status(500).json({ error: 'Failed to get TIDAL token' });

      const tdHeaders = {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.api+json'
      };

      const hydrateResources = async ({ trackIds = [], albumIds = [], artistIds = [] }, idx) => {
        if (trackIds.length) {
          const r = await fetch(
            `https://openapi.tidal.com/v2/tracks?filter%5Bid%5D=${encodeURIComponent(trackIds.slice(0, 20).join(','))}&countryCode=${countryCode}&include=artists,albums`,
            { headers: tdHeaders }
          ).catch(() => null);
          if (r?.ok) mergeIntoIndex(await r.json().catch(() => null), idx);
        }
        const allAlbumIds = new Set(albumIds.filter(Boolean));
        for (const tid of trackIds) {
          const tObj = idx[`tracks:${tid}`];
          for (const aRef of tObj?.relationships?.albums?.data || []) {
            if (aRef?.id) allAlbumIds.add(aRef.id);
          }
        }
        if (allAlbumIds.size) {
          const r = await fetch(
            `https://openapi.tidal.com/v2/albums?filter%5Bid%5D=${encodeURIComponent(Array.from(allAlbumIds).slice(0, 20).join(','))}&countryCode=${countryCode}&include=artists,coverArt`,
            { headers: tdHeaders }
          ).catch(() => null);
          if (r?.ok) mergeIntoIndex(await r.json().catch(() => null), idx);
        }
        if (artistIds.length) {
          const r = await fetch(
            `https://openapi.tidal.com/v2/artists?filter%5Bid%5D=${encodeURIComponent(artistIds.slice(0, 20).join(','))}&countryCode=${countryCode}&include=profileArt`,
            { headers: tdHeaders }
          ).catch(() => null);
          if (r?.ok) mergeIntoIndex(await r.json().catch(() => null), idx);
        }
      };

      if (body?.action === 'fetch-tidal-album') {
        const albumId = String(body.albumId || '').replace(/^(album:|td-al-|tdab-|td-|tidal-)/i, '');
        const albumRes = await fetch(
          `https://openapi.tidal.com/v2/albums/${encodeURIComponent(albumId)}?countryCode=${countryCode}&include=items,coverArt,artists`,
          { headers: tdHeaders }
        );
        if (albumRes.ok) {
          const albumData = await albumRes.json();
          const idx = mergeIntoIndex(albumData, {});
          const rels = albumData.data?.relationships || {};
          const fallbackArtist = resolveArtists(rels.artists?.data || [], idx);
          const fallbackCover = resolveArtwork(rels.coverArt?.data || [], idx);
          const itemRefs = rels.items?.data || [];
          const trackIds = itemRefs.map((r) => r.id).filter(Boolean);
          await hydrateResources({ trackIds }, idx);
          const tracks = trackIds.map((tid) => {
            const t = idx[`tracks:${tid}`];
            if (!t) return null;
            const attrs = t.attributes || {};
            const tRels = t.relationships || {};
            const artistName = resolveArtists(tRels.artists?.data || [], idx);
            return {
              id: `td-${t.id}`,
              tidalId: t.id,
              providerItemId: t.id,
              title: attrs.title || 'Unknown Track',
              artistName: artistName !== 'Unknown Artist' ? artistName : fallbackArtist,
              artworkUrl: fallbackCover,
              duration: parseISO8601Duration(attrs.duration),
              url: attrs.externalLinks?.[0]?.href || `https://tidal.com/browse/track/${t.id}`,
              provider: 'tidal'
            };
          }).filter(Boolean);
          return res.status(200).json({ tracks });
        }
        return res.status(200).json({ tracks: [] });
      }

      if (body?.action === 'fetch-tidal-playlist') {
        const playlistId = String(body.playlistId || '').replace(/^(playlist:|td-pl-|tdpl-|td-|tidal-)/i, '');
        const plRes = await fetch(
          `https://openapi.tidal.com/v2/playlists/${encodeURIComponent(playlistId)}?countryCode=${countryCode}&include=items,coverArt`,
          { headers: tdHeaders }
        );
        if (plRes.ok) {
          const plData = await plRes.json();
          const idx = mergeIntoIndex(plData, {});
          const rels = plData.data?.relationships || {};
          const fallbackCover = resolveArtwork(rels.coverArt?.data || [], idx);
          const itemRefs = rels.items?.data || [];
          const trackIds = itemRefs.map((r) => r.id).filter(Boolean);
          await hydrateResources({ trackIds }, idx);
          const tracks = trackIds.map((tid) => {
            const t = idx[`tracks:${tid}`];
            if (!t) return null;
            const attrs = t.attributes || {};
            const tRels = t.relationships || {};
            const artistName = resolveArtists(tRels.artists?.data || [], idx);
            const firstAlbId = tRels.albums?.data?.[0]?.id;
            const albObj = firstAlbId ? idx[`albums:${firstAlbId}`] : null;
            const cover = albObj ? resolveArtwork(albObj.relationships?.coverArt?.data || [], idx) : fallbackCover;
            return {
              id: `td-${t.id}`,
              tidalId: t.id,
              providerItemId: t.id,
              title: attrs.title || 'Unknown Track',
              artistName,
              artworkUrl: cover || fallbackCover,
              duration: parseISO8601Duration(attrs.duration),
              url: attrs.externalLinks?.[0]?.href || `https://tidal.com/browse/track/${t.id}`,
              provider: 'tidal'
            };
          }).filter(Boolean);
          return res.status(200).json({ tracks });
        }
        return res.status(200).json({ tracks: [] });
      }

      const searchUrl = `https://openapi.tidal.com/v2/searchResults?filter%5Bquery%5D=${encodeURIComponent(query)}&explicitFilter=INCLUDE&countryCode=${countryCode}&include=tracks,albums,artists,playlists,topHits`;
      const searchRes = await fetch(searchUrl, { headers: tdHeaders });
      const results = [];

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const idx = mergeIntoIndex(searchData, {});
        const dataNode = Array.isArray(searchData.data) ? searchData.data[0] : searchData.data;
        const rels = dataNode?.relationships || {};

        const artistIds = (rels.artists?.data || []).slice(0, limit).map((r) => r.id).filter(Boolean);
        const albumIds = (rels.albums?.data || []).slice(0, limit).map((r) => r.id).filter(Boolean);
        const trackIds = (rels.tracks?.data || []).slice(0, limit).map((r) => r.id).filter(Boolean);
        const playlistIds = (rels.playlists?.data || []).slice(0, limit).map((r) => r.id).filter(Boolean);

        await hydrateResources({ trackIds, albumIds, artistIds }, idx);

        for (const arid of artistIds) {
          const a = idx[`artists:${arid}`];
          if (!a?.attributes?.name) continue;
          const cover = resolveArtwork(a.relationships?.profileArt?.data || [], idx);
          results.push({
            id: `td-ar-${a.id}`,
            tidalId: a.id,
            providerItemId: a.id,
            title: a.attributes.name,
            artistName: a.attributes.name,
            artworkUrl: cover,
            url: a.attributes.externalLinks?.[0]?.href || `https://tidal.com/browse/artist/${a.id}`,
            provider: 'tidal',
            entityType: 'artist',
            isExternal: true
          });
        }

        for (const aid of albumIds) {
          const a = idx[`albums:${aid}`];
          if (!a?.attributes?.title) continue;
          const cover = resolveArtwork(a.relationships?.coverArt?.data || [], idx);
          const artistName = resolveArtists(a.relationships?.artists?.data || [], idx);
          results.push({
            id: `td-al-${a.id}`,
            tidalId: a.id,
            providerItemId: a.id,
            title: a.attributes.title,
            artistName,
            artworkUrl: cover,
            url: a.attributes.externalLinks?.[0]?.href || `https://tidal.com/browse/album/${a.id}`,
            provider: 'tidal',
            entityType: 'album',
            isExternal: true
          });
        }

        for (const tid of trackIds) {
          const t = idx[`tracks:${tid}`];
          if (!t?.attributes?.title) continue;
          const attrs = t.attributes;
          const tRels = t.relationships || {};
          const artistName = resolveArtists(tRels.artists?.data || [], idx);
          const firstAlbId = tRels.albums?.data?.[0]?.id;
          const albObj = firstAlbId ? idx[`albums:${firstAlbId}`] : null;
          const albumName = albObj?.attributes?.title || '';
          const cover = albObj ? resolveArtwork(albObj.relationships?.coverArt?.data || [], idx) : '';
          results.push({
            id: `td-${t.id}`,
            tidalId: t.id,
            providerItemId: t.id,
            title: attrs.title,
            artistName,
            artworkUrl: cover,
            duration: parseISO8601Duration(attrs.duration),
            albumName,
            url: attrs.externalLinks?.[0]?.href || `https://tidal.com/browse/track/${t.id}`,
            provider: 'tidal',
            entityType: 'track',
            isExternal: true
          });
        }

        for (const pid of playlistIds) {
          const p = idx[`playlists:${pid}`];
          const title = p?.attributes?.name || p?.attributes?.title;
          if (!title) continue;
          const cover = resolveArtwork(p.relationships?.coverArt?.data || [], idx);
          results.push({
            id: `td-pl-${p.id}`,
            tidalId: p.id,
            providerItemId: p.id,
            title,
            artistName: 'TIDAL',
            artworkUrl: cover,
            url: p.attributes?.externalLinks?.[0]?.href || `https://tidal.com/browse/playlist/${p.id}`,
            provider: 'tidal',
            entityType: 'playlist',
            isExternal: true
          });
        }
      }

      if (!results.length) {
        // Fallback: TIDAL v1 search
        const v1Res = await fetch(
          `https://api.tidal.com/v1/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&types=TRACKS,ALBUMS,ARTISTS,PLAYLISTS&countryCode=${countryCode}`,
          { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
        ).catch(() => null);
        if (v1Res?.ok) {
          const v1 = await v1Res.json().catch(() => ({}));
          for (const a of v1.artists?.items || []) {
            results.push({
              id: `td-ar-${a.id}`,
              tidalId: String(a.id),
              providerItemId: String(a.id),
              title: a.name,
              artistName: a.name,
              artworkUrl: v1CoverUrl(a.picture),
              url: `https://tidal.com/browse/artist/${a.id}`,
              provider: 'tidal',
              entityType: 'artist',
              isExternal: true
            });
          }
          for (const a of v1.albums?.items || []) {
            results.push({
              id: `td-al-${a.id}`,
              tidalId: String(a.id),
              providerItemId: String(a.id),
              title: a.title,
              artistName: a.artist?.name || (a.artists || []).map((x) => x.name).join(', ') || 'Unknown Artist',
              artworkUrl: v1CoverUrl(a.cover),
              url: `https://tidal.com/browse/album/${a.id}`,
              provider: 'tidal',
              entityType: 'album',
              isExternal: true
            });
          }
          for (const t of v1.tracks?.items || []) {
            results.push({
              id: `td-${t.id}`,
              tidalId: String(t.id),
              providerItemId: String(t.id),
              title: t.title,
              artistName: t.artist?.name || (t.artists || []).map((x) => x.name).join(', ') || 'Unknown Artist',
              artworkUrl: v1CoverUrl(t.album?.cover),
              duration: t.duration || 0,
              albumName: t.album?.title || '',
              url: `https://tidal.com/browse/track/${t.id}`,
              provider: 'tidal',
              entityType: 'track',
              isExternal: true
            });
          }
          for (const p of v1.playlists?.items || []) {
            results.push({
              id: `td-pl-${p.uuid}`,
              tidalId: String(p.uuid),
              providerItemId: String(p.uuid),
              title: p.title,
              artistName: 'TIDAL',
              artworkUrl: v1CoverUrl(p.squareImage || p.image),
              url: `https://tidal.com/browse/playlist/${p.uuid}`,
              provider: 'tidal',
              entityType: 'playlist',
              isExternal: true
            });
          }
        }
      }

      return res.status(200).json({
        results,
        hasMore: false,
        nextOffset: offset + limit
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  const maxResults = Math.min(parseInt(body?.maxResults) || 10, 50);
  const type = body?.type || 'video,playlist,channel';
  const pageToken = body?.pageToken || null;

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY is missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 1. Search for videos, playlists, and channels
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: type,
      maxResults: maxResults.toString(),
      key: apiKey
    });
    if (pageToken) searchParams.set('pageToken', pageToken);

    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
    
    if (!searchRes.ok) {
      console.error('YouTube Search API error:', searchRes.status, '- attempting scraper fallback');
      const fallbackResults = (await scrapeYouTube(query)).filter(r => /^[\w-]{11}$/.test(r?.videoId || ''));
      return res.status(200).json({ results: fallbackResults, hasMore: false, nextPageToken: null });
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    
    if (items.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const results = [];
    const videoIds = [];

    // Only real videos are playable. Playlist ("PL…") and channel ("UC…") ids are NOT video ids:
    // handing them to the player made the track load forever, so they are never returned.
    items.forEach(item => {
      if (item.id?.videoId) {
        videoIds.push(item.id.videoId);
      }
    });

    if (videoIds.length > 0) {
      // 2. Fetch video details for duration
      const videosParams = new URLSearchParams({
        part: 'contentDetails',
        id: videoIds.join(','),
        key: apiKey
      });

    const videosRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`);
    
    if (!videosRes.ok) {
      const errorData = await videosRes.json().catch(() => ({}));
      console.error('YouTube Videos API error:', errorData);
      return res.status(videosRes.status).json({ error: 'Failed to fetch video details' });
    }

    const videosData = await videosRes.json();
    const durationMap = {};
    
    if (videosData.items) {
      videosData.items.forEach(video => {
        durationMap[video.id] = parseISO8601Duration(video.contentDetails?.duration);
      });
    }

    // 3. Transform response for videos
    items.forEach(item => {
      if (item.id?.videoId) {
        const snippet = item.snippet;
        const videoId = item.id.videoId;
        
        results.push({
          videoId: videoId,
          title: snippet.title,
          channelTitle: snippet.channelTitle,
          thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || snippet.thumbnails?.high?.url,
          duration: durationMap[videoId] || 0,
          publishedAt: snippet.publishedAt,
          entityType: 'track',
          provider: 'youtube',
          isExternal: true
        });
      }
    });
    }

    return res.status(200).json({ results, nextPageToken: searchData.nextPageToken || null });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
