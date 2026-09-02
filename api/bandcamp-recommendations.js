// POST /api/bandcamp-recommendations
// Body: { url: string }
// Scrapes the fans who bought a release, then scrapes their collections to tally frequencies.

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
    const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!htmlRes.ok) return res.status(200).json({ recommendations: [] });
    
    const html = await htmlRes.text();
    
    const fans = [];
    const fanMatch = html.match(/"author":\{"@type":"Person","url":"([^"]+)"/g);
    if (fanMatch) {
      fanMatch.forEach(m => {
        const fanUrl = m.match(/"url":"([^"]+)"/)[1];
        if (fanUrl.includes('bandcamp.com')) fans.push(fanUrl);
      });
    }
    
    // Fallback if JSON-LD isn't present
    if (fans.length === 0) {
      const altMatch = html.match(/<a[^>]*class="[^"]*fan[^"]*"[^>]*href="([^"]+)"/g);
      if (altMatch) {
        altMatch.forEach(m => {
          let href = m.match(/href="([^"]+)"/)[1];
          if (href.startsWith('/')) href = 'https://bandcamp.com' + href;
          if (href.includes('bandcamp.com')) fans.push(href);
        });
      }
    }
    
    const uniqueFans = [...new Set(fans)].slice(0, 10); // Check up to 10 fans for speed
    
    const recommendations = {};
    
    // Fetch fan collections in parallel to save time
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
            // Skip the current release (or any from the same base URL just in case)
            if (!item.item_url || item.item_url === url) continue;
            
            if (!recommendations[item.item_url]) {
              recommendations[item.item_url] = { 
                count: 0, 
                title: item.item_title, 
                artistName: item.band_name, 
                artworkUrl: item.item_art_id ? `https://f4.bcbits.com/img/a${item.item_art_id}_10.jpg` : '',
                trackUrl: item.item_url
              };
            }
            recommendations[item.item_url].count++;
          }
        }
      } catch (e) {}
    }));
    
    const sorted = Object.values(recommendations)
      .sort((a, b) => b.count - a.count)
      .slice(0, 40); // Return top 40 (4 pages of 10)
      
    return res.status(200).json({ recommendations: sorted });
  } catch (err) {
    console.error('Recommendations fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
}
