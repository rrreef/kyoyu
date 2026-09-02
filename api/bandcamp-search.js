// POST /api/bandcamp-search
// Body: { query: string }
// Returns: { results: [...] }
//
// Uses Bandcamp's public search API (bcsearch_public_api).
// No API key required.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

let requestLog = [];
const RATE_LIMIT = 40;
const RATE_WINDOW = 60000;

// Result cache: query → { results, timestamp }
const searchCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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

  const query = body?.query;
  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const cacheKey = query.trim().toLowerCase();

  // Check cache
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({ results: cached.results });
    }
    searchCache.delete(cacheKey);
  }

  try {
    // Use Bandcamp's public search API
    const bcRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        search_text: query,
        search_filter: 'b,a,t', // bands/labels, albums, tracks
        full_page: true,
        fan_id: 0,
      }),
    });

    if (!bcRes.ok) {
      console.error('Bandcamp search API error:', bcRes.status);
      return res.status(200).json({ results: [] });
    }

    const data = await bcRes.json();
    const items = data?.auto?.results || [];

    const results = items
      .map(item => {
        let artworkUrl = item.img || '';
        if (item.art_id) {
          artworkUrl = `https://f4.bcbits.com/img/a${item.art_id}_10.jpg`;
        } else if (item.img_id) {
          artworkUrl = `https://f4.bcbits.com/img/00${item.img_id}_23.jpg`;
        }
        
        const type = item.type === 'b' ? (item.is_label ? 'label' : 'artist') : item.type === 'a' ? 'album' : 'track';

        return {
          trackId: item.id,
          type,
          title: item.name || '',
          artistName: item.band_name || (type === 'artist' || type === 'label' ? item.name : ''),
          artworkUrl,
          trackUrl: item.item_url_path || item.item_url_root || '',
          albumName: item.album_name || (type === 'album' ? item.name : ''),
          albumId: item.album_id || null,
        };
      });

    // Cache results
    searchCache.set(cacheKey, { results, timestamp: now });

    // Evict old cache entries
    if (searchCache.size > 200) {
      const oldest = [...searchCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 50);
      oldest.forEach(([key]) => searchCache.delete(key));
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error('Bandcamp search error:', err);
    return res.status(200).json({ results: [] });
  }
}
