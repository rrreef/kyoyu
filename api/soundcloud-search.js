// POST /api/soundcloud-search
// Handles two actions:
//   { action: 'search', query: string, limit?: number }  → search tracks
//   { action: 'resolve', trackId: number }                → resolve stream URL
// Default action is 'search' for backward compatibility.
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

// Stream URL cache: trackId → { data, timestamp }
const resolveCache = new Map();
const RESOLVE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (stream tokens expire ~15-30min)

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

/**
 * Resolve a SoundCloud track ID to a direct audio stream URL.
 */
async function handleResolve(body, res) {
  const trackId = body?.trackId;
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }

  const now = Date.now();
  const cacheKey = String(trackId);

  // Check cache
  if (resolveCache.has(cacheKey)) {
    const cached = resolveCache.get(cacheKey);
    if (now - cached.timestamp < RESOLVE_CACHE_TTL) {
      return res.status(200).json(cached.data);
    }
    resolveCache.delete(cacheKey);
  }

  try {
    const token = await getAccessToken();

    // Fetch track details
    const trackRes = await fetch(`https://api.soundcloud.com/tracks/${trackId}`, {
      headers: {
        'Accept': 'application/json; charset=utf-8',
        'Authorization': `OAuth ${token}`,
      },
    });

    if (!trackRes.ok) {
      if (trackRes.status === 401) {
        cachedToken = null;
        tokenExpiresAt = 0;
      }
      console.error('SoundCloud track fetch error:', trackRes.status);
      return res.status(200).json({ error: 'Failed to fetch track' });
    }

    const track = await trackRes.json();

    let streamUrl = null;

    // ── Method 1: media transcodings (modern API) ──
    const transcodings = track.media?.transcodings || [];
    if (transcodings.length > 0) {
      // Prefer progressive MP3, then HLS MP3, then any
      const progressive = transcodings.find(t =>
        t.format?.protocol === 'progressive' && t.format?.mime_type?.includes('mpeg')
      );
      const hlsMpeg = transcodings.find(t =>
        t.format?.protocol === 'hls' && t.format?.mime_type?.includes('mpeg')
      );
      const hlsAny = transcodings.find(t =>
        t.format?.protocol === 'hls'
      );
      const chosen = progressive || hlsMpeg || hlsAny || transcodings[0];

      if (chosen?.url) {
        try {
          // Transcoding URLs need OAuth token to resolve
          const sep = chosen.url.includes('?') ? '&' : '?';
          const streamRes = await fetch(`${chosen.url}${sep}client_id=${process.env.SOUNDCLOUD_CLIENT_ID}`, {
            headers: { 'Authorization': `OAuth ${token}` },
            redirect: 'follow',
          });
          if (streamRes.ok) {
            const streamData = await streamRes.json();
            if (streamData.url) streamUrl = streamData.url;
          }
        } catch (e) {
          console.warn('SoundCloud transcoding resolve failed:', e.message);
        }
      }
    }

    // ── Method 2: legacy stream_url redirect ──
    if (!streamUrl && track.stream_url) {
      try {
        const legacyRes = await fetch(track.stream_url, {
          headers: { 'Authorization': `OAuth ${token}` },
          redirect: 'manual', // Don't follow — we want the redirect URL
        });
        const location = legacyRes.headers.get('location');
        if (location) {
          streamUrl = location;
        }
      } catch (e) {
        console.warn('SoundCloud legacy stream resolve failed:', e.message);
      }
    }

    // ── Method 3: construct stream URL from track ID ──
    if (!streamUrl) {
      try {
        const directRes = await fetch(
          `https://api.soundcloud.com/tracks/${trackId}/stream`,
          {
            headers: { 'Authorization': `OAuth ${token}` },
            redirect: 'manual',
          }
        );
        const location = directRes.headers.get('location');
        if (location) {
          streamUrl = location;
        }
      } catch (e) {
        console.warn('SoundCloud direct stream resolve failed:', e.message);
      }
    }

    if (!streamUrl) {
      console.error('SoundCloud: all stream resolution methods failed for track', trackId);
      return res.status(200).json({ error: 'No stream URL available for this track' });
    }

    const result = {
      streamUrl,
      title: track.title || '',
      artist: track.user?.username || '',
      artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
      duration: Math.round((track.duration || 0) / 1000),
      genre: track.genre || '',
      trackId: track.id,
    };

    // Cache
    resolveCache.set(cacheKey, { data: result, timestamp: now });

    // Evict old entries
    if (resolveCache.size > 500) {
      const oldest = [...resolveCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 100);
      oldest.forEach(([key]) => resolveCache.delete(key));
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('SoundCloud resolve error:', err);
    return res.status(200).json({ error: 'Failed to resolve track' });
  }
}

/**
 * Search SoundCloud tracks.
 */
async function handleSearch(body, res) {
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

  // Route by action: 'resolve' for stream URL, default is 'search'
  const action = body?.action || 'search';

  if (action === 'resolve') {
    return handleResolve(body, res);
  }
  return handleSearch(body, res);
}
