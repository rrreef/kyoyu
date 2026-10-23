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
      const fetchHtml = async (targetUrl) => {
        const r = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        });
        return r.ok ? await r.text() : '';
      };

      const parseTralbum = (pageHtml) => {
        let tr = null;
        const tralbumMatch = pageHtml.match(/data-tralbum="([^"]+)"/) || pageHtml.match(/data-tralbum='([^']+)'/);
        if (tralbumMatch) {
          try {
            const decoded = tralbumMatch[1]
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&');
            tr = JSON.parse(decoded);
          } catch (e) {}
        }
        if (!tr || !tr.trackinfo) {
          const varMatch = pageHtml.match(/var\s+TralbumData\s*=\s*(\{[\s\S]*?\});\s*\n/);
          if (varMatch) {
            try { tr = JSON.parse(varMatch[1]); } catch (e) {}
          }
        }
        if (!tr || !tr.trackinfo) {
          const scriptMatch = pageHtml.match(/"trackinfo"\s*:\s*(\[[\s\S]*?\])\s*,/);
          if (scriptMatch) {
            try { tr = { trackinfo: JSON.parse(scriptMatch[1]) }; } catch (e) {}
          }
        }
        return tr;
      };

      let effectiveUrl = body.albumUrl;
      let html = await fetchHtml(effectiveUrl);
      if (!html) return res.status(200).json({ tracks: [] });

      const tracks = [];
      let tralbum = parseTralbum(html);

      // If given a /track/ URL that belongs to a parent /album/, fetch the parent /album/ so we get all album tracks and true album title!
      if (/\/track\//i.test(effectiveUrl) || tralbum?.item_type === 'track') {
        const parentHref = tralbum?.album_url || ((html.match(/<a[^>]*href="([^"]*\/album\/[^"?#]+)"/i) || [])[1] || '');
        if (parentHref) {
          try {
            const parentFullUrl = new URL(parentHref, effectiveUrl).href;
            if (parentFullUrl && parentFullUrl !== effectiveUrl) {
              const parentHtml = await fetchHtml(parentFullUrl);
              if (parentHtml) {
                const parentTralbum = parseTralbum(parentHtml);
                if (parentTralbum && Array.isArray(parentTralbum.trackinfo) && parentTralbum.trackinfo.length > 0) {
                  effectiveUrl = parentFullUrl;
                  html = parentHtml;
                  tralbum = parentTralbum;
                }
              }
            }
          } catch (e) {}
        }
      }

      const decodeEntities = (str) => String(str || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();

      const stripArtistFromTitle = (rawTitle, rawArtist) => {
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
            if (aNorm && (norm(left) === aNorm || norm(left).includes(aNorm) || aNorm.includes(norm(left)))) {
              return right;
            }
            if (aNorm && norm(right) === aNorm) {
              return left;
            }
            const isTrackPos = /^([A-D]\d{1,2}|\d{1,3}|track\s*\d+|part\s*[0-9ivx]+|pt\.?\s*[0-9ivx]+)$/i.test(left);
            if (isTrackPos) return right;
            const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
            if (!isRightDesc && left.length >= 2) return right;
          }
        }
        return t;
      };

      const albumArt =
        (html.match(/<a class="popupImage"[^>]*href="([^"]+)"/) || [])[1] ||
        (html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/) || [])[1] ||
        '';

      // Extract the Bandcamp page's band/label name (e.g. "NAFF" on naffrecordings.bandcamp.com)
      let bandPageName = decodeEntities(
        (html.match(/<p id="band-name-location">\s*<span class="title">([^<]+)<\/span>/i) || [])[1] ||
        (html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i) || [])[1] ||
        ''
      );
      if (!bandPageName) {
        const bandAttr = (html.match(/data-band="([^"]+)"/) || [])[1];
        if (bandAttr) {
          try {
            const bandJson = JSON.parse(decodeEntities(bandAttr));
            if (bandJson?.name) bandPageName = String(bandJson.name).trim();
          } catch (e) {}
        }
      }

      let originUrl = '';
      try { originUrl = new URL(effectiveUrl).origin; } catch (e) {}

      let albumArtist = decodeEntities(tralbum?.artist || '');
      const isStillTrackPage = /\/track\//i.test(effectiveUrl) || tralbum?.item_type === 'track';
      const fromAlbumHtml = decodeEntities(
        ((html.match(/<span[^>]*class="fromAlbum"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/<[^>]+>/g, '').trim()
      );
      const inAlbumLd = decodeEntities(
        ((html.match(/"inAlbum"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/i) || [])[1] || '').trim()
      );
      let rawAlbumTitle = isStillTrackPage
        ? (decodeEntities(tralbum?.album_title || '') || fromAlbumHtml || inAlbumLd || decodeEntities(tralbum?.current?.title || ''))
        : (decodeEntities(tralbum?.current?.title || tralbum?.album_title || '') || fromAlbumHtml || inAlbumLd);
      if (!rawAlbumTitle) {
        rawAlbumTitle = decodeEntities((html.match(/<h2 class="trackTitle">\s*([\s\S]*?)\s*<\/h2>/i) || [])[1] || '');
      }
      // If artist matches bandPageName (or is empty) and albumTitle is "Artist - Title", split out the real artist
      for (const sep of [' — ', ' – ', ' - ']) {
        const idx = rawAlbumTitle.indexOf(sep);
        if (idx > 0) {
          const left = rawAlbumTitle.slice(0, idx).trim();
          const right = rawAlbumTitle.slice(idx + sep.length).trim();
          const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
          if (left && right && !isRightDesc) {
            if (!albumArtist || albumArtist.toLowerCase() === bandPageName.toLowerCase() || /^various(\s+artists)?$/i.test(albumArtist)) {
              if (!bandPageName && albumArtist) bandPageName = albumArtist;
              albumArtist = left;
            }
            rawAlbumTitle = right;
            break;
          }
        }
      }
      const cleanAlbumTitle = stripArtistFromTitle(rawAlbumTitle, albumArtist);
      const releaseDateRaw = String(tralbum?.current?.release_date || tralbum?.album_release_date || tralbum?.current?.publish_date || '');
      const releaseYear = (releaseDateRaw.match(/\b(19\d\d|20\d\d)\b/) || [])[1] || '';
      const resolvedLabel = bandPageName || albumArtist || '';

      if (tralbum && Array.isArray(tralbum.trackinfo)) {
        for (const t of tralbum.trackinfo) {
          const file = t.file;
          const streamUrl = file ? (file['mp3-128'] || Object.values(file)[0] || '') : '';
          let trackArtist = decodeEntities(t.artist || albumArtist || '');
          let rawTrackTitle = decodeEntities(t.title || '');
          for (const sep of [' — ', ' – ', ' - ']) {
            const idx = rawTrackTitle.indexOf(sep);
            if (idx > 0) {
              const left = rawTrackTitle.slice(0, idx).trim();
              const right = rawTrackTitle.slice(idx + sep.length).trim();
              const isTrackPos = /^([A-D]\d{1,2}|\d{1,3}|track\s*\d+|part\s*[0-9ivx]+|pt\.?\s*[0-9ivx]+)$/i.test(left);
              const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
              if (!isTrackPos && !isRightDesc && left && right) {
                if (!t.artist && (!trackArtist || trackArtist.toLowerCase() === bandPageName.toLowerCase() || /^various(\s+artists)?$/i.test(trackArtist))) {
                  trackArtist = left;
                }
                rawTrackTitle = right;
                break;
              }
            }
          }
          const cleanTrackTitle = stripArtistFromTitle(rawTrackTitle, trackArtist);
          tracks.push({
            trackId: t.track_id || t.id,
            title: cleanTrackTitle,
            duration: Math.round((t.duration || 0)),
            streamUrl,
            // Track page URL (stable) — stream URLs expire, so clients need this to re-resolve later
            trackUrl: (() => { try { return t.title_link ? new URL(t.title_link, effectiveUrl).href : effectiveUrl; } catch (e) { return effectiveUrl; } })(),
            artworkUrl: albumArt,
            artistName: trackArtist,
            albumName: cleanAlbumTitle,
            label: resolvedLabel,
            labelUrl: originUrl,
            year: releaseYear,
          });
        }
      }
      
      // 4. Fallback: try LD+JSON
      if (tracks.length === 0) {
        const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (ldMatch) {
          try {
            const ld = JSON.parse(ldMatch[1]);
            const ldArt = ld.image || albumArt;
            const ldArtist = ld.byArtist?.name || albumArtist || '';
            const ldLabel = ld.publisher?.name || resolvedLabel || ldArtist || '';
            for (const t of (ld.track?.itemListElement || [])) {
              const item = t.item || t;
              const tArtist = item.byArtist?.name || ldArtist;
              tracks.push({
                trackId: item['@id'] || t.position,
                trackUrl: /^https?:\/\//.test(item['@id'] || '') ? item['@id'] : effectiveUrl,
                title: stripArtistFromTitle(item.name || '', tArtist),
                duration: 0,
                artworkUrl: ldArt,
                artistName: tArtist,
                albumName: cleanAlbumTitle || ld.name || '',
                label: ldLabel,
                labelUrl: originUrl,
                year: releaseYear,
              });
            }
          } catch (e) { /* parse error */ }
        }
      }
      
      return res.status(200).json({
        tracks,
        album: {
          title: cleanAlbumTitle,
          artistName: albumArtist,
          label: resolvedLabel,
          labelUrl: originUrl,
          year: releaseYear,
          artworkUrl: albumArt,
        }
      });
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

    const LABEL_NAME_RE = /\b(records|recordings|label|disques|tapes|editions|edizioni|imprint|recs|platten|schallplatten|discos)\b/i;
    const results = items
      .map(item => {
        let artworkUrl = item.img || '';
        if (item.art_id) {
          artworkUrl = `https://f4.bcbits.com/img/a${item.art_id}_10.jpg`;
        } else if (item.img_id) {
          artworkUrl = `https://f4.bcbits.com/img/00${item.img_id}_23.jpg`;
        }
        
        const looksLikeLabel = item.type === 'b' && (item.is_label || LABEL_NAME_RE.test(item.name || ''));
        const type = item.type === 'b' ? (looksLikeLabel ? 'label' : 'artist') : item.type === 'a' ? 'album' : item.type === 'f' ? 'fan' : 'track';

        let rawTitle = String(item.name || '').trim();
        let artistName = String(item.band_name || (type === 'artist' || type === 'label' ? item.name : '')).trim();
        let labelName = '';
        if (type === 'track' || type === 'album') {
          for (const sep of [' — ', ' – ', ' - ']) {
            const idx = rawTitle.indexOf(sep);
            if (idx > 0) {
              const left = rawTitle.slice(0, idx).trim();
              const right = rawTitle.slice(idx + sep.length).trim();
              const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
              if (left && right && !isRightDesc) {
                if (artistName && left.toLowerCase() !== artistName.toLowerCase()) {
                  labelName = artistName;
                  artistName = left;
                } else if (!artistName) {
                  artistName = left;
                }
                rawTitle = right;
                break;
              }
            }
          }
        }

        return {
          trackId: item.id,
          type,
          title: rawTitle,
          artistName,
          labelName: labelName || (item.band_name || ''),
          artworkUrl,
          trackUrl: item.item_url_path || item.item_url_root || item.url || '',
          albumName: item.album_name || (type === 'album' ? rawTitle : ''),
          albumId: item.album_id || null,
          location: item.location || '',
          genre: item.genre_name || '',
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
