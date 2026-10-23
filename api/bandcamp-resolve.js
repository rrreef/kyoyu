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

      const unescapeEntity = (str) => String(str || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();

      const stripArtistPrefix = (rawTitle, rawArtist) => {
        let t = String(rawTitle || '').trim();
        if (!t) return '';
        const leadMatch = t.match(/^(?:[A-D]\d{1,2}|\d{1,2})\s*[.)\-]\s*(.+-.+)$/i);
        if (leadMatch && leadMatch[1]) t = leadMatch[1].trim();
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const aNorm = norm(rawArtist);
        for (const sep of [' — ', ' – ', ' - ']) {
          const idx = t.indexOf(sep);
          if (idx > 0) {
            const left = t.slice(0, idx).trim();
            const right = t.slice(idx + sep.length).trim();
            if (!left || !right) continue;
            if (aNorm && (norm(left) === aNorm || norm(left).includes(aNorm) || aNorm.includes(norm(left)))) return right;
            if (aNorm && norm(right) === aNorm) return left;
            const isTrackPos = /^([A-D]\d{1,2}|\d{1,3}|track\s*\d+|part\s*[0-9ivx]+|pt\.?\s*[0-9ivx]+)$/i.test(left);
            if (isTrackPos) return right;
            const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
            if (!isRightDesc && left.length >= 2) return right;
          }
        }
        return t;
      };

      const extractBandPageLabel = (pageHtml) => {
        let bName = unescapeEntity(
          (pageHtml.match(/<p[^>]*id="band-name-location"[^>]*>[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] ||
          (pageHtml.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i) || [])[1] ||
          ''
        );
        if (!bName) {
          const bandAttr = (pageHtml.match(/data-band="([^"]+)"/) || [])[1];
          if (bandAttr) {
            try {
              const bandJson = JSON.parse(unescapeEntity(bandAttr));
              if (bandJson?.name) bName = String(bandJson.name).trim();
            } catch (e) {}
          }
        }
        return bName.replace(/<[^>]+>/g, '').trim();
      };

      // Extract artwork
      let artworkUrl = '';
      const artMatch = html.match(/<a class="popupImage"[^>]*href="([^"]+)"/);
      if (artMatch) {
        artworkUrl = artMatch[1];
      } else {
        const ogImgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
        if (ogImgMatch) artworkUrl = ogImgMatch[1];
      }

      const bandPageName = extractBandPageLabel(html);
      let originUrl = '';
      try { originUrl = new URL(url).origin; } catch (e) {}

      // Extract artist
      let artist = unescapeEntity(tralbumData.artist || '');
      if (!artist) {
        artist = bandPageName;
      }

      let rawAlbumName = unescapeEntity(tralbumData.current?.title || '');
      for (const sep of [' — ', ' – ', ' - ']) {
        const idx = rawAlbumName.indexOf(sep);
        if (idx > 0) {
          const left = rawAlbumName.slice(0, idx).trim();
          const right = rawAlbumName.slice(idx + sep.length).trim();
          const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
          if (left && right && !isRightDesc) {
            if (!artist || artist.toLowerCase() === bandPageName.toLowerCase() || /^various(\s+artists)?$/i.test(artist)) {
              artist = left;
            }
            rawAlbumName = right;
            break;
          }
        }
      }
      const albumName = stripArtistPrefix(rawAlbumName, artist);
      const releaseDateRaw = String(tralbumData.current?.release_date || tralbumData.album_release_date || tralbumData.current?.publish_date || '');
      const year = (releaseDateRaw.match(/\b(19\d\d|20\d\d)\b/) || [])[1] || '';
      const label = bandPageName || artist || '';

      const tracks = tralbumData.trackinfo.map((t, i) => {
        const file = t.file;
        const streamUrl = file ? (file['mp3-128'] || Object.values(file)[0] || null) : null;
        let trackArtist = unescapeEntity(t.artist || artist || '');
        let rawTrackTitle = unescapeEntity(t.title || `Track ${i + 1}`);
        const cleanTitle = stripArtistPrefix(rawTrackTitle, trackArtist);
        return {
          title: cleanTitle,
          artist: trackArtist,
          artworkUrl,
          albumName,
          label,
          labelUrl: originUrl,
          year,
          duration: t.duration ? Math.round(t.duration) : 0,
          streamUrl,
          trackNum: t.track_num || i + 1,
          url: t.title_link ? new URL(t.title_link, url).toString() : url,
        };
      });

      const result = { tracks, albumName, artist, label, labelUrl: originUrl, year, artworkUrl };
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
      let originUrl = url.replace(/\/music\/?$/, '').replace(/\/$/, '');
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'bandcamp.com' && parsed.hostname.endsWith('.bandcamp.com')) {
          originUrl = parsed.origin;
        }
      } catch {}
      const fetchUrl = originUrl + '/music';

      const htmlRes = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });
      if (!htmlRes.ok) return res.status(200).json({ releases: [], bio: '', location: '', imageUrl: '', links: [] });
      const html = await htmlRes.text();
      const releases = [];
      const seenRelUrls = new Set();
      const unescapeHtml = (str) => (str || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"');

      const cleanRelTitleAndArtist = (rawTitle, rawArtist, labelBandName) => {
        let t = String(rawTitle || '').trim();
        let a = String(rawArtist || '').trim();
        for (const sep of [' — ', ' – ', ' - ']) {
          const idx = t.indexOf(sep);
          if (idx > 0) {
            const left = t.slice(0, idx).trim();
            const right = t.slice(idx + sep.length).trim();
            const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
            if (left && right && !isRightDesc) {
              if (!a || (labelBandName && a.toLowerCase() === labelBandName.toLowerCase())) {
                a = left;
              }
              t = right;
              break;
            }
          }
        }
        return { title: t, artist: a };
      };

      let preliminaryBandName = '';
      const prelimNameMatch = html.match(/<p[^>]*id="band-name-location"[^>]*>[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (prelimNameMatch) {
        preliminaryBandName = unescapeHtml(prelimNameMatch[1].replace(/<[^>]+>/g, '').trim());
      }

      const addRel = (rel) => {
        if (!rel || !rel.title) return;
        const cleaned = cleanRelTitleAndArtist(rel.title, rel.artist, preliminaryBandName);
        rel.title = cleaned.title || rel.title;
        rel.artist = cleaned.artist || rel.artist || '';
        const cleanUrl = (rel.url || '').split('?')[0];
        const key = cleanUrl || rel.title.toLowerCase();
        const existingIdx = releases.findIndex(r => ((r.url || '').split('?')[0] || r.title.toLowerCase()) === key);
        if (existingIdx >= 0) {
          if (!releases[existingIdx].artworkUrl && rel.artworkUrl) releases[existingIdx].artworkUrl = rel.artworkUrl;
          if (!releases[existingIdx].artist && rel.artist) releases[existingIdx].artist = rel.artist;
          if (!releases[existingIdx].year && rel.year) releases[existingIdx].year = rel.year;
          if (!releases[existingIdx].releaseTimestamp && rel.releaseTimestamp) releases[existingIdx].releaseTimestamp = rel.releaseTimestamp;
          return;
        }
        seenRelUrls.add(key);
        rel.gridIndex = releases.length;
        releases.push(rel);
      };

      const olMatch = html.match(/<ol[^>]*id="music-grid"[^>]*>([\s\S]*?)<\/ol>/i) || html.match(/<ul[^>]*class="[^"]*music-grid[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
      if (olMatch) {
        const listHtml = olMatch[1];
        const liBlocks = listHtml.match(/<li[^>]*class="[^"]*music-grid-item[^"]*"[^>]*>[\s\S]*?<\/li>/gi) || [];
        for (const li of liBlocks) {
          const hrefMatch = li.match(/<a[^>]*href="([^"]+)"/i);
          if (!hrefMatch) continue;
          const relUrl = new URL(unescapeHtml(hrefMatch[1]), originUrl).toString().split('?')[0];
          const imgOriginal = li.match(/<img[^>]*data-original="([^"]+)"/i);
          const imgSrc = li.match(/<img[^>]*src="([^"]+)"/i);
          let artworkUrl = (imgOriginal && imgOriginal[1]) || (imgSrc && !imgSrc[1].includes('0.gif') ? imgSrc[1] : '');
          if (artworkUrl && artworkUrl.includes('bcbits.com')) {
            artworkUrl = artworkUrl.replace(/_[0-9]+\.jpg/, '_10.jpg');
          }
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
            addRel({ url: relUrl, artworkUrl, title, artist, year: null, releaseTimestamp: 0 });
          }
        }
      }

      // Also parse data-client-items on #music-grid (contains full catalog with art_id and release_date)
      const clientItemsMatch = html.match(/data-client-items="([^"]+)"/i);
      if (clientItemsMatch) {
        try {
          const clientItems = JSON.parse(unescapeHtml(clientItemsMatch[1]));
          if (Array.isArray(clientItems)) {
            for (const ci of clientItems) {
              const title = (ci.title || '').trim();
              if (!title) continue;
              const artist = (ci.artist || '').trim();
              const relUrl = ci.page_url ? new URL(ci.page_url, originUrl).toString().split('?')[0] : '';
              const artworkUrl = ci.art_id ? `https://f4.bcbits.com/img/a${ci.art_id}_10.jpg` : '';
              let year = null;
              let releaseTimestamp = 0;
              if (ci.release_date || ci.publish_date) {
                const dateStr = String(ci.release_date || ci.publish_date);
                const ym = dateStr.match(/\b((?:19|20)\d{2})\b/);
                if (ym) year = ym[1];
                const parsedTs = Date.parse(dateStr);
                if (!Number.isNaN(parsedTs)) releaseTimestamp = parsedTs;
              }
              addRel({ url: relUrl, artworkUrl, title, artist, year, releaseTimestamp });
            }
          }
        } catch (e) {}
      }

      // Fill in years for top releases that came from initial HTML before data-client-items
      let latestKnownYear = new Date().getFullYear();
      for (const r of releases) {
        if (r.year && Number(r.year) > 1950) {
          latestKnownYear = Number(r.year);
          break;
        }
      }
      for (let i = 0; i < releases.length; i++) {
        if (releases[i].year) {
          latestKnownYear = Number(releases[i].year) || latestKnownYear;
        } else {
          releases[i].year = String(latestKnownYear);
        }
      }

      const parseMetaFromHtml = (pageHtml) => {
        let bandName = '';
        const nameMatch = pageHtml.match(/<p[^>]*id="band-name-location"[^>]*>[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        if (nameMatch) {
          bandName = unescapeHtml(nameMatch[1].replace(/<[^>]+>/g, '').trim());
        }

        let bioText = '';
        const bioMatch = pageHtml.match(/<p[^>]*id="bio-text"[^>]*>([\s\S]*?)<\/p>/i)
          || pageHtml.match(/<div[^>]*class="[^"]*signed-out-artists-bio-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
          || pageHtml.match(/<p[^>]*class="[^"]*band-description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        if (bioMatch) {
          const rawBioHtml = bioMatch[1]
            .replace(/<a[^>]*class="[^"]*more[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '');
          bioText = unescapeHtml(rawBioHtml).replace(/\s*(\.{3}\s*)?(more|less)\s*$/i, '').trim();
        }
        if (!bioText) {
          const metaDesc = pageHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
            || pageHtml.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
          if (metaDesc) {
            const candidate = unescapeHtml(metaDesc[1].trim());
            if (candidate && !/\b1\.\s+.*\b2\.\s+/.test(candidate)) {
              bioText = candidate;
            }
          }
        }

        let loc = '';
        const locMatch = pageHtml.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        if (locMatch) {
          loc = unescapeHtml(locMatch[1].replace(/<[^>]+>/g, '').trim());
        }

        let img = '';
        const bandPhotoMatch = pageHtml.match(/<img[^>]*class="[^"]*band-photo[^"]*"[^>]*src="([^"]+)"/i)
          || pageHtml.match(/<a[^>]*class="[^"]*popupImage[^"]*"[^>]*href="([^"]*bcbits\.com\/img\/00[^"]+)"/i)
          || pageHtml.match(/<img[^>]*src="([^"]*bcbits\.com\/img\/00[^"]+)"/i);
        if (bandPhotoMatch) {
          img = bandPhotoMatch[1];
        }

        const extractedLinks = [];
        const bandLinksMatch = pageHtml.match(/<(?:ol|ul|div)[^>]*id="band-links"[^>]*>([\s\S]*?)<\/(?:ol|ul|div)>/i);
        if (bandLinksMatch) {
          const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
          let lm;
          while ((lm = linkRegex.exec(bandLinksMatch[1])) !== null) {
            const href = unescapeHtml(lm[1].trim());
            if (href && /^https?:\/\//i.test(href) && !href.includes('bandcamp.com/help')) {
              extractedLinks.push(href);
            }
          }
        }
        // Also scan bio text for explicit social links (Instagram, SoundCloud, Discogs, RA, etc.)
        if (bioText) {
          const urlMatches = bioText.match(/https?:\/\/[^\s\])"<>]+/gi) || [];
          urlMatches.forEach(u => extractedLinks.push(u.replace(/[.,;]+$/, '')));
          const bareMatches = bioText.match(/(?:instagram\.com|soundcloud\.com|discogs\.com\/label|ra\.co\/labels)\/[a-zA-Z0-9_.\-\/]+/gi) || [];
          bareMatches.forEach(b => extractedLinks.push(`https://${b.replace(/[.,;]+$/, '')}`));
        }
        return { bandName, bioText, loc, img, extractedLinks };
      };

      let { bandName, bioText: bio, loc: location, img: imageUrl, extractedLinks: links } = parseMetaFromHtml(html);

      if ((!bio || !location || links.length === 0) && originUrl !== fetchUrl.replace(/\/$/, '')) {
        try {
          const bioRes = await fetch(originUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (bioRes.ok) {
            const bioHtml = await bioRes.text();
            const m2 = parseMetaFromHtml(bioHtml);
            if (!bandName && m2.bandName) bandName = m2.bandName;
            if (!bio && m2.bioText) bio = m2.bioText;
            if (!location && m2.loc) location = m2.loc;
            if (!imageUrl && m2.img) imageUrl = m2.img;
            if (m2.extractedLinks.length > 0) links = Array.from(new Set([...links, ...m2.extractedLinks]));
          }
        } catch (e) {}
      }

      const finalLinks = Array.from(new Set([originUrl, ...links])).filter(Boolean);
      return res.status(200).json({ name: bandName, releases: releases.slice(0, 150), bio, location, imageUrl, links: finalLinks });
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

    let bandPageName = (
      (html.match(/<p[^>]*id="band-name-location"[^>]*>[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] ||
      (html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i) || [])[1] ||
      ''
    ).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

    let artist = tralbumData.artist || bandPageName || '';
    const label = bandPageName || artist || '';
    let originUrl = '';
    try { originUrl = new URL(url).origin; } catch (e) {}
    const releaseDateRaw = String(tralbumData.current?.release_date || tralbumData.album_release_date || tralbumData.current?.publish_date || '');
    const year = (releaseDateRaw.match(/\b(19\d\d|20\d\d)\b/) || [])[1] || '';

    const result = {
      streamUrl,
      title: track.title || '',
      artist,
      label,
      labelUrl: originUrl,
      year,
      artworkUrl,
      duration: track.duration ? Math.round(track.duration) : 0,
      albumName: tralbumData.current?.title || '',
      trackUrl: url,
    };
    resolveCache.set(url, { data: result, timestamp: now });
    if (resolveCache.size > 500) { const oldest = [...resolveCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 100); oldest.forEach(([key]) => resolveCache.delete(key)); }
    return res.status(200).json(result);
  } catch (err) {
    console.error('Bandcamp resolve error:', err);
    return res.status(200).json({ error: 'Failed to resolve track' });
  }
}
