// POST /api/discogs-search
// Body: { query: string, type?: string, page?: number, perPage?: number }
// Returns: { results: [...], pagination: {...} }

const DISCOGS_BASE = 'https://api.discogs.com';
const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Simple in-memory rate limiter
let requestLog = [];
const RATE_LIMIT = 55;
const RATE_WINDOW = 60000;

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query, type, page, perPage } = req.body || {};
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    // Rate limit check
    const now = Date.now();
    requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
    if (requestLog.length >= RATE_LIMIT) {
      return res.status(429).json({ error: 'Rate limit reached. Try again shortly.' });
    }
    requestLog.push(now);

    // Build Discogs search URL
    const url = new URL(`${DISCOGS_BASE}/database/search`);
    url.searchParams.set('q', query);
    if (type) url.searchParams.set('type', type);
    url.searchParams.set('page', String(page || 1));
    url.searchParams.set('per_page', String(perPage || 50));

    const headers = {
      'User-Agent': process.env.DISCOGS_USER_AGENT || 'Kyoyu/1.0 +https://ree.fm',
      'Accept': 'application/json',
    };
    if (process.env.DISCOGS_TOKEN) {
      headers['Authorization'] = `Discogs token=${process.env.DISCOGS_TOKEN}`;
    }

    const discogsRes = await fetch(url.toString(), { headers });
    if (!discogsRes.ok) {
      const errText = await discogsRes.text();
      console.error('Discogs API error:', discogsRes.status, errText);
      return res.status(502).json({ error: 'Discogs API error' });
    }

    const data = await discogsRes.json();

    // Transform results — strip images (not CC0)
    const results = (data.results || []).map(r => ({
      discogsId: r.id,
      type: r.type,
      title: r.title,
      thumb: r.thumb || null,
      coverImage: r.cover_image || null,
      year: r.year || null,
      genre: r.genre || [],
      style: r.style || [],
      format: r.format || [],
      label: r.label || [],
      country: r.country || null,
      catno: r.catno || null,
      resourceUrl: r.resource_url,
      uri: r.uri,
    }));

    return res.status(200).json({
      results,
      pagination: data.pagination || {},
    });
  } catch (err) {
    console.error('Discogs search error:', err);
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
}
