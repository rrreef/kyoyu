// POST /api/soundcloud-resolve
// Body: { trackId: number } — SoundCloud track ID
// Returns: { streamUrl, title, artist, artworkUrl, duration }
//
// Resolves a SoundCloud track to a direct audio stream URL using the
// official SoundCloud API. Returns progressive MP3 or HLS stream URL
// for native AVPlayer playback (enables background audio on iOS).

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Stream URL cache: trackId → { data, timestamp }
const resolveCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes (SoundCloud stream tokens expire ~15-30min)

// Cached OAuth token (shared with soundcloud-search.js pattern)
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
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
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;

  return cachedToken;
}

export default async function handler(req, res) {
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

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const trackId = body?.trackId;
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }

  const now = Date.now();

  // Check cache
  const cacheKey = String(trackId);
  if (resolveCache.has(cacheKey)) {
    const cached = resolveCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL) {
      return res.status(200).json(cached.data);
    }
    resolveCache.delete(cacheKey);
  }

  if (!process.env.SOUNDCLOUD_CLIENT_ID || !process.env.SOUNDCLOUD_CLIENT_SECRET) {
    return res.status(200).json({ error: 'SoundCloud credentials not configured' });
  }

  try {
    const token = await getAccessToken();

    // Fetch track details including media transcodings
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

    // Extract stream URL from media transcodings
    // Prefer progressive (direct MP3 URL) over HLS
    let streamUrl = null;
    const transcodings = track.media?.transcodings || [];

    // Sort: prefer progressive format, then mp3
    const progressive = transcodings.find(t =>
      t.format?.protocol === 'progressive' && t.format?.mime_type?.includes('mpeg')
    );
    const hls = transcodings.find(t =>
      t.format?.protocol === 'hls' && t.format?.mime_type?.includes('mpeg')
    );
    const anyTranscoding = progressive || hls || transcodings[0];

    if (anyTranscoding?.url) {
      // The transcoding URL is a redirect endpoint — we need to resolve it
      const streamRes = await fetch(`${anyTranscoding.url}?client_id=${process.env.SOUNDCLOUD_CLIENT_ID}`, {
        headers: {
          'Authorization': `OAuth ${token}`,
        },
      });

      if (streamRes.ok) {
        const streamData = await streamRes.json();
        streamUrl = streamData.url;
      }
    }

    // Fallback: try the legacy stream_url field
    if (!streamUrl && track.stream_url) {
      streamUrl = `${track.stream_url}?client_id=${process.env.SOUNDCLOUD_CLIENT_ID}`;
    }

    if (!streamUrl) {
      return res.status(200).json({ error: 'No stream URL available for this track' });
    }

    const result = {
      streamUrl,
      title: track.title || '',
      artist: track.user?.username || '',
      artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
      duration: Math.round((track.duration || 0) / 1000), // ms → seconds
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
