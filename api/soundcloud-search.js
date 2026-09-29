// POST /api/soundcloud-search
// Body: { query: string, limit?: number }
// Returns: { results: [...] }
//
// Uses official SoundCloud API with OAuth2 client_credentials flow.
// Requires SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET in env.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Simple in-memory rate limiter
let requestLog = [];
const RATE_LIMIT = 50;
const RATE_WINDOW = 60000;

// Cached OAuth token
let cachedToken = null;
let tokenExpiresAt = 0;

// Cached web client_id (extracted from soundcloud.com JS bundles for v2 API)
// Pre-seeded with a known working value to avoid cold-start timeout
let cachedWebClientId = '3S7oLyCj5BwyR9w2KU2LQQGDwRda5EZ0';
let webClientIdExpiresAt = Date.now() + 3600000; // treat seed as valid for 1h

/**
 * Extract the internal web client_id from SoundCloud's JS bundles.
 * This is the same client_id the website uses with api-v2.
 * Cached for 1 hour.
 */
async function getWebClientId() {
  const now = Date.now();
  if (cachedWebClientId && now < webClientIdExpiresAt) {
    return cachedWebClientId;
  }
  try {
    const pageRes = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' }
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const scriptUrls = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    // client_id is in one of the last JS bundles
    for (const url of scriptUrls.slice(-5)) {
      const jsRes = await fetch(url);
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
      const cidMatch = js.match(/client_id:"([a-zA-Z0-9]+)"/);
      if (cidMatch) {
        cachedWebClientId = cidMatch[1];
        webClientIdExpiresAt = now + 3600000; // 1 hour
        return cachedWebClientId;
      }
    }
  } catch (e) {
    console.warn('Failed to extract SC web client_id:', e.message);
  }
  return null;
}

/**
 * Get an OAuth2 access token using client_credentials grant.
 * Caches the token until it expires.
 */
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken; // Return cached token (with 1min safety margin)
  }

  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SoundCloud credentials not configured');
  }

  const res = await fetch('https://api.soundcloud.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('SoundCloud OAuth error:', res.status, errText);
    throw new Error('Failed to get SoundCloud access token');
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // SoundCloud tokens typically last 3600s (1 hour)
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;

  return cachedToken;
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const now = Date.now();
  requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
  if (requestLog.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit reached' });
  }
  requestLog.push(now);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  // Check credentials exist
  if (!process.env.SOUNDCLOUD_CLIENT_ID || !process.env.SOUNDCLOUD_CLIENT_SECRET) {
    console.warn('SoundCloud credentials not configured');
    return res.status(200).json({ results: [] });
  }

  // ── Mode 1: Resolve stream URL for a single track ──
  const resolveTrackId = body?.resolveTrackId;
  if (resolveTrackId) {
    try {
      const token = await getAccessToken();

      // Fetch full track data to get transcodings
      const trackRes = await fetch(`https://api.soundcloud.com/tracks/${resolveTrackId}?representation=full`, {
        headers: {
          'Accept': 'application/json; charset=utf-8',
          'Authorization': `OAuth ${token}`,
        },
      });

      if (!trackRes.ok) {
        console.error('SoundCloud track fetch error:', trackRes.status);
        return res.status(404).json({ error: 'Track not found' });
      }

      const track = await trackRes.json();

      let streamUrl = null;

      // Method 1: Use the dedicated /streams endpoint (preferred — returns pre-resolved URLs)
      const streamsRes = await fetch(
        `https://api.soundcloud.com/tracks/${resolveTrackId}/streams`,
        {
          headers: {
            'Accept': 'application/json; charset=utf-8',
            'Authorization': `OAuth ${token}`,
          },
        }
      );

      if (streamsRes.ok) {
        const streams = await streamsRes.json();
        // Prefer high-quality AAC HLS, fall back to lower quality, then any available
        let candidateUrl = streams.hls_aac_160_url
          || streams.hls_aac_96_url
          || streams.hls_mp3_128_url
          || streams.http_mp3_128_url
          || null;

        // If none of the expected keys worked, try the first URL value we find
        if (!candidateUrl) {
          const keys = Object.keys(streams);
          for (const key of keys) {
            if (typeof streams[key] === 'string' && streams[key].startsWith('http')) {
              candidateUrl = streams[key];
              break;
            }
          }
        }

        if (candidateUrl) {
          // If it's an API URL, follow the redirect to get the actual CDN URL
          if (candidateUrl.includes('api.soundcloud.com')) {
            try {
              const cdnRes = await fetch(candidateUrl, {
                headers: { 'Authorization': `OAuth ${token}` },
                redirect: 'follow',
              });
              if (cdnRes.ok) {
                // Check if the response is a redirect URL or the actual stream content
                const contentType = cdnRes.headers.get('content-type') || '';
                if (contentType.includes('json')) {
                  const cdnData = await cdnRes.json();
                  streamUrl = cdnData.url || cdnRes.url;
                } else {
                  // The fetch followed the redirect — the final URL is the CDN URL
                  streamUrl = cdnRes.url;
                }
              }
            } catch (e) {
              console.error('SC CDN resolve error:', e);
            }
          } else {
            // It's already a CDN URL
            streamUrl = candidateUrl;
          }
        }
      }

      // Method 2: Resolve from transcodings (fallback)
      if (!streamUrl && track.media && track.media.transcodings && track.media.transcodings.length > 0) {
        // Only look for HLS (progressive was removed by SoundCloud in late 2025)
        const hls = track.media.transcodings.find(
          t => t.format && t.format.protocol === 'hls'
        );

        if (hls && hls.url) {
          // Use only OAuth header for transcoding URL resolution
          const transRes = await fetch(hls.url, {
            headers: {
              'Accept': 'application/json',
              'Authorization': `OAuth ${token}`,
            },
            redirect: 'follow',
          });
          if (transRes.ok) {
            const transData = await transRes.json();
            streamUrl = transData.url;
          }
        }
      }

      if (!streamUrl) {
        return res.status(404).json({ error: 'No playable stream found' });
      }

      return res.status(200).json({
        streamUrl,
        title: track.title || '',
        artistName: track.user?.username || '',
        artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
        duration: Math.round((track.duration || 0) / 1000),
      });
    } catch (err) {
      console.error('SoundCloud resolve error:', err);
      return res.status(500).json({ error: 'Failed to resolve stream' });
    }
  }

  // ── Mode 2: Search for tracks ──
  const query = body?.query;
  const limit = Math.min(parseInt(body?.limit) || 33, 200);
  const offset = parseInt(body?.offset) || 0;

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const token = await getAccessToken();
    const clientId = process.env.SOUNDCLOUD_CLIENT_ID;

    // Strategy: try v2 first, fall back to website scraping, then v1
    let collection = [];

    // ── Attempt 1: v2 search with web client_id (broadest results) ──
    try {
      const webClientId = await getWebClientId();
      if (webClientId) {
        const v2Params = new URLSearchParams({
          q: query,
          limit: limit.toString(),
          offset: offset.toString(),
          linked_partitioning: '1',
          client_id: webClientId,
        });
        const v2Res = await fetch(`https://api-v2.soundcloud.com/search/tracks?${v2Params.toString()}`, {
          headers: { 'Accept': 'application/json; charset=utf-8' },
        });
        if (v2Res.ok) {
          const v2Data = await v2Res.json();
          collection = Array.isArray(v2Data) ? v2Data : (v2Data.collection || []);
        } else {
          console.warn('SC v2 returned', v2Res.status, '- falling back');
        }
      }
    } catch (e) {
      console.warn('SC v2 error:', e.message);
    }

    // ── Attempt 2: v1 /tracks (title-only, last resort) ──
    if (collection.length === 0) {
      const v1Params = new URLSearchParams({
        q: query,
        limit: limit.toString(),
        offset: offset.toString(),
        linked_partitioning: '1',
      });
      const v1Res = await fetch(`https://api.soundcloud.com/tracks?${v1Params.toString()}`, {
        headers: {
          'Accept': 'application/json; charset=utf-8',
          'Authorization': `OAuth ${token}`,
        },
      });
      if (v1Res.ok) {
        const v1Data = await v1Res.json();
        collection = Array.isArray(v1Data) ? v1Data : (v1Data.collection || []);
      }
    }

    const results = collection.map(track => ({
      trackId: track.id,
      title: track.title || '',
      artistName: track.user?.username || '',
      artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
      duration: Math.round((track.duration || 0) / 1000),
      permalinkUrl: track.permalink_url || '',
      waveformUrl: track.waveform_url || '',
      playbackCount: track.playback_count || 0,
      genre: track.genre || '',
      year: (track.release_date || track.created_at || '').slice(0, 4) || null,
    }));

    // Also search playlists via v2
    let playlists = [];
    try {
      const webCid = await getWebClientId();
      if (webCid) {
        const plParams = new URLSearchParams({
          q: query, limit: '11', client_id: webCid,
        });
        const plRes = await fetch(`https://api-v2.soundcloud.com/search/playlists?${plParams.toString()}`, {
          headers: { 'Accept': 'application/json; charset=utf-8' },
        });
        if (plRes.ok) {
          const plData = await plRes.json();
          playlists = (plData.collection || []).map(pl => ({
            playlistId: pl.id,
            title: pl.title || '',
            artistName: pl.user?.username || '',
            artworkUrl: (pl.artwork_url || pl.user?.avatar_url || '').replace('-large', '-t500x500'),
            trackCount: pl.track_count || 0,
            permalinkUrl: pl.permalink_url || '',
            duration: Math.round((pl.duration || 0) / 1000),
            tracks: (pl.tracks || []).map(t => ({
              trackId: t.id,
              title: t.title || '',
              artistName: t.user?.username || '',
              artworkUrl: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500'),
              duration: Math.round((t.duration || 0) / 1000),
              permalinkUrl: t.permalink_url || '',
            })),
          }));
        }
      }
    } catch (e) {
      console.warn('SC playlist search error:', e.message);
    }

    const hasMore = collection.length >= limit;
    return res.status(200).json({ results, playlists, hasMore, nextOffset: offset + collection.length });
  } catch (err) {
    console.error('SoundCloud search error:', err);
    return res.status(200).json({ results: [], playlists: [] });
  }
}
