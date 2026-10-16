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

  const now = Date.now();

  // ==== ACTION: album-tracks ====
  if (action === 'album-tracks') {
    const cacheKey = `album:${url}`;
    if (resolveCache.has(cacheKey)) {
      const cached = resolveCache.get(cacheKey);
      if (now - cached.timestamp < CACHE_TTL) return res.status(200).json(cached.data);
      resolveCache.delete(cacheKey);
    }
    try {
      const htmlRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!htmlRes.ok) return res.status(200).json({ tracks: [], error: `Fetch failed: ${htmlRes.status}` });
      const html = await htmlRes.text();

      let tralbumData = null;

      // Method 1: data-tralbum attribute
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
        } catch (e) {
          console.error('album-tracks: data-tralbum parse failed:', e.message);
        }
      }

      // Method 2: var TralbumData = {...};
      if (!tralbumData) {
        const varMatch = html.match(/var\s+TralbumData\s*=\s*(\{[\s\S]*?\});\s*\n/);
        if (varMatch) {
          try { tralbumData = JSON.parse(varMatch[1]); } catch (e) {
            console.error('album-tracks: TralbumData var parse failed:', e.message);
          }
        }
      }

      // Method 3: trackinfo array in inline script
      if (!tralbumData) {
        const scriptMatch = html.match(/"trackinfo"\s*:\s*(\[[\s\S]*?\])\s*,/);
        if (scriptMatch) {
          try {
            const trackinfo = JSON.parse(scriptMatch[1]);
            tralbumData = { trackinfo };
          } catch (e) {
            console.error('album-tracks: trackinfo parse failed:', e.message);
          }
        }
      }

      if (!tralbumData || !tralbumData.trackinfo || !tralbumData.trackinfo.length) {
        return res.status(200).json({ tracks: [], error: 'No track data found' });
      }

      // Extract artwork
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

      const albumName = tralbumData.current?.title || '';

      const tracks = tralbumData.trackinfo.map((t, i) => {
        const file = t.file;
        const streamUrl = file ? (file['mp3-128'] || Object.values(file)[0] || null) : null;
        return {
          title: t.title || `Track ${i + 1}`,
          artist,
          artworkUrl,
          albumName,
          duration: t.duration ? Math.round(t.duration) : 0,
          streamUrl,
          trackNum: t.track_num || i + 1,
          url: t.title_link ? new URL(t.title_link, url).toString() : url,
        };
      });

      const result = { tracks, albumName, artist, artworkUrl };
      resolveCache.set(cacheKey, { data: result, timestamp: now });
      return res.status(200).json(result);
    } catch (err) {
      console.error('Bandcamp album-tracks error:', err);
      return res.status(200).json({ tracks: [], error: err.message });
    }
  }

  // ==== ACTION: label-releases ====
  if (action === 'label-releases') {
    try {
      // Fetch music page for releases
      let fetchUrl = url;
      if (!fetchUrl.endsWith('/music') && !fetchUrl.includes('/album/')) {
        fetchUrl = fetchUrl.replace(/\/$/, '') + '/music';
      }
      const htmlRes = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } });
      if (!htmlRes.ok) return res.status(200).json({ releases: [], bio: '', location: '', imageUrl: '', links: [] });
      const html = await htmlRes.text();
      const releases = [];
      const unescapeHtml = (str) => (str || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const olMatch = html.match(/<ol[^>]*id="music-grid"[^>]*>([\s\S]*?)<\/ol>/i) || html.match(/<ul[^>]*class="[^"]*music-grid[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
      if (olMatch) {
        const listHtml = olMatch[1];
        const liBlocks = listHtml.match(/<li[^>]*class="[^"]*music-grid-item[^"]*"[^>]*>[\s\S]*?<\/li>/gi) || [];
        for (const li of liBlocks) {
          const hrefMatch = li.match(/<a[^>]*href="([^"]+)"/i);
          if (!hrefMatch) continue;
          const relUrl = new URL(unescapeHtml(hrefMatch[1]), url).toString();
          const imgOriginal = li.match(/<img[^>]*data-original="([^"]+)"/i);
          const imgSrc = li.match(/<img[^>]*src="([^"]+)"/i);
          let artworkUrl = (imgOriginal && imgOriginal[1]) || (imgSrc && !imgSrc[1].includes('0.gif') ? imgSrc[1] : '');
          const pMatch = li.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
          let title = '';
          let artist = '';
          if (pMatch) {
            const pInner = pMatch[1];
            const artistMatch = pInner.match(/<span[^>]*class="[^"]*artist-override[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            if (artistMatch) {
              artist = unescapeHtml(artistMatch[1].replace(/<[^>]+>/g, '').trim());
            }
            const titlePart = pInner.split(/<br\s*\/?>|<span[^>]*class="[^"]*artist-override/i)[0];
            title = unescapeHtml(titlePart.replace(/<[^>]+>/g, '').trim());
          }
          if (title) {
            releases.push({ url: relUrl, artworkUrl, title, artist });
          }
        }
        // Fallback regex if liBlocks didn't match
        if (releases.length === 0) {
          const itemRegex = /<a href="([^"]+)">([\s\S]*?)<img[^>]*src="([^"]+)"[\s\S]*?<p class="title">\s*(.*?)\s*<br>\s*<span class="artist-override">\s*(.*?)\s*<\/span>|<a href="([^"]+)">([\s\S]*?)<img[^>]*src="([^"]+)"[\s\S]*?<p class="title">\s*(.*?)\s*<\/p>/gi;
          let match;
          while ((match = itemRegex.exec(listHtml)) !== null) {
            if (match[1]) releases.push({ url: new URL(unescapeHtml(match[1]), url).toString(), artworkUrl: match[3], title: unescapeHtml(match[4].trim()), artist: unescapeHtml(match[5].trim()) });
            else if (match[6]) releases.push({ url: new URL(unescapeHtml(match[6]), url).toString(), artworkUrl: match[8], title: unescapeHtml(match[9].trim()), artist: '' });
          }
        }
      }

      const parseMetaFromHtml = (pageHtml) => {
        let bioText = '';
        const bioMatch = pageHtml.match(/<p[^>]*id="bio-text"[^>]*>([\s\S]*?)<\/p>/i)
          || pageHtml.match(/<div[^>]*class="[^"]*signed-out-artists-bio-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
          || pageHtml.match(/<p[^>]*class="[^"]*band-description[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
          || pageHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
          || pageHtml.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
        if (bioMatch) {
          bioText = unescapeHtml(bioMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim());
        }
        let loc = '';
        const locMatch = pageHtml.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        if (locMatch) {
          loc = unescapeHtml(locMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        let img = '';
        const bandPhotoMatch = pageHtml.match(/<img[^>]*class="[^"]*band-photo[^"]*"[^>]*src="([^"]+)"/i)
          || pageHtml.match(/<a[^>]*class="[^"]*popupImage[^"]*"[^>]*href="([^"]+)"/i)
          || pageHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (bandPhotoMatch) {
          img = bandPhotoMatch[1];
        }
        const extractedLinks = [];
        const bandLinksMatch = pageHtml.match(/<ol[^>]*id="band-links"[^>]*>([\s\S]*?)<\/ol>/i) || pageHtml.match(/<ul[^>]*id="band-links"[^>]*>([\s\S]*?)<\/ul>/i);
        if (bandLinksMatch) {
          const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
          let lm;
          while ((lm = linkRegex.exec(bandLinksMatch[1])) !== null) {
            const href = unescapeHtml(lm[1].trim());
            if (href && /^https?:\/\//i.test(href)) extractedLinks.push(href);
          }
        }
        return { bioText, loc, img, extractedLinks };
      };

      let { bioText: bio, loc: location, img: imageUrl, extractedLinks: links } = parseMetaFromHtml(html);

      const mainUrl = url.replace(/\/music\/?$/, '').replace(/\/$/, '');
      if ((!bio || !location || links.length === 0) && mainUrl !== fetchUrl.replace(/\/$/, '')) {
        try {
          const bioRes = await fetch(mainUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (bioRes.ok) {
            const bioHtml = await bioRes.text();
            const m2 = parseMetaFromHtml(bioHtml);
            if (!bio && m2.bioText) bio = m2.bioText;
            if (!location && m2.loc) location = m2.loc;
            if (!imageUrl && m2.img) imageUrl = m2.img;
            if (m2.extractedLinks.length > 0) links = Array.from(new Set([...links, ...m2.extractedLinks]));
          }
        } catch (e) {}
      }

      const finalLinks = Array.from(new Set([mainUrl, ...links])).filter(Boolean);
      return res.status(200).json({ releases: releases.slice(0, 120), bio, location, imageUrl, links: finalLinks });
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
