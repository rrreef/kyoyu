// POST /api/bandcamp-resolve
// Handles standard resolve, label-releases, and recommendations based on action param

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

const resolveCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

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
  const action = body?.action || 'resolve';
  
  if (!url || !url.includes('bandcamp.com')) {
    return res.status(400).json({ error: 'Valid Bandcamp URL required' });
  }

  // ==== ACTION: label-releases ====
  if (action === 'label-releases') {
    try {
      let fetchUrl = url;
      if (!fetchUrl.endsWith('/music') && !fetchUrl.includes('/album/')) {
        fetchUrl = fetchUrl.replace(/\/$/, '') + '/music';
      }
      const htmlRes = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!htmlRes.ok) return res.status(200).json({ releases: [] });
      const html = await htmlRes.text();
      const releases = [];
      const unescapeHtml = (str) => str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const olMatch = html.match(/<ol[^>]*id="music-grid"[^>]*>([\s\S]*?)<\/ol>/i) || html.match(/<ul[^>]*class="[^"]*music-grid[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
      if (olMatch) {
        const listHtml = olMatch[1];
        const itemRegex = /<a href="([^"]+)">[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<p class="title">\s*(.*?)\s*<br>\s*<span class="artist-override">\s*(.*?)\s*<\/span>|<a href="([^"]+)">[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<p class="title">\s*(.*?)\s*<\/p>/gi;
        let match;
        while ((match = itemRegex.exec(listHtml)) !== null) {
          if (match[1]) releases.push({ url: new URL(unescapeHtml(match[1]), url).toString(), artworkUrl: match[2], title: unescapeHtml(match[3].trim()), artist: unescapeHtml(match[4].trim()) });
          else if (match[5]) releases.push({ url: new URL(unescapeHtml(match[5]), url).toString(), artworkUrl: match[6], title: unescapeHtml(match[7].trim()), artist: '' });
        }
      }
      return res.status(200).json({ releases: releases.slice(0, 10) });
    } catch (err) { return res.status(500).json({ error: 'Failed to fetch label' }); }
  }

  // ==== ACTION: recommendations ====
  if (action === 'recommendations') {
    try {
      const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!htmlRes.ok) return res.status(200).json({ recommendations: [] });
      const html = await htmlRes.text();
      const fans = [];
      const fanMatch = html.match(/"author":\{"@type":"Person","url":"([^"]+)"/g);
      if (fanMatch) fanMatch.forEach(m => { const fanUrl = m.match(/"url":"([^"]+)"/)[1]; if (fanUrl.includes('bandcamp.com')) fans.push(fanUrl); });
      if (fans.length === 0) {
        const altMatch = html.match(/<a[^>]*class="[^"]*fan[^"]*"[^>]*href="([^"]+)"/g);
        if (altMatch) altMatch.forEach(m => { let href = m.match(/href="([^"]+)"/)[1]; if (href.startsWith('/')) href = 'https://bandcamp.com' + href; if (href.includes('bandcamp.com')) fans.push(href); });
      }
      const uniqueFans = [...new Set(fans)].slice(0, 10);
      const recommendations = {};
      await Promise.all(uniqueFans.map(async (fanUrl) => {
        try {
          const fanRes = await fetch(fanUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!fanRes.ok) return;
          const fanHtml = await fanRes.text();
          const pagedataMatch = fanHtml.match(/data-blob="([^"]+)"/);
          if (pagedataMatch) {
            const data = JSON.parse(pagedataMatch[1].replace(/&quot;/g, '"'));
            const items = data.item_cache?.collection ? Object.values(data.item_cache.collection) : [];
            for (const item of items) {
              if (!item.item_url || item.item_url === url) continue;
              if (!recommendations[item.item_url]) recommendations[item.item_url] = { count: 0, title: item.item_title, artistName: item.band_name, artworkUrl: item.item_art_id ? `https://f4.bcbits.com/img/a${item.item_art_id}_10.jpg` : '', trackUrl: item.item_url };
              recommendations[item.item_url].count++;
            }
          }
        } catch (e) {}
      }));
      const sorted = Object.values(recommendations).sort((a, b) => b.count - a.count).slice(0, 40);
      return res.status(200).json({ recommendations: sorted });
    } catch (err) { return res.status(500).json({ error: 'Failed to fetch recommendations' }); }
  }

  // ==== DEFAULT ACTION: resolve track ====
  const now = Date.now();
  if (resolveCache.has(url)) {
    const cached = resolveCache.get(url);
    if (now - cached.timestamp < CACHE_TTL) return res.status(200).json(cached.data);
    resolveCache.delete(url);
  }

  try {
    const bcRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', }, });
    if (!bcRes.ok) return res.status(200).json({ error: 'Failed to fetch track page' });
    const html = await bcRes.text();
    let tralbumData = null;
    const dataAttrMatch = html.match(/data-tralbum="([^"]*)"/);
    if (dataAttrMatch) { try { const decoded = dataAttrMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"); tralbumData = JSON.parse(decoded); } catch (e) {} }
    if (!tralbumData) { const varMatch = html.match(/var\s+TralbumData\s*=\s*(\{[\s\S]*?\});\s*\n/); if (varMatch) { try { tralbumData = JSON.parse(varMatch[1]); } catch (e) {} } }
    if (!tralbumData) { const scriptMatch = html.match(/"trackinfo"\s*:\s*(\[[\s\S]*?\])\s*,/); if (scriptMatch) { try { const trackinfo = JSON.parse(scriptMatch[1]); tralbumData = { trackinfo }; } catch (e) {} } }
    if (!tralbumData || !tralbumData.trackinfo || !tralbumData.trackinfo.length) return res.status(200).json({ error: 'Could not extract track data' });

    const track = tralbumData.trackinfo[0];
    const file = track.file;
    const streamUrl = file?.['mp3-128'] || (file ? Object.values(file)[0] : null);
    if (!streamUrl) return res.status(200).json({ error: 'No stream URL available' });

    let artworkUrl = '';
    const artMatch = html.match(/<a class="popupImage"[^>]*href="([^"]+)"/);
    if (artMatch) artworkUrl = artMatch[1]; else { const ogImgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/); if (ogImgMatch) artworkUrl = ogImgMatch[1]; }

    let artist = tralbumData.artist || '';
    if (!artist) { const artistMatch = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/); if (artistMatch) artist = artistMatch[1]; }

    const result = { streamUrl, title: track.title || '', artist, artworkUrl, duration: track.duration ? Math.round(track.duration) : 0, albumName: tralbumData.current?.title || '', trackUrl: url };
    resolveCache.set(url, { data: result, timestamp: now });
    if (resolveCache.size > 500) { const oldest = [...resolveCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 100); oldest.forEach(([key]) => resolveCache.delete(key)); }
    return res.status(200).json(result);
  } catch (err) {
    console.error('Bandcamp resolve error:', err);
    return res.status(200).json({ error: 'Failed to resolve track' });
  }
}
