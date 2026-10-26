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
      const creditsDateMatch = html.match(/released\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
      let formattedReleaseDate = creditsDateMatch ? creditsDateMatch[1].trim() : '';
      if (!formattedReleaseDate && releaseDateRaw) {
        const dt = new Date(releaseDateRaw);
        if (!Number.isNaN(dt.getTime()) && dt.getFullYear() >= 1950) {
          formattedReleaseDate = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      }
      if (!formattedReleaseDate) formattedReleaseDate = releaseYear;

      const bandLocation = decodeEntities(
        ((html.match(/<p[^>]*id="band-name-location"[^>]*>[\s\S]*?<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '')
          .replace(/<[^>]+>/g, '')
          .trim()
      );

      const backToLabelName = decodeEntities(
        ((html.match(/<a[^>]*class="[^"]*back-to-label-link[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*label-welcome[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '')
          .replace(/<[^>]+>/g, '')
          .replace(/^visit\s+/i, '')
          .trim()
      );
      const publisherLdName = decodeEntities(
        ((html.match(/"(?:recordLabel|publisher)"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/i) || [])[1] || '').trim()
      );
      const normKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, '');
      const artistNorm = normKey(albumArtist);
      const artistCollabs = String(albumArtist || '').split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i).map(normKey).filter(Boolean);
      const isDistinctFromArtist = (cand) => {
        const cNorm = normKey(cand);
        if (!cNorm || cNorm === 'bandcamp' || /^(notonlabel|selfreleased|independent|nolabel|none|unknown)/.test(cNorm)) return false;
        if (artistNorm && cNorm === artistNorm) return false;
        if (artistCollabs.includes(cNorm)) return false;
        return true;
      };
      const resolvedLabel = [backToLabelName, bandPageName, publisherLdName].find(isDistinctFromArtist) || '';

      // Extract available formats (Vinyl, Cassette, CD, Digital, etc.)
      const formatSet = new Set();
      const normalizeFormatName = (rawFmt) => {
        const s = String(rawFmt || '').trim();
        if (!s) return '';
        if (/\b(t-?shirt|shirt|hoodie|sweater|sweatshirt|tote|bag|poster|print|sticker|hat|cap|beanie|patch|pin|mug|slipmat|ticket)\b/i.test(s)) return '';
        if (/vinyl|lp|\b12"|\b7"|\b10"|test pressing|lathe/i.test(s)) return /lathe/i.test(s) ? 'Lathe Cut' : 'Vinyl';
        if (/cassette|tape/i.test(s)) return 'Cassette';
        if (/compact disc|\bcd\b|cd-r|digipak/i.test(s)) return 'CD';
        if (/minidisc/i.test(s)) return 'MiniDisc';
        if (/usb/i.test(s)) return 'USB';
        if (/vhs/i.test(s)) return 'VHS';
        if (/dvd|blu-?ray/i.test(s)) return 'DVD';
        if (/flexi/i.test(s)) return 'Flexi-disc';
        if (/digital|mp3|flac|wav|aiff|alac/i.test(s)) return 'Digital';
        return s;
      };
      if (Array.isArray(tralbum?.packages)) {
        for (const pkg of tralbum.packages) {
          const fmt = normalizeFormatName(pkg?.type_name || pkg?.title || '');
          if (fmt) formatSet.add(fmt);
        }
      }
      const merchMatches = html.matchAll(/<span[^>]*class="[^"]*merchtype[^"]*"[^>]*>([\s\S]*?)<\/span>/gi);
      for (const m of merchMatches) {
        const fmt = normalizeFormatName(decodeEntities(m[1].replace(/<[^>]+>/g, '')));
        if (fmt) formatSet.add(fmt);
      }
      formatSet.add('Digital');
      const formats = Array.from(formatSet);

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
            releaseDate: formattedReleaseDate,
            location: bandLocation,
            formats,
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
            const rawLdLabel = ld.publisher?.name || resolvedLabel || '';
            const ldLabel = isDistinctFromArtist(rawLdLabel) ? rawLdLabel : resolvedLabel;
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
                releaseDate: formattedReleaseDate,
                location: bandLocation,
                formats,
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
          releaseDate: formattedReleaseDate,
          location: bandLocation,
          formats,
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
  const page = Math.floor(offset / 20) + 1;
  const requestedFilter = String(body?.filter || '').toLowerCase();

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const cacheKey = `v2_${query.trim().toLowerCase()}_${page}_${requestedFilter || 'all'}`;

  // Check cache
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({ results: cached.results, hasMore: cached.hasMore, nextOffset: cached.nextOffset });
    }
    searchCache.delete(cacheKey);
  }

  const LABEL_NAME_RE = /\b(records|recordings|label|disques|tapes|editions|edizioni|imprint|recs|platten|schallplatten|discos|music|sound|sounds|audio|club|collective|archive|archives|press|publishing|productions|distribution|distro|ltd|inc|gmbh)\b/i;

  const decodeHtml = (str) => String(str || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, dec) => { try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; } })
    .replace(/\s+/g, ' ')
    .trim();

  const upgradeArtwork = (url) => {
    if (!url) return '';
    return String(url)
      .replace(/_\d+\.(jpg|png|gif)$/i, '_10.$1');
  };

  const splitArtistTitleField = (rawTitle, rawArtist, rawLabel = '') => {
    let title = String(rawTitle || '').trim();
    let artistName = String(rawArtist || '').trim();
    let labelName = String(rawLabel || '').trim();
    for (const sep of [' — ', ' – ', ' - ']) {
      const idx = title.indexOf(sep);
      if (idx > 0) {
        const left = title.slice(0, idx).trim();
        const right = title.slice(idx + sep.length).trim();
        const isTrackPos = /^([A-D]\d{1,2}|\d{1,3}|track\s*\d+|part\s*[0-9ivx]+|pt\.?\s*[0-9ivx]+)$/i.test(left);
        const isRightDesc = /^(ep|lp|single|album|ost|vol\.?\s*\d+|pt\.?\s*[0-9ivx]+|part\s*[0-9ivx]+|remaster(?:ed)?.*|live.*|.*(?:remix|rework|dub|mix|edit|version|vip|instrumental|bonus.*))$/i.test(right);
        if (!isTrackPos && !isRightDesc && left && right) {
          if (artistName && left.toLowerCase() !== artistName.toLowerCase()) {
            if (!labelName) labelName = artistName;
            artistName = left;
          } else if (!artistName) {
            artistName = left;
          }
          title = right;
          break;
        }
      }
    }
    return { title, artistName, labelName };
  };

  // 1. Scrape Bandcamp's full-text search page (supports item_type = '', 'a', 't', 'b')
  const scrapeBandcampSearchPage = async (searchQuery, itemType = '', pageNum = 1) => {
    try {
      const typeParam = itemType ? `&item_type=${encodeURIComponent(itemType)}` : '';
      const url = `https://bandcamp.com/search?q=${encodeURIComponent(searchQuery)}${typeParam}&page=${pageNum}`;
      const resPage = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined,
      });
      if (!resPage.ok) return [];
      const html = await resPage.text();
      if (!html) return [];

      const out = [];
      const blocks = html.split(/<li\s+class="searchresult\b[^"]*"[^>]*>/i).slice(1);
      for (const rawBlock of blocks) {
        const block = rawBlock.split(/<\/li>/i)[0] || rawBlock;
        const itemTypeMatch = block.match(/<div\s+class="itemtype"[^>]*>\s*([^<]+?)\s*<\/div>/i);
        const itemTypeLabel = decodeHtml(itemTypeMatch ? itemTypeMatch[1] : '').toUpperCase();

        const headingLinkMatch = block.match(/<div\s+class="heading"[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!headingLinkMatch) continue;
        let rawUrl = decodeHtml(headingLinkMatch[1]).split('?')[0].trim();
        let rawTitle = decodeHtml(headingLinkMatch[2].replace(/<[^>]+>/g, ''));
        if (!rawUrl || !rawTitle) continue;

        let type = 'track';
        if (itemTypeLabel === 'ALBUM' || (!itemTypeLabel && /\/album\//i.test(rawUrl))) {
          type = 'album';
        } else if (itemTypeLabel === 'TRACK' || (!itemTypeLabel && /\/track\//i.test(rawUrl))) {
          type = 'track';
        } else if (itemTypeLabel === 'LABEL') {
          type = 'label';
        } else if (itemTypeLabel === 'ARTIST' || itemTypeLabel === 'BAND') {
          type = LABEL_NAME_RE.test(rawTitle) ? 'label' : 'artist';
        } else if (itemTypeLabel === 'FAN') {
          type = 'fan';
        } else if (itemType === 'a') {
          type = 'album';
        } else if (itemType === 'b') {
          type = LABEL_NAME_RE.test(rawTitle) ? 'label' : 'artist';
        }
        if (type === 'fan') continue;

        const artMatch = block.match(/<div\s+class="art"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
        const artworkUrl = upgradeArtwork(artMatch ? decodeHtml(artMatch[1]) : '');

        const subheadMatch = block.match(/<div\s+class="subhead"[^>]*>([\s\S]*?)<\/div>/i);
        const subheadText = subheadMatch ? decodeHtml(subheadMatch[1].replace(/<[^>]+>/g, '')) : '';

        let artistName = '';
        let albumName = '';
        let location = '';

        if (type === 'track') {
          // Track subhead format: "from [Album Name] by [Artist Name]" or "by [Artist Name]"
          const fromByMatch = subheadText.match(/^from\s+([\s\S]+?)\s+by\s+([\s\S]+)$/i);
          if (fromByMatch) {
            albumName = fromByMatch[1].trim();
            artistName = fromByMatch[2].trim();
          } else {
            const byMatch = subheadText.match(/(?:^|\s)by\s+([\s\S]+)$/i);
            if (byMatch) artistName = byMatch[1].trim();
          }
        } else if (type === 'album') {
          const byMatch = subheadText.match(/^by\s+([\s\S]+)$/i);
          if (byMatch) artistName = byMatch[1].trim();
          albumName = rawTitle;
        } else if (type === 'artist' || type === 'label') {
          artistName = rawTitle;
          location = subheadText;
        }

        const genreMatch = block.match(/<div\s+class="genre"[^>]*>\s*(?:genre:\s*)?([^<]+?)\s*<\/div>/i);
        let genre = genreMatch ? decodeHtml(genreMatch[1]) : '';
        if (!genre) {
          const tagsMatch = block.match(/<div\s+class="tags"[^>]*>\s*tags:\s*([\s\S]*?)<\/div>/i);
          if (tagsMatch) {
            const firstTag = decodeHtml(tagsMatch[1].replace(/<[^>]+>/g, '')).split(',')[0]?.trim();
            if (firstTag && firstTag.length <= 32) genre = firstTag;
          }
        }

        const releasedMatch = block.match(/<div\s+class="released"[^>]*>\s*(?:released\s*)?([^<]+?)\s*<\/div>/i);
        const released = releasedMatch ? decodeHtml(releasedMatch[1]) : '';
        const yearMatch = released.match(/\b((?:19|20)\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

        let originUrl = '';
        try { originUrl = new URL(rawUrl).origin; } catch {}

        let labelName = '';
        if (type === 'track' || type === 'album') {
          const split = splitArtistTitleField(rawTitle, artistName, '');
          rawTitle = split.title || rawTitle;
          artistName = split.artistName || artistName;
          labelName = split.labelName || '';
          if (type === 'album') albumName = rawTitle;
        }

        out.push({
          trackId: rawUrl,
          type,
          title: rawTitle,
          artistName: artistName || rawTitle,
          label: labelName || (type === 'label' ? rawTitle : ''),
          labelName: labelName || (type === 'label' ? rawTitle : ''),
          labelUrl: originUrl,
          artworkUrl,
          trackUrl: rawUrl,
          albumUrl: type === 'album' ? rawUrl : '',
          albumName: albumName || (type === 'album' ? rawTitle : ''),
          albumId: null,
          location,
          genre,
          released,
          year,
        });
      }
      return out;
    } catch (e) {
      return [];
    }
  };

  // 2. Query Bandcamp autocomplete_elastic for a single filter ('a', 't', 'b')
  const fetchAutocompleteByFilter = async (searchQuery, filterChar) => {
    try {
      const bcRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          search_text: searchQuery,
          search_filter: filterChar,
          full_page: true,
          fan_id: 0,
        }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(3200) : undefined,
      });
      if (!bcRes.ok) return [];
      const data = await bcRes.json();
      return data?.auto?.results || [];
    } catch {
      return [];
    }
  };

  // 3. Scrape a matching Bandcamp band/label's /music grid for its albums
  const scrapeBandDiscography = async (bandOriginUrl, fallbackBandName = '', fallbackBandArt = '') => {
    try {
      if (!bandOriginUrl || !/^https?:\/\/[^/]+\.bandcamp\.com$/i.test(bandOriginUrl)) return [];
      const musicUrl = `${bandOriginUrl.replace(/\/$/, '')}/music`;
      const r = await fetch(musicUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(2800) : undefined,
      });
      if (!r.ok) return [];
      const html = await r.text();
      if (!html) return [];

      const pageBandName = decodeHtml(
        ((html.match(/<p[^>]*id="band-name-location"[^>]*>[\s\S]*?<span[^>]*class="title"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/<[^>]+>/g, '')
      ) || fallbackBandName;
      const pageLocation = decodeHtml(
        ((html.match(/<p[^>]*id="band-name-location"[^>]*>[\s\S]*?<span[^>]*class="location"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/<[^>]+>/g, '')
      );

      const albums = [];
      const seenHref = new Set();

      // 3a. Parse data-client-items JSON if present on /music grid
      const clientItemsMatch = html.match(/data-client-items="([^"]+)"/i) || html.match(/data-client-items='([^']+)'/i);
      if (clientItemsMatch) {
        try {
          const decodedJson = decodeHtml(clientItemsMatch[1]);
          const parsedItems = JSON.parse(decodedJson);
          if (Array.isArray(parsedItems)) {
            for (const ci of parsedItems) {
              const pageUrl = ci.page_url || '';
              if (!pageUrl || (!/\/album\//i.test(pageUrl) && ci.type !== 'album')) continue;
              let fullUrl = '';
              try { fullUrl = new URL(pageUrl, bandOriginUrl).href.split('?')[0]; } catch { continue; }
              if (!fullUrl || seenHref.has(fullUrl)) continue;
              seenHref.add(fullUrl);

              const rawTitle = String(ci.title || '').trim();
              const rawArtist = String(ci.artist || pageBandName || '').trim();
              const artUrl = ci.art_id ? `https://f4.bcbits.com/img/a${ci.art_id}_10.jpg` : fallbackBandArt;
              const split = splitArtistTitleField(rawTitle, rawArtist, pageBandName);
              const labelVal = split.labelName || (pageBandName && pageBandName.toLowerCase() !== (split.artistName || rawArtist).toLowerCase() ? pageBandName : '');

              albums.push({
                trackId: ci.id || fullUrl,
                type: 'album',
                title: split.title || rawTitle,
                artistName: split.artistName || rawArtist || pageBandName,
                label: labelVal,
                labelName: labelVal,
                labelUrl: bandOriginUrl,
                artworkUrl: artUrl,
                trackUrl: fullUrl,
                albumUrl: fullUrl,
                albumName: split.title || rawTitle,
                albumId: ci.id || null,
                location: pageLocation || '',
                genre: '',
              });
            }
          }
        } catch {}
      }

      // 3b. Parse <li class="music-grid-item ..."> blocks in #music-grid
      const liRegex = /<li[^>]*class="[^"]*music-grid-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liRegex.exec(html)) !== null) {
        const block = liMatch[1];
        const hrefMatch = block.match(/<a[^>]+href="([^"]*\/(?:album|track)\/[^"?#]+)"/i);
        if (!hrefMatch) continue;
        const rawHref = decodeHtml(hrefMatch[1]);
        if (!/\/album\//i.test(rawHref)) continue;
        let fullUrl = '';
        try { fullUrl = new URL(rawHref, bandOriginUrl).href.split('?')[0]; } catch { continue; }
        if (!fullUrl || seenHref.has(fullUrl)) continue;
        seenHref.add(fullUrl);

        const titleBlockMatch = block.match(/<p[^>]*class="title"[^>]*>([\s\S]*?)<\/p>/i);
        let rawTitle = '';
        let artistOverride = '';
        if (titleBlockMatch) {
          const inner = titleBlockMatch[1];
          const artistSpan = inner.match(/<span[^>]*class="artist-override"[^>]*>([\s\S]*?)<\/span>/i);
          if (artistSpan) {
            artistOverride = decodeHtml(artistSpan[1].replace(/<[^>]+>/g, ''));
            rawTitle = decodeHtml(inner.replace(artistSpan[0], '').replace(/<[^>]+>/g, ''));
          } else {
            rawTitle = decodeHtml(inner.replace(/<[^>]+>/g, ''));
          }
        }
        if (!rawTitle) continue;

        const imgMatch = block.match(/<img[^>]+(?:data-original|src)="([^"]+)"/i);
        const artUrl = upgradeArtwork(imgMatch ? decodeHtml(imgMatch[1]) : '') || fallbackBandArt;

        const split = splitArtistTitleField(rawTitle, artistOverride || pageBandName, pageBandName);
        const finalArtist = split.artistName || artistOverride || pageBandName;
        const labelVal = split.labelName || (pageBandName && pageBandName.toLowerCase() !== finalArtist.toLowerCase() ? pageBandName : '');

        albums.push({
          trackId: fullUrl,
          type: 'album',
          title: split.title || rawTitle,
          artistName: finalArtist,
          label: labelVal,
          labelName: labelVal,
          labelUrl: bandOriginUrl,
          artworkUrl: artUrl,
          trackUrl: fullUrl,
          albumUrl: fullUrl,
          albumName: split.title || rawTitle,
          albumId: null,
          location: pageLocation || '',
          genre: '',
        });
      }

      return albums.slice(0, 24);
    } catch {
      return [];
    }
  };

  try {
    // Run full-text HTML searches + per-type elastic autocomplete in parallel
    const [
      scrapedAlbums,
      scrapedTracks,
      scrapedBands,
      scrapedGeneral,
      autoAlbums,
      autoTracks,
      autoBands,
    ] = await Promise.all([
      scrapeBandcampSearchPage(query, 'a', page),
      scrapeBandcampSearchPage(query, 't', page),
      scrapeBandcampSearchPage(query, 'b', page),
      scrapeBandcampSearchPage(query, '', page),
      page === 1 ? fetchAutocompleteByFilter(query, 'a') : Promise.resolve([]),
      page === 1 ? fetchAutocompleteByFilter(query, 't') : Promise.resolve([]),
      page === 1 ? fetchAutocompleteByFilter(query, 'b') : Promise.resolve([]),
    ]);

    let autoItems = [...autoAlbums, ...autoTracks, ...autoBands];
    if (
      autoItems.length === 0 &&
      scrapedAlbums.length === 0 &&
      scrapedTracks.length === 0 &&
      scrapedBands.length === 0 &&
      scrapedGeneral.length === 0
    ) {
      autoItems = await fallbackFuzzySearch(query);
    }

    const mappedAutoResults = autoItems
      .filter(item => item && item.type !== 'f')
      .map(item => {
        let artworkUrl = item.img || '';
        if (item.art_id) {
          artworkUrl = `https://f4.bcbits.com/img/a${item.art_id}_10.jpg`;
        } else if (item.img_id) {
          artworkUrl = `https://f4.bcbits.com/img/00${item.img_id}_23.jpg`;
        }

        const looksLikeLabel = item.type === 'b' && (item.is_label || LABEL_NAME_RE.test(item.name || ''));
        const type = item.type === 'b' ? (looksLikeLabel ? 'label' : 'artist') : item.type === 'a' ? 'album' : 'track';

        let rawTitle = String(item.name || '').trim();
        let artistName = String(item.band_name || (type === 'artist' || type === 'label' ? item.name : '')).trim();
        let labelName = '';
        if (type === 'track' || type === 'album') {
          const split = splitArtistTitleField(rawTitle, artistName, '');
          rawTitle = split.title || rawTitle;
          artistName = split.artistName || artistName;
          labelName = split.labelName || '';
        }

        const itemUrl = (item.item_url_path || item.item_url_root || item.url || '').split('?')[0];
        let originUrl = '';
        try { originUrl = new URL(itemUrl).origin; } catch {}
        const resolvedLabel = labelName || (type === 'label' ? rawTitle : (item.band_name && item.band_name.toLowerCase() !== artistName.toLowerCase() ? item.band_name : ''));

        return {
          trackId: item.id || itemUrl,
          type,
          title: rawTitle,
          artistName: artistName || rawTitle,
          label: resolvedLabel,
          labelName: resolvedLabel,
          labelUrl: originUrl,
          artworkUrl,
          trackUrl: itemUrl,
          albumUrl: type === 'album' ? itemUrl : '',
          albumName: item.album_name || (type === 'album' ? rawTitle : ''),
          albumId: item.album_id || null,
          location: item.location || '',
          genre: item.genre_name || '',
        };
      });

    // Combine all direct results
    let combined = [
      ...scrapedGeneral,
      ...scrapedAlbums,
      ...scrapedTracks,
      ...scrapedBands,
      ...mappedAutoResults,
    ];

    // If page === 1, expand top matching band/label subdomains to fetch their /music album grids!
    // This ensures that searching for an artist or label name (or artist + album) populates all of their Bandcamp albums even if Bandcamp's search index only returned the band page or tracks.
    if (page === 1) {
      const qNorm = query.toLowerCase().replace(/[^a-z0-9]/g, '');
      const candidateOrigins = [];
      const seenOrigins = new Set();

      const addOriginCandidate = (origin, name, art, priority) => {
        if (!origin || !/^https?:\/\/[^/]+\.bandcamp\.com$/i.test(origin)) return;
        const cleanOrigin = origin.toLowerCase().replace(/\/$/, '');
        if (seenOrigins.has(cleanOrigin)) return;
        seenOrigins.add(cleanOrigin);
        candidateOrigins.push({ origin: cleanOrigin, name: name || '', art: art || '', priority });
      };

      for (const item of combined) {
        if (item.type === 'artist' || item.type === 'label') {
          const nameNorm = String(item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const isStrongMatch = nameNorm && (nameNorm === qNorm || nameNorm.includes(qNorm) || qNorm.includes(nameNorm));
          addOriginCandidate(item.labelUrl || item.trackUrl, item.title, item.artworkUrl, isStrongMatch ? 1 : 3);
        } else if (item.labelUrl) {
          const artNorm = String(item.artistName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const isArtistMatch = artNorm && (artNorm === qNorm || artNorm.includes(qNorm) || qNorm.includes(artNorm));
          if (isArtistMatch) {
            addOriginCandidate(item.labelUrl, item.artistName, item.artworkUrl, 2);
          }
        }
      }

      candidateOrigins.sort((a, b) => a.priority - b.priority);
      const topOrigins = candidateOrigins.slice(0, 2);
      if (topOrigins.length > 0) {
        const discographyLists = await Promise.all(
          topOrigins.map(c => scrapeBandDiscography(c.origin, c.name, c.art))
        );
        for (const discoAlbums of discographyLists) {
          combined.push(...discoAlbums);
        }
      }
    }

    // Synthesize missing Albums, Artists, and Labels from discovered tracks & albums so all 4 category filters (Titles, Albums, Artists, Labels) are rich and complete
    const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const existingAlbumKeys = new Set();
    const existingArtistKeys = new Set();
    const existingLabelKeys = new Set();

    for (const r of combined) {
      if (r.type === 'album') {
        existingAlbumKeys.add(`${normKey(r.title)}|${normKey(r.artistName)}`);
        if (r.trackUrl) existingAlbumKeys.add(r.trackUrl.toLowerCase());
      } else if (r.type === 'artist') {
        existingArtistKeys.add(normKey(r.title));
      } else if (r.type === 'label') {
        existingLabelKeys.add(normKey(r.title));
      }
    }

    const synthesized = [];
    for (const r of combined) {
      // 1) Synthesize parent album from tracks that have an albumName
      if (r.type === 'track' && r.albumName) {
        const albTitle = String(r.albumName).trim();
        const albKey = `${normKey(albTitle)}|${normKey(r.artistName)}`;
        const targetUrl = r.albumUrl || r.trackUrl || '';
        if (albTitle && !existingAlbumKeys.has(albKey) && (!targetUrl || !existingAlbumKeys.has(targetUrl.toLowerCase()))) {
          existingAlbumKeys.add(albKey);
          if (targetUrl) existingAlbumKeys.add(targetUrl.toLowerCase());
          synthesized.push({
            trackId: r.albumId ? `alb-${r.albumId}` : `alb-${r.trackId}`,
            type: 'album',
            title: albTitle,
            artistName: r.artistName || '',
            label: r.label || r.labelName || '',
            labelName: r.labelName || r.label || '',
            labelUrl: r.labelUrl || '',
            artworkUrl: r.artworkUrl || '',
            trackUrl: targetUrl,
            albumUrl: targetUrl,
            albumName: albTitle,
            albumId: r.albumId || null,
            location: r.location || '',
            genre: r.genre || '',
            released: r.released || '',
            year: r.year || null,
          });
        }
      }

      // 2) Synthesize Artist from album/track artistName if not yet in Artists
      if ((r.type === 'album' || r.type === 'track') && r.artistName) {
        const artName = String(r.artistName).trim();
        const artKey = normKey(artName);
        if (artKey && artKey.length >= 2 && !/^various(\s+artists)?$/i.test(artName) && !existingArtistKeys.has(artKey)) {
          existingArtistKeys.add(artKey);
          synthesized.push({
            trackId: `art-${artKey}`,
            type: 'artist',
            title: artName,
            artistName: artName,
            label: '',
            labelName: '',
            labelUrl: r.labelUrl || '',
            artworkUrl: r.artworkUrl || '',
            trackUrl: r.labelUrl || r.trackUrl || '',
            albumUrl: '',
            albumName: '',
            albumId: null,
            location: r.location || '',
            genre: r.genre || '',
          });
        }
      }

      // 3) Synthesize Label from album/track labelName (or subdomain band when distinct from artist)
      const candidateLabel = String(r.label || r.labelName || '').trim();
      if ((r.type === 'album' || r.type === 'track') && candidateLabel) {
        const lblKey = normKey(candidateLabel);
        if (lblKey && lblKey.length >= 2 && !existingLabelKeys.has(lblKey)) {
          existingLabelKeys.add(lblKey);
          synthesized.push({
            trackId: `lbl-${lblKey}`,
            type: 'label',
            title: candidateLabel,
            artistName: candidateLabel,
            label: candidateLabel,
            labelName: candidateLabel,
            labelUrl: r.labelUrl || '',
            artworkUrl: r.artworkUrl || '',
            trackUrl: r.labelUrl || r.trackUrl || '',
            albumUrl: '',
            albumName: '',
            albumId: null,
            location: r.location || '',
            genre: r.genre || '',
          });
        }
      }
    }

    combined.push(...synthesized);

    // Deduplicate while preserving rich metadata
    const dedupedMap = new Map();
    for (const item of combined) {
      if (!item || !item.title) continue;
      const tNorm = normKey(item.title);
      const aNorm = normKey(item.artistName);
      const key = (item.type === 'artist' || item.type === 'label')
        ? `${item.type}|${tNorm}`
        : `${item.type}|${tNorm}|${aNorm}`;
      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, item);
      } else {
        const prev = dedupedMap.get(key);
        if (!prev.artworkUrl && item.artworkUrl) prev.artworkUrl = item.artworkUrl;
        if (!prev.albumName && item.albumName) prev.albumName = item.albumName;
        if (!prev.label && item.label) { prev.label = item.label; prev.labelName = item.label; }
        if (!prev.genre && item.genre) prev.genre = item.genre;
        if (!prev.location && item.location) prev.location = item.location;
        if (!prev.year && item.year) prev.year = item.year;
        if (item.type === 'album' && /\/track\//i.test(prev.trackUrl || '') && /\/album\//i.test(item.trackUrl || '')) {
          prev.trackUrl = item.trackUrl;
          prev.albumUrl = item.trackUrl;
        }
      }
    }

    const results = Array.from(dedupedMap.values());
    const hasMore = scrapedAlbums.length >= 10 || scrapedTracks.length >= 10 || scrapedGeneral.length >= 10;
    const nextOffset = offset + 20;

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
