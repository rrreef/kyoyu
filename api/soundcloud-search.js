// POST /api/soundcloud-search
// Body: { query: string, limit?: number }
// Returns: { results: [...] }
//
// Uses SoundCloud API v2 with client_id from environment.
// Falls back gracefully if no client_id is configured.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Simple in-memory rate limiter
let requestLog = [];
const RATE_LIMIT = 50;
const RATE_WINDOW = 60000;

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

  const query = body?.query;
  const limit = Math.min(parseInt(body?.limit) || 50, 50);

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) {
    console.warn('SOUNDCLOUD_CLIENT_ID not configured');
    return res.status(200).json({ results: [] });
  }

  try {
    const params = new URLSearchParams({
      q: query,
      client_id: clientId,
      limit: limit.toString(),
      offset: '0',
      linked_partitioning: '1',
    });

    const scRes = await fetch(`https://api-v2.soundcloud.com/search/tracks?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Kyoyu/1.0',
      },
    });

    if (!scRes.ok) {
      const errText = await scRes.text();
      console.error('SoundCloud API error:', scRes.status, errText);
      return res.status(200).json({ results: [] }); // Graceful fallback
    }

    const data = await scRes.json();
    const collection = data.collection || [];

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
    return res.status(200).json({ results: [] }); // Graceful fallback
  }
}
