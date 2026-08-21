// POST /api/bandcamp-search
// Body: { query: string, limit?: number }
// Returns: { results: [...] }
//
// Scrapes Bandcamp's public search page and extracts track results.
// No API key required — uses publicly accessible search.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

let requestLog = [];
const RATE_LIMIT = 40;
const RATE_WINDOW = 60000;

// Simple result cache: query → { results, timestamp }
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
    // Fetch Bandcamp search page for tracks
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=t`;

    const bcRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!bcRes.ok) {
      console.error('Bandcamp search error:', bcRes.status);
      return res.status(200).json({ results: [] });
    }

    const html = await bcRes.text();
    const results = parseSearchResults(html);

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

/**
 * Parse Bandcamp search results HTML and extract track data.
 */
function parseSearchResults(html) {
  const results = [];

  // Split by search result items
  // Bandcamp wraps each result in <li class="searchresult ...">
  const resultBlocks = html.split(/class="searchresult\s/);

  for (let i = 1; i < resultBlocks.length && results.length < 50; i++) {
    const block = resultBlocks[i];

    try {
      // Extract track URL
      const urlMatch = block.match(/class="heading">\s*<a\s+href="([^"]+)"/);
      const trackUrl = urlMatch ? urlMatch[1].trim() : null;
      if (!trackUrl || !trackUrl.includes('bandcamp.com')) continue;

      // Extract title
      const titleMatch = block.match(/class="heading">\s*<a[^>]*>\s*([^<]+)/);
      const title = titleMatch ? titleMatch[1].trim() : '';
      if (!title) continue;

      // Extract artist — "by Artist Name" or "from Album by Artist"
      let artist = '';
      const subheadMatch = block.match(/class="subhead">\s*([\s\S]*?)<\/div>/);
      if (subheadMatch) {
        const subhead = subheadMatch[1];
        // Try "by Artist Name"
        const byMatch = subhead.match(/by\s+([^<\n]+)/);
        if (byMatch) artist = byMatch[1].trim();
      }

      // Extract artwork
      let artworkUrl = '';
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch) {
        artworkUrl = imgMatch[1];
        // Get higher res: replace _2. or _3. with _10. for 350x350
        artworkUrl = artworkUrl.replace(/_\d+\./, '_10.');
      }

      // Extract album name
      let albumName = '';
      const albumMatch = block.match(/from\s+<a[^>]*>([^<]+)<\/a>/);
      if (albumMatch) albumName = albumMatch[1].trim();

      // Extract genre
      let genre = '';
      const genreMatch = block.match(/class="genre">\s*genre:\s*([^<]+)/i);
      if (genreMatch) genre = genreMatch[1].trim();

      // Extract release date
      let released = '';
      const releasedMatch = block.match(/class="released">\s*released\s+([^<]+)/i);
      if (releasedMatch) released = releasedMatch[1].trim();

      results.push({
        title,
        artistName: artist,
        artworkUrl,
        trackUrl,
        albumName,
        genre,
        released,
      });
    } catch (e) {
      // Skip malformed results
      continue;
    }
  }

  return results;
}
