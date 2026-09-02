// POST /api/bandcamp-label-releases
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch {}
  let { url } = body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

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
        if (match[1]) {
          releases.push({
            url: new URL(unescapeHtml(match[1]), url).toString(),
            artworkUrl: match[2],
            title: unescapeHtml(match[3].trim()),
            artist: unescapeHtml(match[4].trim())
          });
        } else if (match[5]) {
          releases.push({
            url: new URL(unescapeHtml(match[5]), url).toString(),
            artworkUrl: match[6],
            title: unescapeHtml(match[7].trim()),
            artist: ''
          });
        }
      }
    }
    
    return res.status(200).json({ releases: releases.slice(0, 10) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch label' });
  }
}
