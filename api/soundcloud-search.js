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
      const clientId = process.env.SOUNDCLOUD_CLIENT_ID;

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
      console.log('SC track media:', JSON.stringify(track.media?.transcodings?.map(t => ({ url: t.url, format: t.format })) || 'none'));
      console.log('SC track stream_url:', track.stream_url || 'none');

      // Look for a progressive (direct MP3) or HLS stream in transcodings
      let streamUrl = null;

      if (track.media && track.media.transcodings && track.media.transcodings.length > 0) {
        const progressive = track.media.transcodings.find(
          t => t.format && t.format.protocol === 'progressive'
        );
        const hls = track.media.transcodings.find(
          t => t.format && t.format.protocol === 'hls'
        );

        const chosen = progressive || hls;
        if (chosen && chosen.url) {
          // The transcoding URL returns a JSON with the actual stream URL
          // Use OAuth token only (not client_id + OAuth together)
          const streamRes = await fetch(`${chosen.url}?client_id=${clientId}`, {
            headers: { 'Accept': 'application/json' },
          });
          console.log('SC transcoding fetch status:', streamRes.status);
          if (streamRes.ok) {
            const streamData = await streamRes.json();
            console.log('SC transcoding response:', JSON.stringify(streamData).substring(0, 200));
            streamUrl = streamData.url;
          } else {
            // Try with OAuth header instead
            const streamRes2 = await fetch(`${chosen.url}`, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `OAuth ${token}`,
              },
            });
            console.log('SC transcoding fetch (OAuth) status:', streamRes2.status);
            if (streamRes2.ok) {
              const streamData2 = await streamRes2.json();
              streamUrl = streamData2.url;
            }
          }
        }
      }

      // Fallback: legacy stream_url — follow redirect server-side to get actual CDN URL
      if (!streamUrl && track.stream_url) {
        const legacyRes = await fetch(`${track.stream_url}?client_id=${clientId}&oauth_token=${token}`, {
          redirect: 'follow',
        });
        if (legacyRes.ok || legacyRes.status === 302 || legacyRes.status === 301) {
          // The redirected URL is the actual CDN stream
          streamUrl = legacyRes.url;
        }
        console.log('SC legacy stream status:', legacyRes.status, 'url:', legacyRes.url?.substring(0, 100));
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
  const limit = Math.min(parseInt(body?.limit) || 50, 50);

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const token = await getAccessToken();

    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      offset: '0',
      linked_partitioning: '1',
    });

    const scRes = await fetch(`https://api.soundcloud.com/tracks?${params.toString()}`, {
      headers: {
        'Accept': 'application/json; charset=utf-8',
        'Authorization': `OAuth ${token}`,
      },
    });

    if (!scRes.ok) {
      const errText = await scRes.text();
      console.error('SoundCloud API error:', scRes.status, errText);
      if (scRes.status === 401) {
        cachedToken = null;
        tokenExpiresAt = 0;
      }
      return res.status(200).json({ results: [] });
    }

    const data = await scRes.json();
    // v1 API returns array directly for /tracks, or collection for search
    const collection = Array.isArray(data) ? data : (data.collection || []);

    const results = collection.map(track => ({
      trackId: track.id,
      title: track.title || '',
      artistName: track.user?.username || '',
      artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
      duration: Math.round((track.duration || 0) / 1000), // ms → seconds
      permalinkUrl: track.permalink_url || '',
      waveformUrl: track.waveform_url || '',
      playbackCount: track.playback_count || 0,
      genre: track.genre || '',
    }));

    return res.status(200).json({ results });
  } catch (err) {
    console.error('SoundCloud search error:', err);
    return res.status(200).json({ results: [] });
  }
}
