// POST /api/resolve-aliases
// Body: { query: string }
// Returns: { canonical: string, aliases: string[] }

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

let requestLog = [];
const RATE_LIMIT = 30; // strict rate limit due to multiple API hops
const RATE_WINDOW = 60000;

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

  let { query } = body || {};
  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  // 1. MusicBrainz fuzzy search to correct typos and find canonical artist
  let canonical = query;
  try {
    const fuzzyQ = query.split(' ').filter(w => w.trim()).map(w => w + '~').join(' ');
    const mbRes = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(fuzzyQ)}&fmt=json`, {
      headers: { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' }
    });
    
    if (mbRes.ok) {
      const mbData = await mbRes.json();
      if (mbData.artists && mbData.artists.length > 0) {
        // We only accept if the score is somewhat decent (> 50)
        if (mbData.artists[0].score > 50) {
          canonical = mbData.artists[0].name;
        }
      }
    }
  } catch (err) {
    console.warn('MusicBrainz resolve error:', err);
  }

  // 2. Discogs Search to get the artist ID
  let aliases = [];
  try {
    const discogsRes = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(canonical)}&type=artist`, {
      headers: { 
        'User-Agent': 'Kyoyu/1.0', 
        'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` 
      }
    });
    
    if (discogsRes.ok) {
      const discogsData = await discogsRes.json();
      if (discogsData.results && discogsData.results.length > 0) {
        const discogsId = discogsData.results[0].id;
        
        // 3. Fetch artist details for aliases
        const artistRes = await fetch(`https://api.discogs.com/artists/${discogsId}`, {
          headers: { 
            'User-Agent': 'Kyoyu/1.0', 
            'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` 
          }
        });
        if (artistRes.ok) {
          const artistData = await artistRes.json();
          if (artistData.aliases) {
            aliases = artistData.aliases.map(a => a.name.replace(/\s\(\d+\)$/, '')); // strip (2) from names
          }
          if (artistData.groups) {
            // Also include bands they are part of
            artistData.groups.forEach(g => {
              aliases.push(g.name.replace(/\s\(\d+\)$/, ''));
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Discogs resolve error:', err);
  }

  return res.status(200).json({
    original: query,
    canonical,
    aliases: Array.from(new Set(aliases)) // deduplicate
  });
}
