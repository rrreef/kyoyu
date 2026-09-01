// POST /api/soundcloud-stream
// Body: { trackId: number }
// Returns: { streamUrl: string } — a direct HLS or progressive MP3 URL
//
// Resolves a SoundCloud track ID to a playable stream URL using the
// official API. The returned URL can be played directly by AVPlayer
// or an HTML5 <audio> element — no iframe widget needed.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Reuse the same cached OAuth token as soundcloud-search
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

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const trackId = body?.trackId;
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }

  if (!process.env.SOUNDCLOUD_CLIENT_ID || !process.env.SOUNDCLOUD_CLIENT_SECRET) {
    return res.status(500).json({ error: 'SoundCloud credentials not configured' });
  }

  try {
    const token = await getAccessToken();

    // First try the v2 /tracks/{id} endpoint to get transcodings
    const trackRes = await fetch(`https://api.soundcloud.com/tracks/${trackId}?representation=full`, {
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

    // Look for a progressive (direct MP3) stream in media.transcodings
    // This is the v2 API format
    let streamUrl = null;

    if (track.media && track.media.transcodings) {
      // Prefer progressive (direct URL) over HLS
      const progressive = track.media.transcodings.find(
        t => t.format && t.format.protocol === 'progressive'
      );
      const hls = track.media.transcodings.find(
        t => t.format && t.format.protocol === 'hls'
      );

      const chosen = progressive || hls;
      if (chosen && chosen.url) {
        // The transcoding URL needs to be fetched with the token to get the actual stream URL
        const streamRes = await fetch(`${chosen.url}?client_id=${process.env.SOUNDCLOUD_CLIENT_ID}`, {
          headers: {
            'Authorization': `OAuth ${token}`,
          },
        });
        if (streamRes.ok) {
          const streamData = await streamRes.json();
          streamUrl = streamData.url; // This is the actual playable URL
        }
      }
    }

    // Fallback: try the legacy stream_url field
    if (!streamUrl && track.stream_url) {
      streamUrl = `${track.stream_url}?client_id=${process.env.SOUNDCLOUD_CLIENT_ID}`;
    }

    if (!streamUrl) {
      return res.status(404).json({ error: 'No playable stream found for this track' });
    }

    return res.status(200).json({
      streamUrl,
      title: track.title || '',
      artistName: track.user?.username || '',
      artworkUrl: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
      duration: Math.round((track.duration || 0) / 1000),
    });
  } catch (err) {
    console.error('SoundCloud stream resolve error:', err);
    return res.status(500).json({ error: 'Failed to resolve stream' });
  }
}
