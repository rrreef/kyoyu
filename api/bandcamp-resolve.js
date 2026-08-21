// POST /api/bandcamp-resolve
// Body: { url: string } — Bandcamp track URL
// Returns: { streamUrl, title, artist, artworkUrl, duration, albumName }
//
// Fetches a Bandcamp track page and extracts the audio stream URL
// from the embedded TralbumData. The stream URL is temporary/tokenized
// and valid for immediate playback.

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Stream URL cache: trackUrl → { data, timestamp }
const resolveCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (stream tokens last ~1h)

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

  const url = body?.url;
  if (!url || !url.includes('bandcamp.com')) {
    return res.status(400).json({ error: 'Valid Bandcamp URL required' });
  }

  const now = Date.now();

  // Check cache
  if (resolveCache.has(url)) {
    const cached = resolveCache.get(url);
    if (now - cached.timestamp < CACHE_TTL) {
      return res.status(200).json(cached.data);
    }
    resolveCache.delete(url);
  }

  try {
    const bcRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!bcRes.ok) {
      return res.status(200).json({ error: 'Failed to fetch track page' });
    }

    const html = await bcRes.text();

    // Extract TralbumData JSON from the page
    // It appears as: data-tralbum="{ ... }" on a script tag
    // or as: var TralbumData = { ... };
    let tralbumData = null;

    // Method 1: data-tralbum attribute (most reliable)
    const dataAttrMatch = html.match(/data-tralbum="([^"]*)"/);
    if (dataAttrMatch) {
      try {
        const decoded = dataAttrMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'");
        tralbumData = JSON.parse(decoded);
      } catch (e) {}
    }

    // Method 2: TralbumData variable
    if (!tralbumData) {
      const varMatch = html.match(/var\s+TralbumData\s*=\s*(\{[\s\S]*?\});\s*\n/);
      if (varMatch) {
        try {
          tralbumData = JSON.parse(varMatch[1]);
        } catch (e) {}
      }
    }

    // Method 3: Look in script tags for trackinfo
    if (!tralbumData) {
      const scriptMatch = html.match(/"trackinfo"\s*:\s*(\[[\s\S]*?\])\s*,/);
      if (scriptMatch) {
        try {
          const trackinfo = JSON.parse(scriptMatch[1]);
          tralbumData = { trackinfo };
        } catch (e) {}
      }
    }

    if (!tralbumData || !tralbumData.trackinfo || !tralbumData.trackinfo.length) {
      return res.status(200).json({ error: 'Could not extract track data' });
    }

    const track = tralbumData.trackinfo[0];
    const file = track.file;
    // Try mp3-128 first, then any available format
    const streamUrl = file?.['mp3-128'] || (file ? Object.values(file)[0] : null);

    if (!streamUrl) {
      return res.status(200).json({ error: 'No stream URL available' });
    }

    // Extract artwork from page
    let artworkUrl = '';
    const artMatch = html.match(/<a class="popupImage"[^>]*href="([^"]+)"/);
    if (artMatch) {
      artworkUrl = artMatch[1];
    } else {
      const ogImgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
      if (ogImgMatch) artworkUrl = ogImgMatch[1];
    }

    // Extract artist
    let artist = tralbumData.artist || '';
    if (!artist) {
      const artistMatch = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/);
      if (artistMatch) artist = artistMatch[1];
    }

    const result = {
      streamUrl,
      title: track.title || '',
      artist,
      artworkUrl,
      duration: track.duration ? Math.round(track.duration) : 0,
      albumName: tralbumData.current?.title || '',
      trackUrl: url,
    };

    // Cache
    resolveCache.set(url, { data: result, timestamp: now });

    // Evict old entries
    if (resolveCache.size > 500) {
      const oldest = [...resolveCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 100);
      oldest.forEach(([key]) => resolveCache.delete(key));
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Bandcamp resolve error:', err);
    return res.status(200).json({ error: 'Failed to resolve track' });
  }
}
