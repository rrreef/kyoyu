// POST /api/discogs-search
// Handles standard search and resolve-aliases action

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

let requestLog = [];
const RATE_LIMIT = 55;
const RATE_WINDOW = 60000;

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  const { query, type, page, perPage, action } = body || {};

  // ==== ACTION: resolve-aliases ====
  if (action === 'resolve-aliases') {
    if (!query || query.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    let canonical = query;
    try {
      const fuzzyQ = query.split(' ').filter(w => w.trim()).map(w => w + '~').join(' ');
      const mbRes = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(fuzzyQ)}&fmt=json`, { headers: { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' } });
      if (mbRes.ok) {
        const mbData = await mbRes.json();
        if (mbData.artists && mbData.artists.length > 0 && mbData.artists[0].score > 50) canonical = mbData.artists[0].name;
      }
    } catch (err) {}

    let aliases = [];
    try {
      const discogsRes = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(canonical)}&type=artist`, { headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` } });
      if (discogsRes.ok) {
        const discogsData = await discogsRes.json();
        if (discogsData.results && discogsData.results.length > 0) {
          const discogsId = discogsData.results[0].id;
          const artistRes = await fetch(`https://api.discogs.com/artists/${discogsId}`, { headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` } });
          if (artistRes.ok) {
            const artistData = await artistRes.json();
            if (artistData.aliases) aliases = artistData.aliases.map(a => a.name.replace(/\s\(\d+\)$/, ''));
            if (artistData.groups) artistData.groups.forEach(g => aliases.push(g.name.replace(/\s\(\d+\)$/, '')));
          }
        }
      }
    } catch (err) {}
    return res.status(200).json({ original: query, canonical, aliases: Array.from(new Set(aliases)) });
  }

  // ==== DEFAULT ACTION: search ====
  if (!query) return res.status(400).json({ error: 'Missing query' });
  const p = page || 1;
  const pp = perPage || 10;
  let url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&page=${p}&per_page=${pp}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;

  try {
    const discogsRes = await fetch(url, { headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN || ''}` } });
    if (!discogsRes.ok) return res.status(discogsRes.status).json({ error: 'Discogs API error' });
    const data = await discogsRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
