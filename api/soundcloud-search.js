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
 * Resolve a SoundCloud track to a direct audio stream URL.
 * Uses page scraping (like Bandcamp) because the client_credentials API
 * only returns 30-second preview clips.
 */
async function handleResolve(body, res) {
  const trackId = body?.trackId;
  const permalinkUrl = body?.permalinkUrl;

  if (!trackId && !permalinkUrl) {
    return res.status(400).json({ error: 'trackId or permalinkUrl is required' });
  }

  const now = Date.now();
  const cacheKey = String(trackId || permalinkUrl);

  // Check cache
  if (resolveCache.has(cacheKey)) {
    const cached = resolveCache.get(cacheKey);
    if (now - cached.timestamp < RESOLVE_CACHE_TTL) {
      return res.status(200).json(cached.data);
    }
    resolveCache.delete(cacheKey);
  }

  try {
    // ── Step 1: Determine the track page URL ──
    let pageUrl = permalinkUrl;
    if (!pageUrl && trackId) {
      // Use the API to get the permalink URL from trackId
      const token = await getAccessToken();
      const trackRes = await fetch(`https://api.soundcloud.com/tracks/${trackId}`, {
        headers: {
          'Accept': 'application/json; charset=utf-8',
          'Authorization': `OAuth ${token}`,
        },
      });
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        pageUrl = trackData.permalink_url;
      }
    }

    if (!pageUrl) {
      return res.status(200).json({ error: 'Could not determine track page URL' });
    }

    // ── Step 2: Fetch the SoundCloud track page ──
    const pageRes = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!pageRes.ok) {
      console.error('SoundCloud page fetch error:', pageRes.status);
      return res.status(200).json({ error: 'Failed to fetch track page' });
    }

    const html = await pageRes.text();

    // ── Step 3: Extract __sc_hydration data ──
    let trackData = null;
    const hydrationMatch = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
    if (hydrationMatch) {
      try {
        const hydration = JSON.parse(hydrationMatch[1]);
        // Find the "sound" entry which contains track data
        const soundEntry = hydration.find(h => h.hydratable === 'sound');
        if (soundEntry?.data) {
          trackData = soundEntry.data;
        }
      } catch (e) {
        console.warn('Failed to parse __sc_hydration:', e.message);
      }
    }

    if (!trackData) {
      // Try alternate format: look for JSON-LD or og:tags for metadata
      console.warn('No __sc_hydration data found, trying API fallback');
      return await handleResolveViaAPI(trackId, cacheKey, now, res);
    }

    // ── Step 4: Extract client_id from page scripts ──
    let clientId = null;
    // SoundCloud embeds client_id in their JS bundle URLs or inline scripts
    const clientIdMatch = html.match(/client_id[=:]\s*["']([a-zA-Z0-9]{32})["']/);
    if (clientIdMatch) {
      clientId = clientIdMatch[1];
    }

    // Also try extracting from crossorigin script URLs
    if (!clientId) {
      const scriptUrls = html.match(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g);
      if (scriptUrls && scriptUrls.length > 0) {
        // Fetch the last script (usually contains the client_id)
        const lastUrl = scriptUrls[scriptUrls.length - 1].replace(/^src="/, '').replace(/"$/, '');
        try {
          const jsRes = await fetch(lastUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (jsRes.ok) {
            const jsText = await jsRes.text();
            const idMatch = jsText.match(/client_id:"([a-zA-Z0-9]{32})"/);
            if (idMatch) clientId = idMatch[1];
          }
        } catch (e) {
          console.warn('Failed to extract client_id from JS bundle');
        }
      }
    }

    // Fall back to our own OAuth client_id
    if (!clientId) {
      clientId = process.env.SOUNDCLOUD_CLIENT_ID;
    }

    // ── Step 5: Resolve stream URL from transcodings ──
    let streamUrl = null;
    const transcodings = trackData.media?.transcodings || [];

    if (transcodings.length > 0) {
      // Prefer non-snipped progressive MP3, then HLS
      const notSnipped = transcodings.filter(t => !t.snipped);
      const pool = notSnipped.length > 0 ? notSnipped : transcodings;

      const progressive = pool.find(t =>
        t.format?.protocol === 'progressive' && t.format?.mime_type?.includes('mpeg')
      );
      const hlsMpeg = pool.find(t =>
        t.format?.protocol === 'hls' && t.format?.mime_type?.includes('mpeg')
      );
      const chosen = progressive || hlsMpeg || pool[0];

      if (chosen?.url) {
        try {
          const sep = chosen.url.includes('?') ? '&' : '?';
          const streamRes = await fetch(`${chosen.url}${sep}client_id=${clientId}`, {
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

    if (!streamUrl) {
      // Fall back to API-based resolution
      return await handleResolveViaAPI(trackId, cacheKey, now, res);
    }

    const result = {
      streamUrl,
      title: trackData.title || '',
      artist: trackData.user?.username || '',
      artworkUrl: (trackData.artwork_url || trackData.user?.avatar_url || '').replace('-large', '-t500x500'),
      duration: Math.round((trackData.full_duration || trackData.duration || 0) / 1000),
      genre: trackData.genre || '',
      trackId: trackData.id || trackId,
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
 * Fallback: resolve via API (may return 30-second previews).
 */
async function handleResolveViaAPI(trackId, cacheKey, now, res) {
  if (!trackId) {
    return res.status(200).json({ error: 'No stream URL available' });
  }
  try {
    const token = await getAccessToken();
    const directRes = await fetch(
      `https://api.soundcloud.com/tracks/${trackId}/stream`,
      {
        headers: { 'Authorization': `OAuth ${token}` },
        redirect: 'manual',
      }
    );
    const location = directRes.headers.get('location');
    if (location) {
      const result = { streamUrl: location, trackId };
      resolveCache.set(cacheKey, { data: result, timestamp: now });
      return res.status(200).json(result);
    }
  } catch (e) {
    console.warn('SoundCloud API stream resolve failed:', e.message);
  }
  return res.status(200).json({ error: 'No stream URL available' });
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
