// POST /api/bandcamp-search
// Body: { query: string }
// Returns: { results: [...] }
//
// Uses Bandcamp's public search API (bcsearch_public_api).
// No API key required.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Abuse guard only (was 40/min, which normal typing + album sheets exceeded → Bandcamp results missing)
let requestLog = [];
const RATE_LIMIT = 600;
const RATE_WINDOW = 60000;

// Result cache: query → { results, timestamp }
const searchCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes


async function fallbackFuzzySearch(query) {
  try {
    const res = await fetch(`https://bandcamp.com/api/fuzzysearch/1/autocomplete?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.auto?.results || [];
  } catch (e) { return []; }
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

  // ── Action: fetch album tracks ──
  if (body?.action === 'fetch-album' && body?.albumUrl) {
    try {
      const albumRes = await fetch(body.albumUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
      });
      if (!albumRes.ok) return res.status(200).json({ tracks: [] });
      const html = await albumRes.text();
      
      // Extract track data from the page's LD+JSON or data-tralbum attribute
      const tracks = [];
      
      // Try data-tralbum JSON (most reliable)
      const tralbumMatch = html.match(/data-tralbum="([^"]+)"/);
      if (tralbumMatch) {
        try {
          const tralbum = JSON.parse(tralbumMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
          const albumArt = (html.match(/<a class="popupImage"[^>]*href="([^"]+)"/) || [])[1] || '';
          for (const t of (tralbum.trackinfo || [])) {
            tracks.push({
              trackId: t.track_id || t.id,
              title: t.title || '',
              duration: Math.round((t.duration || 0)),
              streamUrl: t.file?.['mp3-128'] || '',
              // Track page URL (stable) — stream URLs expire, so clients need this to re-resolve later
              trackUrl: (() => { try { return t.title_link ? new URL(t.title_link, body.albumUrl).href : ''; } catch (e) { return ''; } })(),
              artworkUrl: albumArt,
              artistName: tralbum.artist || '',
            });
          }
        } catch (e) { /* parse error, fall through */ }
      }
      
      // Fallback: try LD+JSON
      if (tracks.length === 0) {
        const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (ldMatch) {
          try {
            const ld = JSON.parse(ldMatch[1]);
            const albumArt = ld.image || '';
            for (const t of (ld.track?.itemListElement || [])) {
              const item = t.item || t;
              tracks.push({
                trackId: item['@id'] || t.position,
                trackUrl: /^https?:\/\//.test(item['@id'] || '') ? item['@id'] : '',
                title: item.name || '',
                duration: 0,
                artworkUrl: albumArt,
                artistName: ld.byArtist?.name || '',
              });
            }
          } catch (e) { /* parse error */ }
        }
      }
      
      return res.status(200).json({ tracks });
    } catch (err) {
      console.error('Bandcamp album fetch error:', err);
      return res.status(200).json({ tracks: [] });
    }
  }

  const query = body?.query;
  const offset = parseInt(body?.offset) || 0;
  const page = Math.floor(offset / 33) + 1;

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const cacheKey = `${query.trim().toLowerCase()}_${page}`;

  // Check cache
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({ results: cached.results, hasMore: cached.hasMore, nextOffset: cached.nextOffset });
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
        search_filter: 'b,a,t,f', // bands/labels, albums, tracks, fans
        full_page: true,
        fan_id: 0
      }),
    });

    let items = [];
    if (!bcRes.ok) {
      console.error('Bandcamp search API error:', bcRes.status);
      items = await fallbackFuzzySearch(query);
    } else {
      const data = await bcRes.json();
      items = data?.auto?.results || [];
      if (items.length === 0) {
        items = await fallbackFuzzySearch(query);
      }
    }

    const results = items
      .map(item => {
        let artworkUrl = item.img || '';
        if (item.art_id) {
          artworkUrl = `https://f4.bcbits.com/img/a${item.art_id}_10.jpg`;
        } else if (item.img_id) {
          artworkUrl = `https://f4.bcbits.com/img/00${item.img_id}_23.jpg`;
        }
        
        const type = item.type === 'b' ? (item.is_label ? 'label' : 'artist') : item.type === 'a' ? 'album' : item.type === 'f' ? 'fan' : 'track';

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

    const hasMore = results.length >= 10;
    const nextOffset = offset + results.length;

    // Cache results (never cache an empty answer — it's usually a temporary Bandcamp hiccup)
    if (results.length > 0) searchCache.set(cacheKey, { results, hasMore, nextOffset, timestamp: now });

    // Evict old cache entries
    if (searchCache.size > 200) {
      const oldest = [...searchCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 50);
      oldest.forEach(([key]) => searchCache.delete(key));
    }

    return res.status(200).json({ results, hasMore, nextOffset });
  } catch (err) {
    console.error('Bandcamp search error:', err);
    return res.status(200).json({ results: [] });
  }
}
