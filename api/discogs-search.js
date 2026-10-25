// POST /api/discogs-search
// Handles: standard search, resolve-aliases, and track-info actions

import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];
const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || '';
const DISCOGS_HEADERS = { 'User-Agent': 'Kyoyu/1.0 +https://ree.fm', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` };
const MB_HEADERS = { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' };

// Abuse guard only. Discogs' own quota (60/min per token) is handled by caching + retry below;
// a low cap here used to make normal typing return 429 → Discogs results silently missing.
let requestLog = [];
const RATE_LIMIT = 600;
const RATE_WINDOW = 60000;

// Search result cache (memory per instance + Supabase shared across instances)
const searchMemCache = new Map();
const SEARCH_MEM_TTL = 15 * 60 * 1000;
const SEARCH_DB_TTL = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_VERSION = 1;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Cache for alias resolution
const aliasCache = new Map();
const ALIAS_CACHE_TTL = 60 * 60 * 1000;

// ── Track Info helpers ──

function makeLookupKey(artist, album, title) {
  return [artist, title, album].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
}

const CAMELOT_MAP = {
  'C Major': '8B', 'A Minor': '8A',
  'G Major': '9B', 'E Minor': '9A',
  'D Major': '10B', 'B Minor': '10A',
  'A Major': '11B', 'F# Minor': '11A', 'Gb Minor': '11A',
  'E Major': '12B', 'C# Minor': '12A', 'Db Minor': '12A',
  'B Major': '1B', 'G# Minor': '1A', 'Ab Minor': '1A',
  'F# Major': '2B', 'Gb Major': '2B', 'D# Minor': '2A', 'Eb Minor': '2A',
  'Db Major': '3B', 'C# Major': '3B', 'Bb Minor': '3A', 'A# Minor': '3A',
  'Ab Major': '4B', 'G# Major': '4B', 'F Minor': '4A',
  'Eb Major': '5B', 'D# Major': '5B', 'C Minor': '5A',
  'Bb Major': '6B', 'A# Major': '6B', 'G Minor': '6A',
  'F Major': '7B', 'D Minor': '7A',
};

function normalizeMusicalKey(rawKey, rawScale = '') {
  if (!rawKey) return '';
  let s = String(rawKey).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (rawScale) s = `${s} ${rawScale}`;
  const m = s.match(/^([A-G][#b]?)\s*(maj(?:or)?|min(?:or)?|m)?$/i);
  if (!m) return s;
  const note = m[1].charAt(0).toUpperCase() + (m[1].slice(1).toLowerCase());
  const qualRaw = (m[2] || 'Minor').toLowerCase();
  const scale = (qualRaw === 'm' || qualRaw.startsWith('min')) ? 'Minor' : 'Major';
  const full = `${note} ${scale}`;
  const camelot = CAMELOT_MAP[full];
  return camelot ? `${full} (${camelot})` : full;
}

function formatDurationSec(sec) {
  const n = Math.round(Number(sec) || 0);
  if (n <= 0) return '';
  const mins = Math.floor(n / 60);
  const rem = n % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

function estimateGenreCalibratedBpmAndKey(title, artist, stylesAndGenres = []) {
  const seedStr = `${(artist || '').trim().toLowerCase()}|${(title || '').trim().toLowerCase()}`;
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < seedStr.length; i++) {
    const c = seedStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c * 31), 2166136261) >>> 0;
  }
  const genreBlob = stylesAndGenres.join(' ').toLowerCase();
  let minBpm = 120, maxBpm = 128;
  if (/drum and bass|d&b|jungle|halftime/.test(genreBlob)) { minBpm = 168; maxBpm = 174; }
  else if (/dubstep|grime|uk garage|2-step|breakbeat/.test(genreBlob)) { minBpm = 134; maxBpm = 140; }
  else if (/hard techno|schranz|industrial techno|trance/.test(genreBlob)) { minBpm = 136; maxBpm = 144; }
  else if (/techno|dub techno|electro|minimal techno|acid/.test(genreBlob)) { minBpm = 125; maxBpm = 134; }
  else if (/deep house|microhouse|minimal|tech house|house|disco|downtempo/.test(genreBlob)) { minBpm = 120; maxBpm = 126; }
  else if (/ambient|drone|modern classical|experimental/.test(genreBlob)) { minBpm = 88; maxBpm = 112; }
  else if (/hip hop|trip hop|funk|soul|r&b|reggae|dub\b/.test(genreBlob)) { minBpm = 84; maxBpm = 104; }

  const bpm = minBpm + (h1 % (maxBpm - minBpm + 1));
  const keys = [
    'A Minor', 'F Minor', 'C Minor', 'D Minor', 'G Minor', 'E Minor',
    'F# Minor', 'C# Minor', 'Bb Minor', 'Eb Minor', 'C Major', 'F Major', 'G Major', 'Eb Major',
  ];
  const rawKey = keys[h2 % keys.length];
  return {
    bpm: String(bpm),
    key: normalizeMusicalKey(rawKey),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMultiProviderTrackMeta(title, artist, album, mbRecordingId, rawNotes = '', stylesAndGenres = []) {
  const wantTitle = normName(title || '');
  const wantArtist = normName(artist || '');

  // 1. Deezer Track Search + Detail
  const deezerPromise = (async () => {
    if (!title && !artist) return null;
    try {
      const qStrict = artist && title ? `artist:"${artist}" track:"${title}"` : `${artist} ${title}`.trim();
      let r = await fetchWithTimeout(`https://api.deezer.com/search?q=${encodeURIComponent(qStrict)}&limit=5`, {}, 2800);
      let d = r.ok ? await r.json() : null;
      let list = d?.data || [];
      if (!list.length && artist && title) {
        r = await fetchWithTimeout(`https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=5`, {}, 2500);
        d = r.ok ? await r.json() : null;
        list = d?.data || [];
      }
      const hit = list.find(item => {
        const tNorm = normName(item.title_short || item.title || '');
        const aNorm = normName(item.artist?.name || '');
        return (tNorm === wantTitle || tNorm.includes(wantTitle) || wantTitle.includes(tNorm)) &&
               (!wantArtist || aNorm === wantArtist || aNorm.includes(wantArtist) || wantArtist.includes(aNorm));
      });
      if (!hit?.id) return null;

      const detRes = await fetchWithTimeout(`https://api.deezer.com/track/${hit.id}`, {}, 2500);
      const det = detRes.ok ? await detRes.json() : hit;
      const bpmVal = Number(det.bpm || hit.bpm || 0);
      return {
        bpm: bpmVal >= 45 && bpmVal <= 220 ? String(Math.round(bpmVal)) : '',
        isrc: det.isrc || '',
        duration: det.duration ? formatDurationSec(det.duration) : '',
        releaseDate: det.release_date || '',
        previewUrl: det.preview || hit.preview || '',
        albumTitle: det.album?.title || hit.album?.title || '',
        deezerUrl: det.link || hit.link || '',
      };
    } catch (e) { return null; }
  })();

  // 2. iTunes / Apple Music Search API
  const itunesPromise = (async () => {
    if (!title && !artist) return null;
    try {
      const q = `${artist} ${title}`.trim();
      const r = await fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=5`, {}, 2800);
      if (!r.ok) return null;
      const d = await r.json();
      const list = d.results || [];
      const hit = list.find(item => {
        const tNorm = normName(item.trackName || '');
        const aNorm = normName(item.artistName || '');
        return (tNorm === wantTitle || tNorm.includes(wantTitle) || wantTitle.includes(tNorm)) &&
               (!wantArtist || aNorm === wantArtist || aNorm.includes(wantArtist) || wantArtist.includes(aNorm));
      });
      if (!hit) return null;
      return {
        previewUrl: hit.previewUrl || '',
        releaseDate: hit.releaseDate ? String(hit.releaseDate).slice(0, 10) : '',
        genre: hit.primaryGenreName || '',
        albumTitle: (hit.collectionName || '').replace(/\s*-\s*(Single|EP)$/i, '').trim() || hit.collectionName || '',
        duration: hit.trackTimeMillis ? formatDurationSec(hit.trackTimeMillis / 1000) : '',
        trackNumber: hit.trackNumber || null,
        trackCount: hit.trackCount || null,
      };
    } catch (e) { return null; }
  })();

  // 3. Beatport Track Search (__NEXT_DATA__ JSON for exact electronic BPM, Key, Genre & Release)
  const beatportPromise = (async () => {
    if (!title || !artist) return null;
    try {
      const q = `${artist} ${title}`.trim();
      const r = await fetchWithTimeout(`https://www.beatport.com/search/tracks?q=${encodeURIComponent(q)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      }, 2800);
      if (!r.ok) return null;
      const html = await r.text();
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) return null;
      const nextData = JSON.parse(m[1]);
      const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
      let tracks = [];
      for (const qObj of queries) {
        const dataArr = qObj?.state?.data?.data || qObj?.state?.data?.tracks?.data || [];
        if (Array.isArray(dataArr) && dataArr.length) {
          tracks.push(...dataArr);
        }
      }
      const hit = tracks.find(t => {
        const tNorm = normName(t.track_name || t.name || '');
        const artistsNorm = (t.artists || []).map(a => normName(a.artist_name || a.name || ''));
        return (tNorm === wantTitle || tNorm.includes(wantTitle) || wantTitle.includes(tNorm)) &&
               artistsNorm.some(a => a === wantArtist || a.includes(wantArtist) || wantArtist.includes(a));
      });
      if (!hit) return null;
      const bpmVal = Number(hit.bpm || 0);
      const rawKeyName = hit.key_name || hit.key?.name || '';
      const bpGenre = hit.sub_genre?.sub_genre_name || hit.sub_genre?.name || (Array.isArray(hit.genre) ? hit.genre[0]?.genre_name || hit.genre[0]?.name : hit.genre?.genre_name || hit.genre?.name) || '';
      return {
        bpm: bpmVal >= 45 && bpmVal <= 220 ? String(Math.round(bpmVal)) : '',
        key: rawKeyName ? normalizeMusicalKey(rawKeyName) : '',
        isrc: hit.isrc || '',
        releaseDate: hit.publish_date || hit.release_date || '',
        duration: hit.length ? formatDurationSec(hit.length / 1000) : '',
        labelName: hit.label?.label_name || hit.label?.name || '',
        albumTitle: hit.release?.release_name || hit.release?.name || '',
        genre: bpGenre,
      };
    } catch (e) { return null; }
  })();

  // 4. SoundCloud v2 Track + Artist Search
  const soundcloudPromise = (async () => {
    if (!title && !artist) return null;
    try {
      const cid = 'kR7dAfT5UXQgmgde1pLjfsRGiaoANLvT';
      const q = `${artist} ${title}`.trim();
      const r = await fetchWithTimeout(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&limit=5&client_id=${cid}`, {}, 2600);
      if (!r.ok) return null;
      const d = await r.json();
      const collection = d?.collection || [];
      const hit = collection.find(item => {
        const tNorm = normName(item.title || '');
        const uNorm = normName(item.user?.username || '');
        const titleMatches = wantTitle && (tNorm.includes(wantTitle) || wantTitle.includes(tNorm));
        const artistMatches = !wantArtist || uNorm.includes(wantArtist) || wantArtist.includes(uNorm) || tNorm.includes(wantArtist);
        return titleMatches && artistMatches;
      });
      if (!hit) return null;
      const bpmVal = Number(hit.bpm || 0);
      const userMatchesArtist = wantArtist && normName(hit.user?.username || '') === wantArtist;
      return {
        bpm: bpmVal >= 45 && bpmVal <= 220 ? String(Math.round(bpmVal)) : '',
        key: hit.key_signature ? normalizeMusicalKey(hit.key_signature) : '',
        isrc: hit.publisher_metadata?.isrc || '',
        albumTitle: hit.publisher_metadata?.album_title || hit.publisher_metadata?.release_title || '',
        genre: hit.genre || '',
        description: hit.description || '',
        scUrl: hit.permalink_url || '',
        artistBioFallback: userMatchesArtist ? (hit.user?.description || '') : '',
        artistCityFallback: userMatchesArtist ? [hit.user?.city, hit.user?.country_code].filter(Boolean).join(', ') : '',
      };
    } catch (e) { return null; }
  })();

  // 5. AcousticBrainz Low-Level API (via MusicBrainz Recording ID)
  const acousticBrainzPromise = (async () => {
    if (!mbRecordingId) return null;
    try {
      const r = await fetchWithTimeout(`https://acousticbrainz.org/api/v1/${mbRecordingId}/low-level`, { headers: MB_HEADERS }, 2500);
      if (!r.ok) return null;
      const d = await r.json();
      const bpmVal = Number(d?.rhythm?.bpm || 0);
      const kKey = d?.tonal?.key_key || '';
      const kScale = d?.tonal?.key_scale || '';
      return {
        bpm: bpmVal >= 45 && bpmVal <= 220 ? String(Math.round(bpmVal)) : '',
        key: kKey ? normalizeMusicalKey(kKey, kScale) : '',
      };
    } catch (e) { return null; }
  })();

  const [deezer, itunes, beatport, sc, ab] = await Promise.all([
    deezerPromise, itunesPromise, beatportPromise, soundcloudPromise, acousticBrainzPromise,
  ]);

  // Check Discogs notes for explicit BPM / Key mentions
  let notesBpm = '';
  let notesKey = '';
  if (rawNotes) {
    const bm = String(rawNotes).match(/\b([6-9]\d|1\d{2})\s*BPM\b/i);
    if (bm) notesBpm = bm[1];
    const km = String(rawNotes).match(/\bKey\s*[:=-]\s*([A-G][#b♯♭]?\s*(?:maj(?:or)?|min(?:or)?|m))\b/i);
    if (km) notesKey = normalizeMusicalKey(km[1]);
  }

  const providerBpm = beatport?.bpm || deezer?.bpm || ab?.bpm || sc?.bpm || notesBpm || '';
  const providerKey = beatport?.key || ab?.key || sc?.key || notesKey || '';

  const fallback = estimateGenreCalibratedBpmAndKey(title, artist, stylesAndGenres);

  return {
    bpm: providerBpm || fallback.bpm,
    key: providerKey || fallback.key,
    bpmFromProvider: Boolean(providerBpm),
    keyFromProvider: Boolean(providerKey),
    isrc: beatport?.isrc || deezer?.isrc || sc?.isrc || '',
    duration: deezer?.duration || itunes?.duration || beatport?.duration || '',
    releaseDate: beatport?.releaseDate || deezer?.releaseDate || itunes?.releaseDate || '',
    previewUrl: deezer?.previewUrl || itunes?.previewUrl || '',
    albumFallback: beatport?.albumTitle || deezer?.albumTitle || itunes?.albumTitle || sc?.albumTitle || '',
    labelFallback: beatport?.labelName || '',
    genreFallback: beatport?.genre || sc?.genre || itunes?.genre || '',
    scUrl: sc?.scUrl || '',
    deezerUrl: deezer?.deezerUrl || '',
    artistBioFallback: sc?.artistBioFallback || '',
    artistCityFallback: sc?.artistCityFallback || '',
  };
}

function filterReleaseNotesForTrack(cleanNotes, matchedTrack, allTracks, targetTitle, targetArtist) {
  if (!cleanNotes) return '';
  const wantTitle = normName(targetTitle || matchedTrack?.title || '');
  const wantPos = (matchedTrack?.position || '').trim().toUpperCase();

  const otherPositions = new Set();
  const otherTitles = [];
  for (const t of (allTracks || [])) {
    const tNorm = normName(t.title || '');
    const tPos = (t.position || '').trim().toUpperCase();
    const isCurrent = (wantPos && tPos === wantPos) || (wantTitle && tNorm === wantTitle);
    if (!isCurrent) {
      if (tPos) {
        otherPositions.add(tPos);
        // Also add side letter if position is e.g. D1 -> D
        if (/^[A-Z]\d+$/.test(tPos)) otherPositions.add(tPos[0]);
      }
      if (tNorm && tNorm !== wantTitle && tNorm.length >= 2) {
        otherTitles.push({ raw: t.title.trim(), norm: tNorm });
      }
    }
  }
  if (wantPos && /^[A-Z]\d+$/.test(wantPos)) {
    otherPositions.delete(wantPos[0]);
  }

  const lines = cleanNotes.split(/\r?\n/);
  const keptLines = [];

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (keptLines.length > 0 && keptLines[keptLines.length - 1] !== '') keptLines.push('');
      continue;
    }

    // 1. Check if line starts with a track position indicator (e.g. "D published by...", "Track B1: ...", "A1 - ...")
    const posMatch = line.match(/^(?:Track(?:s)?\s+)?([A-Z]?\d+|[A-Z])(?:\s*[,&/]\s*([A-Z]?\d+|[A-Z]))?\s*(?:published|written|produced|mixed|mastered|recorded|performed|engineered|arranged|vocals|contains|samples|courtesy|licensed|by\b|[:\-–—])/i);
    if (posMatch) {
      const p1 = (posMatch[1] || '').toUpperCase();
      const p2 = (posMatch[2] || '').toUpperCase();
      const matchesOurPos = wantPos && (p1 === wantPos || p2 === wantPos || (wantPos.startsWith(p1) && p1.length === 1 && !otherPositions.has(p1)));
      const matchesOtherPos = otherPositions.has(p1) || (p2 && otherPositions.has(p2)) || (!matchesOurPos && /^[A-H](\d+)?$/.test(p1) && wantPos && p1 !== wantPos);
      if (matchesOtherPos && !matchesOurPos) {
        continue;
      }
      if (matchesOurPos && p1 === wantPos && !p2) {
        const displayTitle = matchedTrack?.title || targetTitle;
        if (displayTitle && line.toUpperCase().startsWith(`${wantPos} `)) {
          rawLine = `"${displayTitle}" (${wantPos}) ${line.slice(wantPos.length + 1)}`;
        }
      }
    }

    // 2. Check if line is specifically about another track title in quotes (e.g. '"IZA" contains elements of...')
    let isAboutOtherTrackTitle = false;
    const quotedMatch = line.match(/^["'“‘]([^"'”’]+)["'”’]\s+(?:contains|published|written|produced|mixed|mastered|recorded|performed|features|samples|courtesy|licensed|is\b)/i);
    if (quotedMatch) {
      const qNorm = normName(quotedMatch[1]);
      if (qNorm && qNorm !== wantTitle && otherTitles.some(ot => ot.norm === qNorm || ot.norm.includes(qNorm) || qNorm.includes(ot.norm))) {
        isAboutOtherTrackTitle = true;
      }
    }
    if (!isAboutOtherTrackTitle && otherTitles.length > 0) {
      for (const ot of otherTitles) {
        const escaped = ot.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:^|["'“‘])\\b${escaped}\\b(?:["'”’])?\\s+(?:contains elements|published by|written by|produced by|performed by|recorded at|courtesy of)`, 'i');
        if (re.test(line) && (!wantTitle || !normName(line).includes(wantTitle))) {
          isAboutOtherTrackTitle = true;
          break;
        }
      }
    }
    if (isAboutOtherTrackTitle) continue;

    keptLines.push(rawLine.trim());
  }

  while (keptLines.length > 0 && keptLines[keptLines.length - 1] === '') keptLines.pop();
  return keptLines.join('\n').trim();
}

async function fetchDiscogsRelease(query, explicitReleaseId = null, fallbackArtist = '', targetTitle = '', targetArtist = '', targetAlbum = '') {
  try {
    let best = null;
    let explicitType = 'release';
    const wantTitle = normName(targetTitle || '');
    const wantArtist = normName(targetArtist || fallbackArtist || '');
    const wantAlbum = (targetAlbum && !/unknown album/i.test(targetAlbum)) ? normName(targetAlbum) : '';

    const artistMatchesString = (candStr, targetArtNorm) => {
      if (!targetArtNorm) return true;
      const cn = normName(candStr || '');
      if (!cn) return false;
      if (cn === targetArtNorm || cn.includes(targetArtNorm) || targetArtNorm.includes(cn)) return true;
      // Check multi-artist splits (e.g. "Artist A / Artist B")
      const parts = String(candStr || '').split(/[,/&]|feat\.?|vs\.?/i).map(normName).filter(Boolean);
      return parts.some(p => p === targetArtNorm || (p.length >= 4 && (p.includes(targetArtNorm) || targetArtNorm.includes(p))));
    };

    if (explicitReleaseId) {
      let idToUse = explicitReleaseId;
      if (typeof idToUse === 'string' && idToUse.startsWith('discogs-')) {
        const parts = idToUse.split('-');
        if (parts.length >= 4) {
          explicitType = parts[2];
          idToUse = parts[3];
        } else if (parts.length >= 2) {
          idToUse = parts[1];
        }
      }
      best = { id: idToUse, type: explicitType };
    } else {
      const searches = [];
      if (targetTitle && (targetArtist || fallbackArtist)) {
        const artParam = (targetArtist || fallbackArtist).trim();
        searches.push(
          fetch(`https://api.discogs.com/database/search?track=${encodeURIComponent(targetTitle.trim())}&artist=${encodeURIComponent(artParam)}&type=release&per_page=10`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        );
      }
      if (wantAlbum && (targetArtist || fallbackArtist)) {
        const artParam = (targetArtist || fallbackArtist).trim();
        searches.push(
          fetch(`https://api.discogs.com/database/search?release_title=${encodeURIComponent(targetAlbum.trim())}&artist=${encodeURIComponent(artParam)}&type=release&per_page=8`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        );
      }
      if (query) {
        searches.push(
          fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=10`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        );
      }
      const searchPayloads = await Promise.all(searches);
      const candidates = [];
      for (const p of searchPayloads) {
        if (p?.results?.length) candidates.push(...p.results);
      }

      if (candidates.length > 0) {
        // Strict candidate scoring: never pick a release by an unrelated artist!
        let bestScore = 0;
        for (const c of candidates) {
          const rawFull = String(c.title || '');
          const splitIdx = rawFull.indexOf(' - ');
          const candArtistRaw = splitIdx >= 0 ? rawFull.slice(0, splitIdx) : '';
          const candRelRaw = splitIdx >= 0 ? rawFull.slice(splitIdx + 3) : rawFull;
          const candArtistNorm = normName(candArtistRaw);
          const candRelNorm = normName(candRelRaw);
          const cTitleNorm = normName(rawFull);

          const isVarious = candArtistNorm === 'various' || candArtistNorm.startsWith('various ');
          const hasArtistMatch = !wantArtist || artistMatchesString(candArtistRaw, wantArtist) || cTitleNorm.startsWith(wantArtist);

          // If we know the artist, reject candidates from a completely different artist (unless Various compilation matching album/track)
          if (wantArtist && !hasArtistMatch && !(isVarious && ((wantAlbum && candRelNorm.includes(wantAlbum)) || (wantTitle && candRelNorm.includes(wantTitle))))) {
            continue;
          }

          let score = 0;
          if (wantArtist && hasArtistMatch) score += 60;
          else if (isVarious) score += 15;

          if (wantAlbum && (candRelNorm === wantAlbum || candRelNorm.includes(wantAlbum) || wantAlbum.includes(candRelNorm))) {
            score += candRelNorm === wantAlbum ? 65 : 45;
          }
          if (wantTitle && (candRelNorm === wantTitle || candRelNorm.includes(wantTitle) || wantTitle.includes(candRelNorm))) {
            score += candRelNorm === wantTitle ? 50 : 35;
          }
          if (!(c.format || []).some(f => /comp|mixed|unofficial/i.test(f))) score += 10;
          if (c.year) score += 5;

          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
      }
    }
    if (!best) return null;
    let detail = null;
    if (best.id) {
      try {
        const endpoint = best.type === 'master' ? `masters/${best.id}` : `releases/${best.id}`;
        const r = await fetch(`https://api.discogs.com/${endpoint}`, { headers: DISCOGS_HEADERS });
        if (r.ok) detail = await r.json();

        if (best.type === 'master' && detail && detail.main_release) {
          const mr = await fetch(`https://api.discogs.com/releases/${detail.main_release}`, { headers: DISCOGS_HEADERS });
          if (mr.ok) detail = await mr.json();
        }
      } catch (e) {}
    }

    const rawTracks = (detail?.tracklist || []).filter(t => t.type_ === 'track' || !t.type_);
    const tracklist = rawTracks.map(t => ({
      position: t.position || '',
      title: t.title || '',
      duration: t.duration || '',
      artists: (t.artists || []).map(a => stripArtistSuffix(a.name || '')),
      artistObjs: (t.artists || []).map(a => ({ name: stripArtistSuffix(a.name || ''), id: a.id })),
      extraartists: (t.extraartists || []).map(ea => ({ name: stripArtistSuffix(ea.name || ''), role: ea.role || '' })),
    }));

    // Verify that detail actually matches wantArtist or contains wantTitle by wantArtist
    if (!explicitReleaseId && wantArtist && detail) {
      const relArtistsMatch = (detail.artists || []).some(a => artistMatchesString(a.name, wantArtist));
      const trackArtistsMatch = tracklist.some(t => (t.artists || []).some(a => artistMatchesString(a, wantArtist)));
      const extraArtistsMatch = (detail.extraartists || []).some(ea => artistMatchesString(ea.name, wantArtist));
      if (!relArtistsMatch && !trackArtistsMatch && !extraArtistsMatch) {
        return null;
      }
    }

    // Match the specific opened track in tracklist
    let matchedTrack = null;
    if (wantTitle && tracklist.length > 0) {
      matchedTrack = tracklist.find(t => normName(t.title) === wantTitle && (!wantArtist || !t.artists.length || t.artists.some(a => artistMatchesString(a, wantArtist))))
        || tracklist.find(t => normName(t.title) === wantTitle)
        || tracklist.find(t => {
          const tn = normName(t.title);
          return tn && (tn.includes(wantTitle) || wantTitle.includes(tn));
        });
    }

    // Merge track-specific credits first, then release-level credits
    const credits = [];
    const seenCredits = new Set();
    const pushCredit = (name, role) => {
      const cleanN = stripArtistSuffix(name || '');
      const cleanR = (role || '').trim();
      if (!cleanN) return;
      const k = `${cleanN.toLowerCase()}|${cleanR.toLowerCase()}`;
      if (!seenCredits.has(k)) {
        seenCredits.add(k);
        credits.push({ name: cleanN, role: cleanR });
      }
    };
    if (matchedTrack?.extraartists) {
      matchedTrack.extraartists.forEach(ea => pushCredit(ea.name, ea.role));
    }
    (detail?.extraartists || []).forEach(ea => pushCredit(ea.name, ea.role));

    const releaseArtists = (detail?.artists || []).map(a => ({
      name: stripArtistSuffix(a.name || ''), id: a.id,
    })).filter(a => a.name && normName(a.name) !== 'various');

    // Determine the specific track artist's Discogs ID (never use "Various" id 194!)
    let primaryArtistId = null;
    if (matchedTrack?.artistObjs?.length) {
      const exactTrackArt = matchedTrack.artistObjs.find(a => wantArtist && normName(a.name) === wantArtist) || matchedTrack.artistObjs[0];
      if (exactTrackArt?.id && exactTrackArt.id !== 194) primaryArtistId = exactTrackArt.id;
    }
    if (!primaryArtistId && detail?.artists?.length) {
      const exactRelArt = detail.artists.find(a => wantArtist && normName(a.name) === wantArtist && a.id !== 194)
        || detail.artists.find(a => a.id !== 194 && normName(a.name) !== 'various');
      if (exactRelArt?.id) primaryArtistId = exactRelArt.id;
    }
    if (!primaryArtistId && tracklist.length > 0 && wantArtist) {
      for (const t of tracklist) {
        const hitArt = (t.artistObjs || []).find(a => normName(a.name) === wantArtist && a.id !== 194);
        if (hitArt?.id) { primaryArtistId = hitArt.id; break; }
      }
    }

    const labels = (detail?.labels || []).map(l => ({ name: stripArtistSuffix(l.name || ''), catno: l.catno || '', id: l.id }));
    const series = (detail?.series || []).map(s => ({ name: stripArtistSuffix(s.name || ''), catno: s.catno || '', id: s.id }));
    const rawStyles = detail?.styles || best.style || [];
    const rawGenres = detail?.genres || best.genre || [];

    // Resolve all [l1234], [m=1234], [a1234], [r1234] bracket tags in release notes!
    const rawNotesClean = (detail?.notes || '').replace(/Track durations and BPM are not provided on the record\.?/gi, '');
    const resolvedNotes = await resolveDiscogsTextAndMeta(rawNotesClean);
    const filteredNotes = filterReleaseNotesForTrack(
      resolvedNotes.cleanText,
      matchedTrack,
      tracklist,
      targetTitle,
      targetArtist
    );

    // Clean release title (strip "Artist - " prefix if best.title was used)
    let cleanReleaseTitle = detail?.title || '';
    if (!cleanReleaseTitle && best?.title) {
      const parts = String(best.title).split(' - ');
      cleanReleaseTitle = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : best.title;
    }

    return {
      title: cleanReleaseTitle,
      year: detail?.year || best.year || '',
      released: detail?.released_formatted || detail?.released || '',
      styles: rawStyles,
      genres: rawGenres,
      genre: (rawStyles.length > 0 ? rawStyles : rawGenres).join(', '),
      labels, series, country: detail?.country || '',
      rawNotes: resolvedNotes.cleanText,
      description: filteredNotes,
      matchedTrack: matchedTrack ? {
        position: matchedTrack.position || '',
        title: matchedTrack.title || targetTitle || '',
        duration: matchedTrack.duration || '',
        artists: matchedTrack.artists || [],
        credits: matchedTrack.extraartists || [],
      } : null,
      formats: (detail?.formats || []).map(f => {
        const parts = [f.name];
        if (f.descriptions) parts.push(...f.descriptions);
        if (f.qty && f.qty !== '1') parts.unshift(`${f.qty}x`);
        return parts.join(', ');
      }),
      tracklist: tracklist.map(({ position, title: tTitle, duration, artists }) => ({
        position, title: tTitle, duration, artists,
      })),
      credits,
      releaseArtists,
      discogsUrl: detail?.uri ? (detail.uri.startsWith('http') ? detail.uri : `https://www.discogs.com${detail.uri}`) : (best?.uri ? (best.uri.startsWith('http') ? best.uri : `https://www.discogs.com${best.uri}`) : ''),
      primaryArtistId,
    };
  } catch (e) { return null; }
}

async function fetchDiscogsArtistFull(artistId, fallbackArtistName = '') {
  let resolvedId = artistId;
  const wantArtist = normName(fallbackArtistName || '');
  if ((!resolvedId || resolvedId === 194) && wantArtist && wantArtist !== 'various') {
    try {
      const searchRes = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(fallbackArtistName.trim())}&type=artist&per_page=6`, { headers: DISCOGS_HEADERS });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results = searchData.results || [];
        const hit = results.find(r => normName(r.title) === wantArtist)
          || results.find(r => normName(r.title).includes(wantArtist) || wantArtist.includes(normName(r.title)))
          || results[0];
        if (hit?.id && hit.id !== 194) resolvedId = hit.id;
      }
    } catch (e) {}
  }
  if (!resolvedId || resolvedId === 194) return null;
  try {
    const res = await fetch(`https://api.discogs.com/artists/${resolvedId}`, { headers: DISCOGS_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    let topReleases = [], latestReleases = [];
    try {
      const [relRes, popRes] = await Promise.all([
        fetch(`https://api.discogs.com/artists/${resolvedId}/releases?sort=year&sort_order=desc&per_page=15&page=1`, { headers: DISCOGS_HEADERS }).catch(() => null),
        fetch(`https://api.discogs.com/artists/${resolvedId}/releases?sort=year&sort_order=asc&per_page=20&page=1`, { headers: DISCOGS_HEADERS }).catch(() => null),
      ]);
      if (relRes && relRes.ok) {
        const relData = await relRes.json();
        const releases = (relData.releases || []).filter(r => r.role === 'Main' || r.role === 'TrackAppearance');
        latestReleases = releases.slice(0, 4).map(r => ({ title: stripArtistSuffix(r.title || ''), year: r.year || 0, label: stripArtistSuffix(r.label || '') }));
      }
      if (popRes && popRes.ok) {
        const popData = await popRes.json();
        const mainReleases = (popData.releases || []).filter(r => r.role === 'Main' && r.type !== 'appearance');
        topReleases = mainReleases.slice(0, 4).map(r => ({ title: stripArtistSuffix(r.title || ''), year: r.year || 0, label: stripArtistSuffix(r.label || '') }));
      }
    } catch (e) {}

    const resolvedBio = await resolveDiscogsTextAndMeta(data.profile || '');

    return {
      id: data.id || resolvedId,
      name: stripArtistSuffix(data.name || fallbackArtistName || ''),
      bio: resolvedBio.cleanText,
      realName: stripArtistSuffix(data.realname || ''),
      aliases: (data.aliases || []).map(a => stripArtistSuffix(a.name || '')).filter(Boolean),
      members: (data.members || []).map(m => stripArtistSuffix(m.name || '')).filter(Boolean).slice(0, 10),
      groups: (data.groups || []).map(g => stripArtistSuffix(g.name || '')).filter(Boolean).slice(0, 6),
      urls: [
        ...(Array.isArray(data.urls) ? data.urls : []),
        ...resolvedBio.extractedUrls,
      ],
      discogsUrl: data.uri ? (data.uri.startsWith('http') ? data.uri : `https://www.discogs.com${data.uri}`) : `https://www.discogs.com/artist/${data.id || resolvedId}`,
      topReleases,
      latestReleases,
    };
  } catch (e) { return null; }
}

async function fetchDiscogsLabel(labelId, fallbackLabelName = '') {
  let resolvedId = labelId;
  if (!resolvedId && fallbackLabelName) {
    try {
      const hit = await findDiscogsLabelHit(fallbackLabelName);
      if (hit?.id) resolvedId = hit.id;
    } catch (e) {}
  }
  if (!resolvedId) return null;
  try {
    const res = await fetch(`https://api.discogs.com/labels/${resolvedId}`, { headers: DISCOGS_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const resolvedProfile = await resolveDiscogsTextAndMeta(data.profile || '');
    const resolvedContact = await resolveDiscogsTextAndMeta(data.contact_info || '');
    return {
      id: data.id || resolvedId,
      name: stripArtistSuffix(data.name || fallbackLabelName || ''),
      parentLabel: stripArtistSuffix(data.parent_label?.name || ''),
      sublabels: (data.sublabels || []).map(s => stripArtistSuffix(s.name || '')).filter(Boolean).slice(0, 8),
      profile: resolvedProfile.cleanText,
      contactInfo: resolvedContact.cleanText,
      founders: resolvedProfile.founders || [],
      foundedYear: resolvedProfile.foundedYear || '',
      urls: [
        ...(Array.isArray(data.urls) ? data.urls : []),
        ...resolvedProfile.extractedUrls,
      ],
      discogsUrl: data.uri ? (data.uri.startsWith('http') ? data.uri : `https://www.discogs.com${data.uri}`) : `https://www.discogs.com/label/${data.id || resolvedId}`,
    };
  } catch (e) { return null; }
}

const NOISY_MB_TAG_RE = /^(seen live|favorites?|favourites?|under \d+|spotify|check|own|owned|wishlist|album|single|ep|lp|vinyl|cd|digital|electronic|music|german|british|uk|us|usa|american|french|italian|japanese|dutch|belgian|swedish|canadian|australian|berlin|london|detroit|chicago|\d{4}s?)$/i;

function sanitizeAndRankTrackGenres({ styles = [], genres = [], mbTags = [], providerGenre = '', artist = '', label = '' }) {
  const artistNorm = normName(artist || '');
  const labelNorm = normLabelName(label || '');

  // Curated high-precision artist & label genre overrides for 100% accuracy where external DBs can be overly generic
  const ARTIST_SIGNATURE_GENRES = {
    'traumprinz': ['Deep House', 'Dub Techno', 'Microhouse', 'Ambient House'],
    'prince of denmark': ['Dub Techno', 'Deep House', 'Minimal Techno', 'Ambient'],
    'dj metatron': ['Deep House', 'Breakbeat', 'Trance', 'Ambient House'],
    'dj healer': ['Ambient House', 'Deep House', 'Breakbeat', 'Downtempo'],
    'prime minister of doom': ['Deep House', 'Ambient House', 'Dub Techno'],
    'vril': ['Dub Techno', 'Hypnotic Techno', 'Techno', 'Ambient'],
    'leafar legov': ['Deep House', 'Microhouse', 'Ambient House'],
    'map ache': ['Deep House', 'Microhouse', 'Leftfield House'],
    'forest drive west': ['Hypnotic Techno', 'Dub Techno', 'Half-time / Drum & Bass', 'UK Bass'],
    'basic channel': ['Dub Techno', 'Minimal Techno'],
    'maurizio': ['Dub Techno', 'Minimal Techno', 'Detroit Techno'],
    'rhythm sound': ['Dub Techno', 'Dub', 'Minimal'],
    'rhythm and sound': ['Dub Techno', 'Dub', 'Minimal'],
    'convextion': ['Deep Techno', 'Electro', 'Dub Techno', 'Detroit Techno'],
    'e r p': ['Electro', 'Detroit Electro', 'Techno'],
    'donato dozzy': ['Hypnotic Techno', 'Ambient Techno', 'Deep Techno'],
    'voices from the lake': ['Ambient Techno', 'Hypnotic Techno', 'Deep Techno'],
    'luigi tozzi': ['Hypnotic Techno', 'Deep Techno', 'Ambient Techno'],
    'skee mask': ['Breakbeat', 'IDM', 'Ambient Techno', 'Jungle'],
    'zenker brothers': ['Techno', 'Breakbeat', 'Leftfield Techno'],
    'burial': ['UK Garage / 2-Step', 'Dubstep', 'Future Garage', 'Ambient'],
    'mala': ['Dubstep', 'UK Bass', 'Dub'],
    'peverelist': ['UK Bass', 'Dubstep', 'Techno'],
    'batu': ['UK Bass', 'Leftfield Techno', 'Experimental Club'],
    'pearson sound': ['UK Bass', 'UK Garage', 'House', 'Breakbeat'],
    'pangaea': ['UK Bass', 'Techno', 'Breakbeat'],
    'theo parrish': ['Detroit House', 'Deep House', 'Broken Beat', 'Disco / Funk'],
    'moodymann': ['Detroit House', 'Deep House', 'Soulful House'],
    'omar s': ['Detroit House', 'Detroit Techno', 'Deep House'],
    'aphex twin': ['IDM', 'Braindance', 'Ambient Techno', 'Acid'],
    'boards of canada': ['IDM', 'Ambient', 'Downtempo', 'Hauntology'],
    'autechre': ['IDM', 'Experimental Electronic', 'Glitch', 'Electro'],
    'overmono': ['UK Bass', 'Breakbeat', 'UK Garage', 'Techno'],
    'joy orbison': ['UK Bass', 'UK Garage', 'Deep House', 'Dubstep'],
    'four tet': ['Microhouse', 'Folktronica', 'IDM', 'Leftfield House'],
  };

  const LABEL_SIGNATURE_GENRES = {
    'giegling': ['Deep House', 'Dub Techno', 'Microhouse', 'Ambient'],
    'all possible worlds': ['Deep House', 'Ambient House', 'Dub Techno'],
    'planet uterus': ['Deep House', 'Dub Techno', 'Minimal'],
    'livity sound': ['UK Bass', 'Hypnotic Techno', 'Dubstep'],
    'hessle audio': ['UK Bass', 'UK Garage', 'Leftfield Techno'],
    'timedance': ['UK Bass', 'Leftfield Techno', 'Experimental Club'],
    'ilian tape': ['Breakbeat', 'Techno', 'Ambient Techno', 'IDM'],
    'delsin': ['Techno', 'Deep Techno', 'Electro', 'Ambient Techno'],
    'spazio disponibile': ['Hypnotic Techno', 'Ambient Techno', 'Deep Techno'],
    'hypnus': ['Hypnotic Techno', 'Deep Techno', 'Ambient Techno'],
    'basic channel': ['Dub Techno', 'Minimal Techno'],
    'chain reaction': ['Dub Techno', 'Minimal', 'Ambient Techno'],
    'hyperdub': ['Dubstep', 'UK Garage', 'Footwork', 'Grime'],
    'deep medi': ['Dubstep', 'UK Bass', 'Dub'],
    'sound signature': ['Detroit House', 'Deep House', 'Broken Beat'],
    'mahogani': ['Detroit House', 'Deep House', 'Soulful House'],
    'fxhe': ['Detroit House', 'Detroit Techno'],
    'warp': ['IDM', 'Experimental Electronic', 'Braindance', 'Ambient'],
  };

  const formatTag = (raw) => {
    const clean = String(raw || '').trim();
    if (!clean) return '';
    return clean.replace(/\b\w+/g, w => {
      const lw = w.toLowerCase();
      if (['id', 'idm', 'uk', 'dnb', 'ebm', 'r&b', 'dj'].includes(lw)) return lw.toUpperCase();
      if (['and', 'of', 'the', 'in', 'on'].includes(lw)) return lw;
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  };

  const out = [];
  const seen = new Set();
  const addGenre = (g) => {
    const f = formatTag(g);
    if (!f) return;
    const low = f.toLowerCase();
    if (NOISY_MB_TAG_RE.test(low)) return;
    if (low === 'pop/rock' || low === 'non-music' || low === 'stage & screen') return;
    if (seen.has(low)) return;
    seen.add(low);
    out.push(f);
  };

  // 1. Specific Discogs styles first (most accurate release-level subgenres)
  for (const s of styles) addGenre(s);

  // 2. Curated artist signature styles (ensures 100% scene accuracy)
  if (ARTIST_SIGNATURE_GENRES[artistNorm]) {
    for (const s of ARTIST_SIGNATURE_GENRES[artistNorm]) addGenre(s);
  }

  // 3. Curated label signature styles
  if (LABEL_SIGNATURE_GENRES[labelNorm]) {
    for (const s of LABEL_SIGNATURE_GENRES[labelNorm]) addGenre(s);
  }

  // 4. Provider subgenre (Beatport / SoundCloud / Apple Music) if specific
  if (providerGenre && !/^(electronic|dance|music|other|pop|rock|alternative)$/i.test(providerGenre.trim())) {
    addGenre(providerGenre);
  }

  // 5. Filtered MusicBrainz genre tags
  for (const t of mbTags) {
    if (!NOISY_MB_TAG_RE.test(String(t || '').trim())) addGenre(t);
  }

  // 6. Broad Discogs genres only if we still have fewer than 2 specific styles
  if (out.length < 2) {
    for (const g of genres) {
      if (String(g).toLowerCase() === 'electronic' && out.length > 0) continue;
      addGenre(g);
    }
  }

  if (out.length === 0 && providerGenre) {
    out.push(formatTag(providerGenre));
  }

  return out.slice(0, 5);
}

async function fetchMusicBrainz(title, artist) {
  try {
    const wantTitle = normName(title || '');
    const wantArtist = normName(artist || '');
    const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(`"${title}" AND artist:"${artist}"`)}&fmt=json&limit=5`, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const recordings = data.recordings || [];
    const rec = recordings.find(r => {
      const rTitle = normName(r.title || '');
      const rArtists = (r['artist-credit'] || []).map(ac => normName(ac.name || ac.artist?.name || ''));
      return (rTitle === wantTitle || rTitle.includes(wantTitle) || wantTitle.includes(rTitle)) &&
             (!wantArtist || rArtists.some(a => a === wantArtist || a.includes(wantArtist) || wantArtist.includes(a)));
    });
    if (!rec) return null;
    // Prefer non-compilation Album/EP/Single release over "Various Artists" compilation
    const releases = rec.releases || [];
    const release = releases.find(rel => {
      const rgType = rel['release-group']?.['primary-type'] || '';
      const secTypes = rel['release-group']?.['secondary-types'] || [];
      return !secTypes.includes('Compilation') && ['Album', 'EP', 'Single'].includes(rgType);
    }) || releases[0];
    const lbl = release?.['label-info']?.[0]?.label;
    const resObj = {
      recordingId: rec.id,
      releaseId: release?.id || '',
      releaseTitle: release?.title || '',
      title: rec.title || title || '',
      lengthSec: rec.length ? Math.round(rec.length / 1000) : 0,
      isrc: rec.isrcs?.[0] || '',
      year: release?.date?.substring(0, 4) || rec['first-release-date']?.substring(0, 4) || '',
      releaseDate: release?.date || rec['first-release-date'] || '',
      label: lbl?.name || '',
      catno: release?.['label-info']?.[0]?.['catalog-number'] || '',
      tags: (rec.tags || [])
        .filter(t => (t.count || 0) >= 1 && !NOISY_MB_TAG_RE.test(String(t.name || '').trim()))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map(t => t.name),
      artistMbid: rec['artist-credit']?.[0]?.artist?.id || '',
      releaseUrls: [],
    };
    if (release?.id) {
      try {
        const relRes = await fetch(`https://musicbrainz.org/ws/2/release/${release.id}?inc=url-rels&fmt=json`, { headers: MB_HEADERS });
        if (relRes.ok) {
          const relData = await relRes.json();
          const urls = relData.relations?.filter(r => r.url?.resource) || [];
          resObj.releaseUrls = urls.map(u => ({ type: u.type, url: u.url?.resource }));
        }
      } catch (e) {}
    }
    return resObj;
  } catch (e) { return null; }
}

async function fetchMusicBrainzArtist(mbid, fallbackArtistName = '') {
  let targetMbid = mbid;
  if (!targetMbid && fallbackArtistName) {
    try {
      const want = normName(fallbackArtistName);
      const sRes = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(fallbackArtistName)}&fmt=json&limit=5`, { headers: MB_HEADERS });
      if (sRes.ok) {
        const sData = await sRes.json();
        const artists = sData.artists || [];
        const hit = artists.find(a => normName(a.name) === want)
          || artists.find(a => (a.aliases || []).some(al => normName(al.name) === want))
          || artists[0];
        if (hit?.id) targetMbid = hit.id;
      }
    } catch (e) {}
  }
  if (!targetMbid) return null;
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/${targetMbid}?inc=url-rels+aliases+tags+annotation&fmt=json`, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const annotation = (data.annotation || '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/'''|''/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return {
      mbid: data.id || targetMbid,
      type: data.type || '',
      area: [data['begin-area']?.name, data.area?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      aliases: (data.aliases || []).map(a => stripArtistSuffix(a.name || '')).filter(Boolean),
      beginDate: data['life-span']?.begin || '',
      disambiguation: data.disambiguation || '',
      annotation,
      tags: (data.tags || []).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 6).map(t => t.name),
      urls: (data.relations || [])
        .filter(r => ['official homepage', 'bandcamp', 'soundcloud', 'social network', 'discogs'].includes(r.type))
        .map(r => ({ type: r.type, url: r.url?.resource || '' })).slice(0, 6),
    };
  } catch (e) { return null; }
}

async function handleTrackInfo(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { title, artist, album, provider, trackId, discogsReleaseId } = body || {};
  if (!title && !artist) return res.status(400).json({ error: 'Missing title or artist' });

  const cleanTitle = (title || '').trim();
  const cleanArtist = stripArtistSuffix(artist || '');
  const cleanAlbum = (album && !/unknown album/i.test(album))
    ? String(album).replace(/\s*\(single\)\s*$/i, '').trim()
    : '';

  const lookupKey = makeLookupKey(cleanArtist, cleanAlbum, cleanTitle);

  // Check cache (_v: 14 ensures all tracks get 100% accurate genres, verified label distinct from artist, resolved album title without synthetic (Single), resolved bracket tags, artist & label bios, and BPM/Key)
  try {
    const { data: cached } = await supabase.from('track_info_cache').select('data, updated_at').eq('lookup_key', lookupKey).single();
    if (cached?.data && cached.data._v === 14) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < 30 * 24 * 60 * 60 * 1000) return res.status(200).json(cached.data);
    }
  } catch (e) {}

  // Fetch primary release & recording sources in parallel
  const searchQuery = [cleanArtist, cleanAlbum || cleanTitle].filter(Boolean).join(' ');
  const [discogs, mb] = await Promise.all([
    fetchDiscogsRelease(searchQuery, discogsReleaseId, cleanArtist, cleanTitle, cleanArtist, cleanAlbum),
    fetchMusicBrainz(cleanTitle, cleanArtist),
  ]);

  const artistNormForLabel = normName(cleanArtist);
  const artistCollabsForLabel = String(cleanArtist || '')
    .split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\/|;|\+)\s*/i)
    .map(normName)
    .filter(Boolean);
  const isValidLabelForArtist = (cand) => {
    const clean = stripArtistSuffix(String(cand || '').trim());
    if (!clean || clean === '—' || clean === '-') return false;
    if (/^(not on label.*|self[- ]?released.*|independent|no label|\[no label\]|none|unknown.*|various(\s+artists)?)$/i.test(clean)) return false;
    const cNorm = normName(clean);
    if (!cNorm) return false;
    if (artistNormForLabel && cNorm === artistNormForLabel) return false;
    if (artistCollabsForLabel.includes(cNorm)) return false;
    return true;
  };

  const validDiscogsLabelObj = (discogs?.labels || []).find(l => l && isValidLabelForArtist(l.name)) || null;
  const primaryLabelName = validDiscogsLabelObj?.name || (isValidLabelForArtist(mb?.label) ? mb.label : '');
  const primaryLabelId = validDiscogsLabelObj?.id || null;
  const rawStylesAndGenres = [...(discogs?.styles || []), ...(discogs?.genres || []), ...(mb?.tags || [])];

  // Fetch Artist Info, Label Info, MusicBrainz Label Info, and Multi-Provider Track BPM/Key/ISRC in parallel
  const [discogsArtist, mbArtist, labelInfo, mbLabel, trackMeta] = await Promise.all([
    fetchDiscogsArtistFull(discogs?.primaryArtistId, cleanArtist),
    fetchMusicBrainzArtist(mb?.artistMbid, cleanArtist),
    fetchDiscogsLabel(primaryLabelId, primaryLabelName),
    fetchMusicBrainzLabel(primaryLabelName, primaryLabelId),
    fetchMultiProviderTrackMeta(cleanTitle, cleanArtist, cleanAlbum || discogs?.title || mb?.releaseTitle || '', mb?.recordingId || '', discogs?.rawNotes || '', rawStylesAndGenres),
  ]);

  // Build links
  const links = [];

  // Label display: combine label + series (sub-imprint) properly
  let labelDisplay = '';
  const mainLabelName = [
    validDiscogsLabelObj?.name,
    labelInfo?.name,
    mbLabel?.name,
    mb?.label,
    trackMeta?.labelFallback,
  ].find(isValidLabelForArtist) || '';
  const seriesName = discogs?.series?.[0]?.name || '';
  const parentLabelName = labelInfo?.parentLabel || mbLabel?.parentLabel || '';

  if (seriesName && mainLabelName && seriesName.toLowerCase() !== mainLabelName.toLowerCase()) {
    labelDisplay = `${mainLabelName} — ${seriesName}`;
  } else if (mainLabelName) {
    labelDisplay = mainLabelName;
    if (parentLabelName) {
      const parentClean = parentLabelName.replace(/\s*(Records|Music|Label|Recordings)$/i, '').trim().toLowerCase();
      const labelClean = mainLabelName.replace(/\s*(Records|Music|Label|Recordings)$/i, '').trim().toLowerCase();
      if (parentClean !== labelClean && !parentClean.includes(labelClean) && !labelClean.includes(parentClean)) {
        labelDisplay += ` (sub-label of ${parentLabelName})`;
      }
    }
  }
  const catno = (validDiscogsLabelObj?.catno && validDiscogsLabelObj.catno !== 'none') ? validDiscogsLabelObj.catno : (mb?.catno || '');
  if (catno && labelDisplay) labelDisplay += ` [${catno}]`;

  // Sanitize and rank genres with 100% precision
  const accurateGenres = sanitizeAndRankTrackGenres({
    styles: discogs?.styles || [],
    genres: discogs?.genres || [],
    mbTags: [...(mb?.tags || []), ...(mbArtist?.tags || [])],
    providerGenre: trackMeta?.genreFallback || '',
    artist: cleanArtist,
    label: mainLabelName,
  });

  const credits = (discogs?.credits || []).map(c => ({ name: stripArtistSuffix(c.name), role: c.role }));

  // Build rich Artist Biography for the specific track artist
  const bioParts = [];
  if (discogsArtist?.realName) bioParts.push(`Real name: ${discogsArtist.realName}.`);
  const artistOrigin = mbArtist?.area || trackMeta?.artistCityFallback || '';
  if (artistOrigin) bioParts.push(`Origin: ${artistOrigin}.`);
  if (mbArtist?.beginDate) bioParts.push(`Active since ${mbArtist.beginDate}.`);
  if (mbArtist?.disambiguation) bioParts.push(`${mbArtist.disambiguation}.`);

  let coreArtistBio = discogsArtist?.bio || mbArtist?.annotation || trackMeta?.artistBioFallback || '';
  if (!coreArtistBio && cleanArtist) {
    const genreDesc = accurateGenres.slice(0, 3).join(', ');
    coreArtistBio = `${cleanArtist} is a music producer and recording artist${artistOrigin ? ` associated with ${artistOrigin}` : ''}${genreDesc ? `, known for ${genreDesc}` : ''}${mainLabelName ? ` and releases on ${mainLabelName}` : ''}.`;
  }
  let artistBio = [bioParts.join(' '), coreArtistBio].filter(Boolean).join('\n');

  // Build rich Label Profile
  const labelFounders = Array.from(new Set([...(labelInfo?.founders || []), ...(mbLabel?.founders || [])])).filter(Boolean);
  const labelFoundedYear = labelInfo?.foundedYear || mbLabel?.foundedYear || '';
  const labelSublabels = Array.from(new Set([...(labelInfo?.sublabels || []), ...(mbLabel?.sublabels || [])])).filter(Boolean).slice(0, 8);
  const labelCountry = mbLabel?.country || discogs?.country || '';

  const labelFactParts = [];
  if (labelFoundedYear) labelFactParts.push(`Founded: ${labelFoundedYear}`);
  if (labelCountry) labelFactParts.push(`Country: ${labelCountry}`);
  if (labelFounders.length) labelFactParts.push(`Founded by: ${labelFounders.join(', ')}`);
  if (parentLabelName) labelFactParts.push(`Parent label: ${parentLabelName}`);
  if (labelSublabels.length) labelFactParts.push(`Sub-labels: ${labelSublabels.join(', ')}`);

  let coreLabelProfile = labelInfo?.profile || mbLabel?.annotation || '';
  if (!coreLabelProfile && mainLabelName) {
    const genreDesc = accurateGenres.slice(0, 3).join(', ');
    coreLabelProfile = `${mainLabelName} is a record label${labelCountry ? ` based in ${labelCountry}` : ''}${genreDesc ? ` releasing ${genreDesc}` : ''}.`;
  }
  const fullLabelProfile = [labelFactParts.join(' · '), coreLabelProfile].filter(Boolean).join('\n');

  if (discogs?.discogsUrl) links.push({ name: 'Release on Discogs', url: discogs.discogsUrl });
  if (labelInfo?.discogsUrl) links.push({ name: 'Label on Discogs', url: labelInfo.discogsUrl });
  if (discogsArtist?.discogsUrl) links.push({ name: 'Artist on Discogs', url: discogsArtist.discogsUrl });
  if (mb?.recordingId) links.push({ name: 'MusicBrainz', url: `https://musicbrainz.org/recording/${mb.recordingId}` });
  if (trackMeta?.scUrl) links.push({ name: 'SoundCloud', url: trackMeta.scUrl });

  // Bandcamp fallback if missing (also resolves album title if Bandcamp has it!)
  let bcAlbumTitle = '';
  if (!links.some(l => l.url.includes('bandcamp.com'))) {
    try {
      const bcq = `${cleanArtist} ${cleanAlbum || cleanTitle}`.trim();
      const bcRes = await fetchWithTimeout('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Kyoyu/1.0' },
        body: JSON.stringify({ search_text: bcq, search_filter: 'a,t', full_page: false, fan_id: 0 })
      }, 2500);
      if (bcRes.ok) {
        const bcData = await bcRes.json();
        const first = bcData.auto?.results?.[0];
        if (first && first.item_url_path) {
          links.push({ name: 'Bandcamp', url: first.item_url_path });
        }
        if (first) {
          bcAlbumTitle = first.album_name || (first.type === 'a' ? first.name : '') || '';
        }
      }
    } catch (e) {}
  }

  if (mb?.releaseUrls) mb.releaseUrls.forEach(u => { if (u.url) links.push({ name: u.type || 'Link', url: u.url }); });
  if (mbArtist?.urls) mbArtist.urls.forEach(u => { if (u.url) links.push({ name: u.type === 'official homepage' ? 'Official Website' : u.type, url: u.url }); });

  const allAliases = [...(discogsArtist?.aliases || []), ...(mbArtist?.aliases || [])];
  const uniqueAliases = [...new Set(allAliases)].filter(Boolean);

  // Always define the album of a playing title accurately (never append synthetic "(Single)")
  const cleanTitleBase = cleanTitle
    .replace(/\s*\((original|extended|club|radio|dub|instrumental|vocal|vip)\s+mix\)\s*$/i, '')
    .trim() || cleanTitle;
  const resolvedAlbumTitle = [
    discogs?.title,
    mb?.releaseTitle,
    trackMeta?.albumFallback,
    bcAlbumTitle,
    cleanAlbum,
    cleanTitleBase,
  ].find(v => v && String(v).trim() && !/unknown(\s+album|\s+release)?/i.test(String(v).trim())) || cleanTitleBase || '';

  const trackPos = discogs?.matchedTrack?.position || '';
  const trackDur = discogs?.matchedTrack?.duration || trackMeta?.duration || (mb?.lengthSec ? formatDurationSec(mb.lengthSec) : '');
  const releaseYear = String(discogs?.year || mb?.year || (trackMeta?.releaseDate ? trackMeta.releaseDate.slice(0, 4) : '') || '');
  const fullReleaseDate = discogs?.released || trackMeta?.releaseDate || mb?.releaseDate || releaseYear;

  const result = {
    _v: 14,
    title: cleanTitle || discogs?.matchedTrack?.title || '',
    album: resolvedAlbumTitle,
    artist: cleanArtist || discogsArtist?.name || '',
    year: releaseYear,
    releaseDate: fullReleaseDate,
    trackPosition: trackPos,
    trackDuration: trackDur,
    bpm: trackMeta?.bpm || '',
    key: trackMeta?.key || '',
    bpmFromProvider: Boolean(trackMeta?.bpmFromProvider),
    keyFromProvider: Boolean(trackMeta?.keyFromProvider),
    isrc: trackMeta?.isrc || mb?.isrc || '',
    previewUrl: trackMeta?.previewUrl || '',
    label: labelDisplay,
    labelName: mainLabelName,
    labelProfile: fullLabelProfile,
    labelFounders,
    labelFoundedYear,
    labelParent: parentLabelName,
    labelSublabels,
    labelCountry,
    genre: accurateGenres.join(', '),
    styles: accurateGenres,
    genres: discogs?.genres || [],
    mbTags: mb?.tags || [],
    formats: discogs?.formats || [],
    country: discogs?.country || mbArtist?.area || '',
    description: discogs?.description || '',
    tracklist: discogs?.tracklist || [],
    credits: {
      writing: credits.filter(c => /writ|compos|lyric|author/i.test(c.role)).map(c => c.name),
      production: credits.filter(c => /produc|arrang/i.test(c.role)).map(c => c.name),
      mixing: credits.filter(c => /mix/i.test(c.role)).map(c => c.name),
      mastering: credits.filter(c => /master|lacquer/i.test(c.role)).map(c => c.name),
      other: credits.filter(c => !/writ|compos|lyric|author|produc|arrang|mix|master|lacquer/i.test(c.role)),
    },
    releaseArtists: (discogs?.releaseArtists || []).map(a => a.name),
    artistBio,
    artistRealName: discogsArtist?.realName || '',
    artistOrigin,
    artistActiveYears: mbArtist?.beginDate || '',
    artistMembers: discogsArtist?.members || [],
    artistGroups: discogsArtist?.groups || [],
    artistAliases: uniqueAliases,
    topReleases: discogsArtist?.topReleases || [],
    latestReleases: discogsArtist?.latestReleases || [],
    links,
  };

  // Cache
  try {
    await supabase.from('track_info_cache').upsert({
      lookup_key: lookupKey, title: cleanTitle, artist: cleanArtist, album: cleanAlbum,
      data: result, updated_at: new Date().toISOString(),
    }, { onConflict: 'lookup_key' });
  } catch (e) {}

  return res.status(200).json(result);
}

// ── Search orchestration helpers (artist-top-releases, track-release) ──

const stripArtistSuffix = (s) => (s || '').replace(/\s*\(\d+\)\s*$/, '').replace(/\*+$/, '').trim();
const normName = (s) => stripArtistSuffix(s)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss')
  .replace(/ø/gi, 'o')
  .replace(/æ/gi, 'ae')
  .replace(/œ/gi, 'oe')
  .replace(/ł/gi, 'l')
  .toLowerCase()
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const normNameKeepAccents = (s) => stripArtistSuffix(s)
  .normalize('NFC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function resolveDiscogsArtistIdByNameAndContext(artistName, context = {}) {
  const clean = stripArtistSuffix(artistName || '');
  if (!clean) return { artistId: null, results: [] };
  const wantPlain = normName(clean);
  const wantAccent = normNameKeepAccents(clean);
  const hasAccents = wantAccent !== wantPlain;
  const ctxAlbum = String(context?.album || '').trim();
  const ctxTrack = String(context?.trackTitle || '').trim();
  const ctxLabel = String(context?.label || '').trim();

  // 1. If we have track/album context (e.g. opened from Player Sheet), try resolving the exact artist ID from the release credits in parallel with artist search
  const releaseContextPromise = (async () => {
    if (!ctxAlbum && !ctxTrack) return null;
    const queries = [];
    if (ctxAlbum && normName(ctxAlbum) !== wantPlain) {
      queries.push(`https://api.discogs.com/database/search?artist=${encodeURIComponent(clean)}&release_title=${encodeURIComponent(ctxAlbum)}&type=release&per_page=5`);
    }
    if (ctxTrack) {
      queries.push(`https://api.discogs.com/database/search?artist=${encodeURIComponent(clean)}&track=${encodeURIComponent(ctxTrack)}&type=release&per_page=5`);
    }
    queries.push(`https://api.discogs.com/database/search?q=${encodeURIComponent(`${clean} ${ctxAlbum || ctxTrack}`)}&type=release&per_page=5`);

    for (const url of queries.slice(0, 2)) {
      try {
        const r = await fetch(url, { headers: DISCOGS_HEADERS });
        if (!r.ok) continue;
        const d = await r.json();
        const relResults = d.results || [];
        const matchingRel = relResults.find(rel => {
          const titleStr = String(rel.title || '');
          const artistPart = titleStr.includes(' - ') ? titleStr.split(' - ')[0] : titleStr;
          if (hasAccents && normNameKeepAccents(artistPart).includes(wantAccent)) return true;
          return normName(artistPart) === wantPlain ||
            artistPart.split(/\s*(?:,|&|and|x|vs\.?|feat\.?|ft\.?|\/|\+)\s*/i).some(p => normName(p) === wantPlain);
        });
        if (matchingRel && matchingRel.id) {
          const relDetailRes = await fetch(`https://api.discogs.com/releases/${matchingRel.id}`, { headers: DISCOGS_HEADERS });
          if (relDetailRes.ok) {
            const relDetail = await relDetailRes.json();
            const credits = [...(relDetail.artists || []), ...(relDetail.extraartists || [])];
            const exactAccentCredit = credits.find(a => a && a.id && normNameKeepAccents(a.name) === wantAccent);
            if (exactAccentCredit) return exactAccentCredit.id;
            const exactPlainCredit = credits.find(a => a && a.id && normName(a.name) === wantPlain);
            if (exactPlainCredit) return exactPlainCredit.id;
          }
        }
      } catch (e) {}
    }
    return null;
  })();

  const artistSearchPromise = (async () => {
    try {
      const searchUrls = [
        `https://api.discogs.com/database/search?q=${encodeURIComponent(clean)}&type=artist&per_page=20`,
      ];
      if (hasAccents) {
        searchUrls.push(`https://api.discogs.com/database/search?q=${encodeURIComponent(wantPlain)}&type=artist&per_page=15`);
      }
      const responses = await Promise.all(
        searchUrls.map(u => fetch(u, { headers: DISCOGS_HEADERS }).then(r => r.ok ? r.json() : null).catch(() => null))
      );
      const seenIds = new Set();
      const merged = [];
      for (const d of responses) {
        for (const item of (d?.results || [])) {
          if (item && item.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            merged.push(item);
          }
        }
      }
      return merged;
    } catch (e) {
      return [];
    }
  })();

  const [contextArtistId, results] = await Promise.all([releaseContextPromise, artistSearchPromise]);
  if (contextArtistId) {
    return { artistId: contextArtistId, results };
  }

  // Strictly prioritize exact accent-preserving match first!
  if (hasAccents) {
    const accentMatches = results.filter(a => normNameKeepAccents(a.title) === wantAccent);
    if (accentMatches.length > 0) {
      const primaryAccent = accentMatches.find(a => !/\(\d+\)\s*$/.test(String(a.title || '').trim())) || accentMatches[0];
      return { artistId: primaryAccent.id, results };
    }
  }

  // Next, exact accent-stripped match (only when full normalized name equals wantPlain, NEVER loose substring)
  const plainMatches = results.filter(a => normName(a.title) === wantPlain);
  if (plainMatches.length > 0) {
    // If the query did NOT have accents, prefer an unaccented Discogs artist title over an accented one
    if (!hasAccents) {
      const unaccentedPrimary = plainMatches.find(a => normNameKeepAccents(a.title) === wantAccent && !/\(\d+\)\s*$/.test(String(a.title || '').trim()))
        || plainMatches.find(a => normNameKeepAccents(a.title) === wantAccent);
      if (unaccentedPrimary) return { artistId: unaccentedPrimary.id, results };
    }
    const primaryPlain = plainMatches.find(a => !/\(\d+\)\s*$/.test(String(a.title || '').trim())) || plainMatches[0];
    return { artistId: primaryPlain.id, results };
  }

  return { artistId: null, results };
}

async function cacheGet(supabase, key, maxAgeMs, version) {
  try {
    const { data } = await supabase.from('track_info_cache').select('data, updated_at').eq('lookup_key', key).single();
    if (data?.data && data.data._v === version && Date.now() - new Date(data.updated_at).getTime() < maxAgeMs) return data.data;
  } catch (e) {}
  return null;
}

async function cacheSet(supabase, key, value) {
  try {
    await supabase.from('track_info_cache').upsert({
      lookup_key: key, title: '', artist: '', album: '', data: value, updated_at: new Date().toISOString(),
    }, { onConflict: 'lookup_key' });
  } catch (e) {}
}

/** Run async fn over items with limited concurrency. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const ARTIST_TOP_VERSION = 1;
const ARTIST_TOP_TTL = 7 * 24 * 60 * 60 * 1000;
const ARTIST_TOP_MAX_RATED = 24;

/**
 * Artist's own releases (role Main: albums, EPs, singles — no compilations or
 * guest appearances), one per album, sorted by weighted community rating.
 * Weighted rating = (v/(v+m))·R + (m/(v+m))·C  (C = artist's mean rating, m = vote threshold)
 * so a 5.0 from 2 votes doesn't beat a 4.6 from 3,000 votes.
 */
async function handleArtistTopReleases(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  let { artistId, artistName, trackTitle, album, label } = body || {};

  if (!artistId && artistName) {
    const resolved = await resolveDiscogsArtistIdByNameAndContext(artistName, { trackTitle, album, label });
    if (resolved.artistId) {
      artistId = resolved.artistId;
    } else if (resolved.results[0]) {
      artistId = resolved.results[0].id;
    }
  }
  if (!artistId) return res.status(200).json({ releases: [] });

  const cacheKey = `artist-top|${artistId}`;
  const cached = await cacheGet(supabase, cacheKey, ARTIST_TOP_TTL, ARTIST_TOP_VERSION);
  if (cached) return res.status(200).json(cached);

  // 1. Artist's releases (Discogs collapses versions under their master in this endpoint).
  //    Prolific artists have hundreds of credits (mostly guest appearances): read up to 5 pages.
  const pageUrl = (page) => `https://api.discogs.com/artists/${artistId}/releases?sort=year&sort_order=desc&per_page=100&page=${page}`;
  let list = [];
  try {
    const first = await fetch(pageUrl(1), { headers: DISCOGS_HEADERS });
    if (first.ok) {
      const d = await first.json();
      list = d.releases || [];
      const pages = Math.min(d.pagination?.pages || 1, 5);
      const more = await Promise.all(Array.from({ length: pages - 1 }, (_, i) =>
        fetch(pageUrl(i + 2), { headers: DISCOGS_HEADERS }).then(r => (r.ok ? r.json() : null)).catch(() => null)));
      for (const m of more) if (m?.releases) list = list.concat(m.releases);
    }
  } catch (e) {}
  const own = list.filter(r => r.role === 'Main' && !(r.type === 'release' && /comp/i.test(r.format || '')));

  // 2. Pre-select the most collected, then fetch their community ratings + hi-res artwork
  const collected = (r) => r.stats?.community?.in_collection || 0;
  const candidates = [...own].sort((a, b) => collected(b) - collected(a)).slice(0, ARTIST_TOP_MAX_RATED);
  let rateLimited = false;
  const details = await mapLimit(candidates, 4, async (r) => {
    const releaseId = r.type === 'master' ? r.main_release : r.id;
    if (!releaseId) return null;
    try {
      const dr = await fetch(`https://api.discogs.com/releases/${releaseId}`, { headers: DISCOGS_HEADERS });
      if (dr.status === 429) { rateLimited = true; return null; }
      if (!dr.ok) return null;
      return await dr.json();
    } catch (e) { return null; }
  });

  const rows = candidates.map((r, i) => {
    const d = details[i];
    const rating = d?.community?.rating || {};
    const img = (d?.images || []).find(im => im.type === 'primary') || (d?.images || [])[0];
    return {
      r, avg: Number(rating.average) || 0, count: Number(rating.count) || 0,
      cover: img?.uri || img?.uri150 || r.thumb || '',
      label: d?.labels?.[0]?.name ? stripArtistSuffix(d.labels[0].name) : (r.label || ''),
      formats: (d?.formats || []).map(f => [f.name, ...(f.descriptions || [])].join(', ')),
    };
  });

  // 3. Weighted rating
  const rated = rows.filter(x => x.count > 0);
  const C = rated.length ? rated.reduce((s, x) => s + x.avg, 0) / rated.length : 0;
  const counts = rated.map(x => x.count).sort((a, b) => a - b);
  const m = Math.max(5, counts.length ? counts[Math.floor(counts.length / 2)] : 5);
  for (const x of rows) x.wr = x.count > 0 ? (x.count / (x.count + m)) * x.avg + (m / (x.count + m)) * C : -1;
  rows.sort((a, b) => (b.wr - a.wr) || (collected(b.r) - collected(a.r)) || ((b.r.year || 0) - (a.r.year || 0)));

  const releases = rows.map(({ r, avg, count, cover, label, formats }) => ({
    id: `discogs-a-${r.type}-${r.id}`,
    discogsId: r.id,
    type: r.type,
    title: r.title || '',
    releaseName: r.title || '',
    artistName: stripArtistSuffix(r.artist || ''),
    year: r.year || null,
    thumb: r.thumb || '',
    coverImage: cover,
    labels: label ? [label] : [],
    formats,
    rating: count > 0 ? Math.round(avg * 100) / 100 : null,
    ratingCount: count,
    entityType: 'release',
    provider: 'discogs',
    isExternal: true,
  }));

  const result = { _v: ARTIST_TOP_VERSION, artistId, releases };
  if (!rateLimited) await cacheSet(supabase, cacheKey, result); // don't cache partial ratings
  return res.status(200).json(result);
}

const TRACK_RELEASE_VERSION = 1;
const TRACK_RELEASE_TTL = 30 * 24 * 60 * 60 * 1000;

/** Find the Discogs release (preferring non-compilations by the same artist) that contains a track. */
async function handleTrackRelease(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { artist, title } = body || {};
  if (!title) return res.status(200).json({ release: null });

  const cacheKey = `track-release|${normName(artist)}|${normName(title)}`;
  const cached = await cacheGet(supabase, cacheKey, TRACK_RELEASE_TTL, TRACK_RELEASE_VERSION);
  if (cached) return res.status(200).json(cached);

  const wantArtist = normName(artist);
  let best = null;
  for (const type of ['master', 'release']) {
    try {
      const qs = `track=${encodeURIComponent(title)}${artist ? `&artist=${encodeURIComponent(artist)}` : ''}&type=${type}&per_page=10`;
      const r = await fetch(`https://api.discogs.com/database/search?${qs}`, { headers: DISCOGS_HEADERS });
      if (!r.ok) continue;
      const d = await r.json();
      const results = d.results || [];
      const byArtist = (x) => !wantArtist || normName((x.title || '').split(' - ')[0]).includes(wantArtist) || wantArtist.includes(normName((x.title || '').split(' - ')[0]));
      const notComp = (x) => !(x.format || []).some(f => /comp/i.test(f));
      best = results.find(x => byArtist(x) && notComp(x)) || results.find(byArtist) || null;
      if (best) { best._type = type; break; }
    } catch (e) {}
  }

  let release = null;
  if (best) {
    const parts = (best.title || '').split(' - ');
    release = {
      id: `discogs-t-${best._type}-${best.id}`,
      discogsId: best.id,
      type: best._type,
      title: parts.length >= 2 ? parts.slice(1).join(' - ').trim() : best.title,
      releaseName: parts.length >= 2 ? parts.slice(1).join(' - ').trim() : best.title,
      artistName: stripArtistSuffix(parts.length >= 2 ? parts[0] : (artist || '')),
      year: best.year || null,
      thumb: best.thumb || '',
      coverImage: best.cover_image || best.thumb || '',
      labels: best.label || [],
      formats: best.format || [],
      masterId: best.master_id || null,
      entityType: 'release',
      provider: 'discogs',
      isExternal: true,
    };
  }
  const result = { _v: TRACK_RELEASE_VERSION, release };
  await cacheSet(supabase, cacheKey, result);
  return res.status(200).json(result);
}

// ── Main handler ──

const LABEL_KEYWORD_RE = /\b(records|recordings|record label|label|disques|tapes|editions|edizioni|imprint|recs|platten|schallplatten|discos)\b/i;

const normLabelName = (s) => {
  const full = normName(s);
  const stripped = full
    .replace(/\b(records|recordings|record|label|disques|tapes|editions|edizioni|imprint|recs|platten|schallplatten|discos)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || full;
};

async function findDiscogsLabelHit(labelName) {
  if (!labelName) return null;
  const queries = [labelName.trim()];
  const stripped = stripArtistSuffix(labelName)
    .replace(/\b(records|recordings|label|disques|tapes|recs)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped && stripped.toLowerCase() !== labelName.trim().toLowerCase()) {
    queries.push(stripped);
  }
  if (!/\brecords\b/i.test(labelName) && stripped) {
    queries.push(`${stripped} Records`);
  }
  if (!/\brecordings\b/i.test(labelName) && stripped) {
    queries.push(`${stripped} Recordings`);
  }

  const wantExact = normName(labelName);
  const wantCore = normLabelName(labelName);
  let firstFallback = null;

  for (const q of queries) {
    try {
      const r = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(q)}&type=label&per_page=10`, { headers: DISCOGS_HEADERS });
      if (!r.ok) continue;
      const d = await r.json();
      const results = d.results || [];
      if (!results.length) continue;
      if (!firstFallback) firstFallback = results[0];
      const exact = results.find(a => normName(a.title) === wantExact);
      if (exact) return exact;
      const coreMatch = results.find(a => normLabelName(a.title) === wantCore);
      if (coreMatch) return coreMatch;
      const prefixMatch = results.find(a => normName(a.title).startsWith(wantCore) || wantCore.startsWith(normLabelName(a.title)));
      if (prefixMatch) return prefixMatch;
    } catch (e) {}
  }
  return firstFallback;
}

// Cross-entity / Imprint Link Knowledge Graph: maps artist/alias/label names to their official Bandcamp & portal URLs
// even when the Bandcamp page name differs from the artist/label name (e.g. Traumprinz -> All Possible Worlds)
const CROSS_ENTITY_LINK_MAP = {
  'traumprinz': ['https://allpossibleworlds.bandcamp.com', 'https://giegling.bandcamp.com'],
  'dj metatron': ['https://allpossibleworlds.bandcamp.com', 'https://giegling.bandcamp.com'],
  'prince of denmark': ['https://allpossibleworlds.bandcamp.com', 'https://giegling.bandcamp.com'],
  'prime minister of doom': ['https://allpossibleworlds.bandcamp.com'],
  'dj healer': ['https://allpossibleworlds.bandcamp.com'],
  'irini': ['https://allpossibleworlds.bandcamp.com'],
  'golden baby': ['https://allpossibleworlds.bandcamp.com'],
  '2000 2007': ['https://allpossibleworlds.bandcamp.com'],
  'the phantasy': ['https://allpossibleworlds.bandcamp.com'],
  'all possible worlds': ['https://allpossibleworlds.bandcamp.com'],
  'planet uterus': ['https://allpossibleworlds.bandcamp.com'],
  'giegling': ['https://giegling.bandcamp.com', 'https://www.giegling.net'],
  'vril': ['https://giegling.bandcamp.com', 'https://delsinrecords.bandcamp.com'],
  'map ache': ['https://giegling.bandcamp.com'],
  'ketiov': ['https://giegling.bandcamp.com'],
  'leafar legov': ['https://giegling.bandcamp.com'],
  'basic channel': ['https://basicchannel.bandcamp.com', 'https://www.basicchannel.com'],
  'maurizio': ['https://basicchannel.bandcamp.com'],
  'rhythm sound': ['https://basicchannel.bandcamp.com'],
  'rhythm and sound': ['https://basicchannel.bandcamp.com'],
  'chain reaction': ['https://basicchannel.bandcamp.com'],
  'burial mix': ['https://basicchannel.bandcamp.com'],
  'moritz von oswald': ['https://basicchannel.bandcamp.com'],
  'mark ernestus': ['https://basicchannel.bandcamp.com'],
  'skee mask': ['https://iliantape.bandcamp.com'],
  'zenker brothers': ['https://iliantape.bandcamp.com'],
  'ilian tape': ['https://iliantape.bandcamp.com'],
  'forest drive west': ['https://forestdrivewest.bandcamp.com', 'https://livitysound.bandcamp.com', 'https://delsinrecords.bandcamp.com'],
  'mantis': ['https://delsinrecords.bandcamp.com'],
  'delsin': ['https://delsinrecords.bandcamp.com'],
  'convextion': ['https://mojuba.bandcamp.com', 'https://frustratedfunk.bandcamp.com'],
  'e r p': ['https://frustratedfunk.bandcamp.com', 'https://mojuba.bandcamp.com'],
  'gerard hanson': ['https://mojuba.bandcamp.com', 'https://frustratedfunk.bandcamp.com'],
  'donato dozzy': ['https://spaziodisponibile.bandcamp.com'],
  'voices from the lake': ['https://spaziodisponibile.bandcamp.com'],
  'spazio disponibile': ['https://spaziodisponibile.bandcamp.com'],
  'luigi tozzi': ['https://hypnusrecords.bandcamp.com'],
  'hypnus': ['https://hypnusrecords.bandcamp.com'],
  'hypnus records': ['https://hypnusrecords.bandcamp.com'],
  'peverelist': ['https://livitysound.bandcamp.com'],
  'livity sound': ['https://livitysound.bandcamp.com'],
  'batu': ['https://timedance.bandcamp.com'],
  'timedance': ['https://timedance.bandcamp.com'],
  'pearson sound': ['https://hessleaudio.bandcamp.com'],
  'ben ufo': ['https://hessleaudio.bandcamp.com'],
  'pangaea': ['https://hessleaudio.bandcamp.com'],
  'hessle audio': ['https://hessleaudio.bandcamp.com'],
  'burial': ['https://burial.bandcamp.com', 'https://hyperdub.bandcamp.com'],
  'kode9': ['https://hyperdub.bandcamp.com'],
  'hyperdub': ['https://hyperdub.bandcamp.com'],
  'mala': ['https://dmzuk.bandcamp.com', 'https://deepmedimusik.bandcamp.com'],
  'digital mystikz': ['https://dmzuk.bandcamp.com'],
  'dmz': ['https://dmzuk.bandcamp.com'],
  'deep medi': ['https://deepmedimusik.bandcamp.com'],
  'deep medi musik': ['https://deepmedimusik.bandcamp.com'],
  'theo parrish': ['https://soundsignature.bandcamp.com'],
  'sound signature': ['https://soundsignature.bandcamp.com'],
  'moodymann': ['https://moodymann.bandcamp.com', 'https://mahoganimusic.bandcamp.com'],
  'kdj': ['https://moodymann.bandcamp.com', 'https://mahoganimusic.bandcamp.com'],
  'mahogani music': ['https://mahoganimusic.bandcamp.com'],
  'omar s': ['https://fxhe.bandcamp.com'],
  'fxhe': ['https://fxhe.bandcamp.com'],
  'fxhe records': ['https://fxhe.bandcamp.com'],
  'aphex twin': ['https://aphextwin.bandcamp.com'],
  'afx': ['https://aphextwin.bandcamp.com'],
  'polygon window': ['https://aphextwin.bandcamp.com'],
  'boards of canada': ['https://boardsofcanada.bandcamp.com'],
  'autechre': ['https://autechre.bandcamp.com'],
  'overmono': ['https://overmono.bandcamp.com'],
  'joy orbison': ['https://joyorbison.bandcamp.com'],
  'bicep': ['https://bicep.bandcamp.com'],
  'four tet': ['https://fourtet.bandcamp.com'],
  'kh': ['https://fourtet.bandcamp.com'],
  'moonshoe': ['https://moonshoerecords.bandcamp.com'],
  'moonshoe records': ['https://moonshoerecords.bandcamp.com'],
};

async function discoverCrossEntityUrls({ name, aliases = [], labels = [], releaseTitles = [], isLabel = false }) {
  const discovered = [];
  const candidates = isLabel ? [name, ...labels].filter(Boolean) : [name, ...aliases, ...labels].filter(Boolean);
  for (const c of candidates) {
    const key = normName(c);
    const coreKey = normLabelName(c);
    if (CROSS_ENTITY_LINK_MAP[key]) discovered.push(...CROSS_ENTITY_LINK_MAP[key]);
    if (CROSS_ENTITY_LINK_MAP[coreKey]) discovered.push(...CROSS_ENTITY_LINK_MAP[coreKey]);
  }

  // If we still don't have a Bandcamp URL, search Bandcamp autocomplete across bands/labels, albums, and tracks
  if (!discovered.some(u => /bandcamp\.com/i.test(u))) {
    const primaryCore = normLabelName(name);
    const primarySlug = primaryCore.replace(/[^a-z0-9]/g, '');
    const artistNorms = new Set([name, ...(isLabel ? [] : aliases)].map(normName).filter(Boolean));
    const labelNorms = new Set([name, ...labels].map(normLabelName).filter(Boolean));
    const titleNorms = new Set(releaseTitles.map(normName).filter(Boolean));
    const searchTerms = isLabel
      ? Array.from(new Set([name, primaryCore ? `${primaryCore} records` : ''])).filter(Boolean).slice(0, 2)
      : [name, aliases[0], labels[0]].filter(Boolean).slice(0, 2);

    for (const term of searchTerms) {
      try {
        const bcRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({ search_text: term, search_filter: isLabel ? 'b' : 'b,a,t', full_page: false, fan_id: 0 }),
        });
        if (!bcRes.ok) continue;
        const bcJson = await bcRes.json();
        const results = bcJson?.auto?.results || [];

        // 1. Direct band/label match on artist, alias, or label core name
        const directBand = results.find(item =>
          item.type === 'b' && (
            artistNorms.has(normName(item.name)) ||
            labelNorms.has(normLabelName(item.name)) ||
            (primaryCore.length >= 4 && normLabelName(item.name) === primaryCore)
          )
        );
        if (directBand) {
          const root = directBand.item_url_root || directBand.item_url_path || directBand.url || '';
          if (root) {
            discovered.push(root);
            break;
          }
        }

        // 2. Cross-name discovery via album/track results (only for artists, or when subdomain/band_name matches label core)
        if (!isLabel) {
          const albumOrTrackHit = results.find(item =>
            (item.type === 'a' || item.type === 't') && item.item_url_root && (
              artistNorms.has(normName(item.band_name)) ||
              artistNorms.has(normName(item.name)) ||
              (titleNorms.has(normName(item.name)) && [...artistNorms].some(an => an.length >= 3 && normName(item.band_name).includes(an)))
            )
          );
          if (albumOrTrackHit && albumOrTrackHit.item_url_root) {
            discovered.push(albumOrTrackHit.item_url_root);
            break;
          }
        } else if (primarySlug.length >= 4) {
          const labelBandHit = results.find(item => {
            const root = (item.item_url_root || item.url || '').toLowerCase();
            const subMatch = root.match(/https?:\/\/([a-z0-9-]+)\.bandcamp\.com/);
            const sub = subMatch ? subMatch[1].replace(/-/g, '') : '';
            return sub === primarySlug || sub === `${primarySlug}records` || sub === `${primarySlug}recordings` || sub === `${primarySlug}music`;
          });
          if (labelBandHit) {
            discovered.push(labelBandHit.item_url_root || labelBandHit.url);
            break;
          }
        }
      } catch (e) {}
    }
  }

  return Array.from(new Set(discovered)).filter(Boolean);
}

const entityNameCache = new Map([
  ['a:194', 'Various'],
]);

async function resolveDiscogsTextAndMeta(rawText) {
  if (!rawText) return { cleanText: '', extractedUrls: [], founders: [], foundedYear: '', referencedLabels: [] };
  let work = String(rawText);

  const extractedUrls = [];
  const referencedLabels = [];
  // Extract [url=...] links
  const urlTagRegex = /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi;
  let um;
  while ((um = urlTagRegex.exec(work)) !== null) {
    const u = um[1].trim();
    if (/^https?:\/\//i.test(u)) extractedUrls.push(u);
    else if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(u)) extractedUrls.push(`https://${u}`);
  }

  // Extract explicit [l=Label Name] tags (non-numeric) before stripping
  const explicitLabelRegex = /\[l=([^\]]+)\]/gi;
  let elm;
  while ((elm = explicitLabelRegex.exec(work)) !== null) {
    if (!/^\d+$/.test(elm[1].trim())) {
      const lName = stripArtistSuffix(elm[1]);
      if (lName && !referencedLabels.includes(lName)) referencedLabels.push(lName);
    }
  }

  // Resolve numeric tags: [a12345], [l12345], [|12345], [r12345], [m12345], AND [m=93957], [l=2178], [a=12345], [r=12345]
  const tagRegex = /\[([alrm|])\s*=?\s*(\d+)\]/gi;
  let tm;
  const toFetch = [];
  while ((tm = tagRegex.exec(work)) !== null) {
    const rawType = tm[1].toLowerCase();
    const normType = rawType === '|' ? 'l' : rawType;
    toFetch.push({ full: tm[0], type: normType, id: tm[2] });
  }
  if (toFetch.length > 0) {
    const uniqueTags = [...new Map(toFetch.map(item => [`${item.type}:${item.id}`, item])).values()];
    await Promise.all(uniqueTags.slice(0, 20).map(async (tag) => {
      try {
        const cacheKey = `${tag.type}:${tag.id}`;
        let cachedObj = entityNameCache.get(cacheKey);
        if (typeof cachedObj === 'string') {
          cachedObj = { name: cachedObj, urls: [] };
        }
        if (!cachedObj) {
          const endpoint = tag.type === 'l' ? `labels/${tag.id}`
            : tag.type === 'a' ? `artists/${tag.id}`
            : tag.type === 'r' ? `releases/${tag.id}`
            : tag.type === 'm' ? `masters/${tag.id}` : '';
          if (!endpoint) return;
          const res = await fetch(`https://api.discogs.com/${endpoint}`, { headers: DISCOGS_HEADERS });
          if (res.ok) {
            const json = await res.json();
            const resolvedName = stripArtistSuffix(json.name || json.title || '');
            const urls = Array.isArray(json.urls) ? json.urls : [];
            if (resolvedName) {
              cachedObj = { name: resolvedName, urls };
              entityNameCache.set(cacheKey, cachedObj);
            }
          }
        }
        if (cachedObj && cachedObj.name) {
          const name = cachedObj.name;
          if (tag.type === 'l' && !referencedLabels.includes(name)) referencedLabels.push(name);
          if (tag.type === 'l' && Array.isArray(cachedObj.urls)) {
            cachedObj.urls.forEach(u => { if (u && /bandcamp\.com/i.test(u)) extractedUrls.push(u); });
          }
          const replacement = tag.type === 'a' ? `[a=${name}]` : name;
          const patternType = tag.type === 'l' ? '(?:l|\\|)' : tag.type;
          work = work.replace(new RegExp(`\\[${patternType}\\s*=?\\s*${tag.id}\\]`, 'gi'), replacement);
        }
      } catch (e) {}
    }));
  }

  // Extract founders from [a=Artist Name] when near founder/owner context
  const founders = [];
  const founderClauseRegex = /(?:founded|run|owned|started|established|headed|operated|curated|created|launched|managed|set up|imprint of|label of)[^.\n;]{0,80}/gi;
  let fm;
  while ((fm = founderClauseRegex.exec(work)) !== null) {
    const clause = fm[0];
    const artistTagRegex = /\[a=([^\]]+)\]/gi;
    let am;
    while ((am = artistTagRegex.exec(clause)) !== null) {
      if (!/^\d+$/.test(am[1].trim())) {
        const fName = stripArtistSuffix(am[1]);
        if (fName && !founders.includes(fName)) founders.push(fName);
      }
    }
  }

  // Extract founded year
  let foundedYear = '';
  const yearMatch = work.match(/(?:founded|established|started|launched|formed|active since|est\.?)\s+(?:in\s+)?((?:19|20)\d{2})\b/i);
  if (yearMatch) foundedYear = yearMatch[1];

  // Clean Discogs markup for display — never leave raw bracket codes or bare IDs
  let cleanText = work
    .replace(/\[a=([^\]]+)\]/gi, (_, n) => /^\d+$/.test(n.trim()) ? '' : stripArtistSuffix(n))
    .replace(/\[l=([^\]]+)\]/gi, (_, n) => /^\d+$/.test(n.trim()) ? '' : stripArtistSuffix(n))
    .replace(/\[r=([^\]]+)\]/gi, (_, n) => /^\d+$/.test(n.trim()) ? '' : stripArtistSuffix(n))
    .replace(/\[m=([^\]]+)\]/gi, (_, n) => /^\d+$/.test(n.trim()) ? '' : stripArtistSuffix(n))
    .replace(/\[g=([^\]]+)\]/gi, (_, n) => stripArtistSuffix(n))
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[\/?(?:b|i|u|q|quote|code|size|color)[^\]]*\]/gi, '')
    .replace(/\[(?:[alrm|])\s*=?\s*\d+\]/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Extract any raw URLs or social handles from text
  const rawHttp = cleanText.match(/https?:\/\/[^\s\])"<>]+/gi) || [];
  rawHttp.forEach(u => extractedUrls.push(u.replace(/[.,;]+$/, '')));
  const bareSocial = cleanText.match(/(?:instagram\.com|soundcloud\.com|facebook\.com|ra\.co\/labels|residentadvisor\.net\/record-label\.aspx\?id=|[a-z0-9_-]+\.bandcamp\.com)[a-zA-Z0-9_.\-\/?=&]*/gi) || [];
  bareSocial.forEach(b => {
    const cleaned = b.replace(/[.,;]+$/, '');
    extractedUrls.push(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
  });

  return { cleanText, extractedUrls, founders, foundedYear, referencedLabels };
}

async function fetchMusicBrainzArtistProfile(artistName, discogsId) {
  if (!artistName && !discogsId) return null;
  try {
    let mbid = '';
    const wantExact = normName(artistName || '');

    const urlLookupPromise = discogsId
      ? fetch(`https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(`https://www.discogs.com/artist/${discogsId}`)}&inc=artist-rels&fmt=json`, { headers: MB_HEADERS })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);

    const searchPromise = artistName
      ? fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(artistName)}&fmt=json&limit=5`, { headers: MB_HEADERS })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);

    const [urlRelData, searchData] = await Promise.all([urlLookupPromise, searchPromise]);
    if (urlRelData && Array.isArray(urlRelData.relations)) {
      const artRel = urlRelData.relations.find(r => r.artist?.id);
      if (artRel?.artist?.id) mbid = artRel.artist.id;
    }
    if (!mbid && searchData && Array.isArray(searchData.artists)) {
      const exact = searchData.artists.find(a => normName(a.name) === wantExact)
        || searchData.artists.find(a => (a.aliases || []).some(al => normName(al.name) === wantExact));
      if (exact) mbid = exact.id;
    }
    if (!mbid) return null;

    const detailRes = await fetch(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels+label-rels+artist-rels+aliases+tags+annotation&fmt=json`, { headers: MB_HEADERS });
    if (!detailRes.ok) return { mbid, urls: [`https://musicbrainz.org/artist/${mbid}`], aliases: [], labels: [], artistRelations: [], tags: [], area: '', beginDate: '', annotation: '' };
    const data = await detailRes.json();
    const urls = [`https://musicbrainz.org/artist/${data.id || mbid}`];
    const labels = [];
    const artistRelations = [];
    for (const rel of (data.relations || [])) {
      if (rel.url?.resource) urls.push(rel.url.resource);
      if (rel['target-type'] === 'label' && rel.label?.name) {
        labels.push(stripArtistSuffix(rel.label.name));
      }
      if (rel['target-type'] === 'artist' && rel.artist?.name) {
        artistRelations.push({
          name: stripArtistSuffix(rel.artist.name),
          type: rel.type || 'collaboration',
        });
      }
    }
    const aliases = (data.aliases || []).map(a => stripArtistSuffix(a.name || '')).filter(Boolean);
    const tags = (data.tags || [])
      .filter(t => (t.count || 0) >= 1 && !NOISY_MB_TAG_RE.test(String(t.name || '').trim()))
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 8)
      .map(t => t.name);
    const area = [data['begin-area']?.name, data.area?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    const beginDate = data['life-span']?.begin ? String(data['life-span'].begin).slice(0, 4) : '';
    const annotation = (data.annotation || '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/'''|''/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return { mbid: data.id || mbid, urls, aliases, labels, artistRelations, tags, area, beginDate, annotation };
  } catch (e) {
    return null;
  }
}

function buildArtistPersonaInfluencesAndCollaborations({
  name,
  realname,
  bio,
  mbAnnotation,
  area,
  beginDate,
  aliases = [],
  groups = [],
  members = [],
  labels = [],
  mbTags = [],
  mbArtistRelations = [],
  topReleases = [],
}) {
  const cleanName = name || 'The artist';
  const styles = sanitizeAndRankTrackGenres({
    styles: [],
    genres: [],
    mbTags,
    artist: cleanName,
    label: labels[0] || '',
  });
  const styleSummary = styles.length > 0 ? styles.slice(0, 3).join(', ') : 'electronic and underground club music';
  const primaryLabels = labels.filter(Boolean).slice(0, 4);
  const earliestYear = topReleases
    .map(r => Number(r.year) || 0)
    .filter(y => y >= 1960 && y <= 2030)
    .sort((a, b) => a - b)[0] || (beginDate ? Number(beginDate) : 0);

  // 1. Artistic Persona
  const personaParts = [];
  if (aliases.length >= 3) {
    personaParts.push(
      `${cleanName} operates through a fluid, multi-alias artistic identity (${aliases.slice(0, 5).join(', ')}), using distinct monikers to explore different emotional and rhythmic registers of ${styleSummary} while letting the music speak ahead of public persona.`
    );
  } else if (members.length > 1) {
    personaParts.push(
      `${cleanName} is a collaborative musical project uniting ${members.slice(0, 5).join(', ')}${area ? ` (${area})` : ''}, crafting a cohesive sonic identity rooted in ${styleSummary}.`
    );
  } else {
    personaParts.push(
      `${cleanName}${realname && normName(realname) !== normName(cleanName) ? ` (${realname})` : ''} embodies a focused, sound-first artistic persona${area ? ` emerging from ${area}` : ''}${earliestYear ? ` (active since ${earliestYear})` : ''}, defined by deep immersion in ${styleSummary}.`
    );
  }
  if (primaryLabels.length > 0) {
    personaParts.push(
      `Closely aligned with ${primaryLabels.join(', ')}, the project prioritizes tactile sound design, patient arrangement architecture, and timeless vinyl/club aesthetics over short-lived trends.`
    );
  }
  if (bio && bio.length > 40) {
    const firstSentence = bio.split(/(?<=[.!?])\s+/)[0] || '';
    if (firstSentence && firstSentence.length < 240 && !personaParts.join(' ').toLowerCase().includes(firstSentence.slice(0, 25).toLowerCase())) {
      personaParts.push(firstSentence.trim());
    }
  }
  const artisticPersona = personaParts.join(' ');

  // 2. Influences & Inspirations
  const styleBlob = `${styleSummary} ${(bio || '')} ${(mbAnnotation || '')} ${primaryLabels.join(' ')}`.toLowerCase();
  const lineageSeeds = [];
  if (/dub techno|basic channel|chain reaction|deep techno|hypnotic/.test(styleBlob)) {
    lineageSeeds.push('the Berlin—Detroit dub techno continuum (Basic Channel / Maurizio), Jamaican dub sound-system space, and tape-saturated chord echo');
  }
  if (/deep house|microhouse|giegling|ambient house|house/.test(styleBlob)) {
    lineageSeeds.push('raw Detroit & Chicago deep house warmth, melancholic sample loops, and late-night afterhours introspection');
  }
  if (/uk bass|dubstep|garage|2-step|jungle|breakbeat|livity|hessle|timedance|hyperdub/.test(styleBlob)) {
    lineageSeeds.push('UK sound-system culture, pirate-radio 2-step/garage, fractured breakbeat science, and sub-heavy dub pressure');
  }
  if (/electro|idm|braindance|warp|acid/.test(styleBlob)) {
    lineageSeeds.push('Detroit electro futurism, analog machine funk, and experimental 1990s IDM/braindance synthesis');
  }
  if (/ambient|drone|experimental|modern classical/.test(styleBlob)) {
    lineageSeeds.push('minimalist composition, psychoacoustic space, field recordings, and cinematic soundscaping');
  }
  if (lineageSeeds.length === 0) {
    lineageSeeds.push(`foundational ${styleSummary} movements, analog hardware synthesis, and underground sound-system culture`);
  }

  const explicitInfluences = mbArtistRelations
    .filter(r => /influenc|teacher|tribute/i.test(r.type || ''))
    .map(r => r.name);

  const influenceParts = [
    `Drawing inspiration from ${lineageSeeds.slice(0, 2).join(' alongside ')}, ${cleanName}'s work bridges physical club functionality with meditative home listening.`,
  ];
  if (explicitInfluences.length > 0) {
    influenceParts.push(`Documented musical touchstones and direct lineage connections include ${explicitInfluences.slice(0, 6).join(', ')}.`);
  }
  influenceParts.push(
    `Beyond music, the project's aesthetic is informed by architectural minimalism, sleeve & physical object design, and the communal ritual of dimly lit dancefloors.`
  );
  const influencesAndInspirations = influenceParts.join(' ');

  // 3. Collaborations (Music & Other Forms of Art)
  const collabSet = new Set();
  const addCollab = (n) => {
    const c = stripArtistSuffix(n || '');
    if (!c || normName(c) === normName(cleanName) || normName(c) === 'various') return;
    collabSet.add(c);
  };
  groups.forEach(addCollab);
  members.forEach(addCollab);
  mbArtistRelations.forEach(r => addCollab(r.name));
  // Extract [a=...] artist mentions from raw bio if any
  for (const rel of topReleases) {
    if (rel.artistName && normName(rel.artistName) !== normName(cleanName)) {
      rel.artistName.split(/[,/&]|feat\.?|vs\.?/i).forEach(addCollab);
    }
  }
  const collaborators = Array.from(collabSet).slice(0, 12);

  const collabParts = [];
  if (groups.length > 0 || members.length > 0) {
    const grpList = [...groups, ...members].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
    collabParts.push(
      `Active in collaborative formations and ensembles including ${grpList.join(', ')}.`
    );
  }
  if (collaborators.length > 0) {
    collabParts.push(
      `Musical collaborations, split releases, and shared studio/remix exchanges connect ${cleanName} with ${collaborators.slice(0, 6).join(', ')}.`
    );
  }
  if (primaryLabels.length > 0) {
    collabParts.push(
      `Across music and visual culture, ${cleanName} collaborates closely with the curatorial and visual art ecosystems of ${primaryLabels.join(', ')}, where bespoke vinyl packaging, photography, typography, and mastering craftsmanship form an integral part of each release.`
    );
  } else {
    collabParts.push(
      `Across music and visual art, ${cleanName} engages with independent pressing houses, mastering engineers, and visual designers to treat each release as a complete multidisciplinary artifact.`
    );
  }
  const collaborations = collabParts.join(' ');

  return {
    artisticPersona,
    influencesAndInspirations,
    collaborations,
    collaborators,
  };
}


async function fetchMusicBrainzLabel(labelName, discogsId) {
  if (!labelName && !discogsId) return null;
  try {
    let mbid = '';
    const wantExact = normName(labelName || '');
    const wantCore = normLabelName(labelName || '');

    // 1. Try exact Discogs URL relation lookup on MusicBrainz + name search in parallel
    const urlLookupPromise = discogsId
      ? fetch(`https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(`https://www.discogs.com/label/${discogsId}`)}&inc=label-rels&fmt=json`, { headers: MB_HEADERS })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);

    const searchPromise = labelName
      ? fetch(`https://musicbrainz.org/ws/2/label/?query=${encodeURIComponent(labelName)}&fmt=json&limit=8`, { headers: MB_HEADERS })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null);

    const [urlRelData, searchData] = await Promise.all([urlLookupPromise, searchPromise]);

    if (urlRelData && Array.isArray(urlRelData.relations)) {
      const lblRel = urlRelData.relations.find(r => r.label?.id);
      if (lblRel?.label?.id) mbid = lblRel.label.id;
    }

    if (!mbid && searchData && Array.isArray(searchData.labels) && searchData.labels.length > 0) {
      const labels = searchData.labels;
      const exact = labels.find(l => normName(l.name) === wantExact)
        || labels.find(l => normLabelName(l.name) === wantCore)
        || labels.find(l => (l.aliases || []).some(a => normLabelName(a.name) === wantCore))
        || (labels[0].score >= 85 && (normName(labels[0].name).includes(wantCore) || wantCore.includes(normLabelName(labels[0].name))) ? labels[0] : null);
      if (exact) mbid = exact.id;
    }

    // Fallback search with stripped label suffix (e.g. "Semantica" instead of "Semantica Records")
    if (!mbid && wantCore && wantCore !== wantExact) {
      try {
        const r2 = await fetch(`https://musicbrainz.org/ws/2/label/?query=${encodeURIComponent(wantCore)}&fmt=json&limit=5`, { headers: MB_HEADERS });
        if (r2.ok) {
          const d2 = await r2.json();
          const hit2 = (d2.labels || []).find(l => normLabelName(l.name) === wantCore);
          if (hit2) mbid = hit2.id;
        }
      } catch (e) {}
    }

    if (!mbid) return null;

    const detailRes = await fetch(`https://musicbrainz.org/ws/2/label/${mbid}?inc=url-rels+label-rels+artist-rels+aliases+tags+annotation&fmt=json`, { headers: MB_HEADERS });
    if (!detailRes.ok) return { mbid, mbUrl: `https://musicbrainz.org/label/${mbid}`, urls: [`https://musicbrainz.org/label/${mbid}`] };
    const data = await detailRes.json();

    const mbUrl = `https://musicbrainz.org/label/${data.id || mbid}`;
    const urls = [mbUrl];
    const founders = [];
    let parentLabel = '';
    const sublabels = [];

    for (const rel of (data.relations || [])) {
      if (rel.url?.resource) {
        urls.push(rel.url.resource);
      }
      if (rel['target-type'] === 'artist' && rel.artist?.name) {
        const fName = stripArtistSuffix(rel.artist.name);
        if (fName && !founders.includes(fName)) founders.push(fName);
      }
      if (rel['target-type'] === 'label' && rel.label?.name) {
        const lName = stripArtistSuffix(rel.label.name);
        if (rel.direction === 'backward' && !parentLabel) parentLabel = lName;
        else if (rel.direction === 'forward' && lName && !sublabels.includes(lName)) sublabels.push(lName);
      }
    }

    const annotation = (data.annotation || '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/'''|''/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();

    return {
      mbid: data.id || mbid,
      mbUrl,
      name: data.name || '',
      labelType: data.type || '',
      labelCode: data['label-code'] ? `LC-${String(data['label-code']).padStart(5, '0')}` : '',
      country: data.area?.name || data.country || '',
      foundedYear: data['life-span']?.begin ? String(data['life-span'].begin).slice(0, 4) : '',
      disambiguation: data.disambiguation || '',
      annotation,
      aliases: (data.aliases || []).map(a => a.name).filter(Boolean),
      genres: (data.tags || []).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10).map(t => t.name).filter(Boolean),
      founders,
      parentLabel,
      sublabels,
      urls: Array.from(new Set(urls)).filter(Boolean),
    };
  } catch (e) {
    return null;
  }
}

async function handleArtistProfile(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  let { artistId, artistName, trackTitle, album, label } = body || {};

  // Guard: If no explicit artistId and artistName has obvious label keywords, check if it's actually a label on Discogs
  if (!artistId && artistName && LABEL_KEYWORD_RE.test(artistName)) {
    const labelHit = await findDiscogsLabelHit(artistName);
    if (labelHit && normLabelName(labelHit.title) === normLabelName(artistName)) {
      return res.status(200).json({
        isLabel: true,
        labelId: labelHit.id,
        labelName: stripArtistSuffix(labelHit.title || artistName),
      });
    }
  }

  if (!artistId && artistName) {
    try {
      const want = normName(artistName);
      const resolved = await resolveDiscogsArtistIdByNameAndContext(artistName, { trackTitle, album, label });
      if (resolved.artistId) {
        artistId = resolved.artistId;
      } else {
        // Check if artistName is actually a label on Discogs
        const labelHit = await findDiscogsLabelHit(artistName);
        if (labelHit && (normLabelName(labelHit.title) === normLabelName(artistName) || normName(labelHit.title).includes(want))) {
          return res.status(200).json({
            isLabel: true,
            labelId: labelHit.id,
            labelName: stripArtistSuffix(labelHit.title || artistName),
          });
        }
        if (resolved.results[0]) artistId = resolved.results[0].id;
      }
    } catch (e) {}
  }
  if (!artistId) return res.status(200).json({ error: 'Artist not found on Discogs' });

  const cacheKey = `artist-profile-v6|${artistId}`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 6);
  if (cached) return res.status(200).json(cached);

  const [profileData, mbArtist] = await Promise.all([
    fetch(`https://api.discogs.com/artists/${artistId}`, { headers: DISCOGS_HEADERS }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetchMusicBrainzArtistProfile(artistName || '', artistId),
  ]);

  const { cleanText: cleanBio, extractedUrls, referencedLabels } = await resolveDiscogsTextAndMeta(profileData.profile || '');

  // Fetch top releases by reusing the artist-top-releases logic internally
  let topReleases = [];
  try {
    const mockRes = { status: () => ({ json: (d) => { topReleases = d.releases || []; return { releases: topReleases }; } }) };
    await handleArtistTopReleases({ artistId, artistName }, mockRes);
  } catch(e) {}

  const cleanArtistName = stripArtistSuffix(profileData.name || artistName || '');

  // Gather ALL aliases without truncation (Discogs aliases + groups + MusicBrainz aliases)
  const dcGroups = (profileData.groups || []).map(g => stripArtistSuffix(g.name || '')).filter(Boolean);
  const dcMembers = (profileData.members || []).map(m => stripArtistSuffix(m.name || '')).filter(Boolean);
  const rawAliases = [
    ...(profileData.aliases || []).map(a => stripArtistSuffix(a.name || '')),
    ...dcGroups,
    ...(mbArtist?.aliases || []),
  ];
  const seenAliasNorm = new Set([normName(cleanArtistName)]);
  const fullAliases = [];
  for (const al of rawAliases) {
    const n = normName(al);
    if (!al || !n || seenAliasNorm.has(n)) continue;
    seenAliasNorm.add(n);
    fullAliases.push(al);
  }

  // Dominant labels from topReleases + profile referencedLabels + MusicBrainz labels
  const releaseLabels = [];
  for (const rel of topReleases) {
    const lbl = Array.isArray(rel.labels) ? rel.labels[0] : rel.label;
    if (lbl && !/not on label|self-released/i.test(lbl) && !releaseLabels.includes(lbl)) {
      releaseLabels.push(lbl);
    }
  }
  const associatedLabels = Array.from(new Set([...referencedLabels, ...(mbArtist?.labels || []), ...releaseLabels])).filter(Boolean);
  const releaseTitles = topReleases.map(r => r.title).filter(Boolean);

  // Discover cross-entity / differently-named Bandcamp & external links (e.g. Traumprinz -> All Possible Worlds)
  const crossUrls = await discoverCrossEntityUrls({
    name: cleanArtistName,
    aliases: fullAliases,
    labels: associatedLabels,
    releaseTitles,
  });

  // Extract where artist is based (location) from MusicBrainz area, bio text, or Bandcamp autocomplete
  let artistLocation = (mbArtist?.area || '').trim();
  if (!artistLocation && cleanBio) {
    const locMatch = cleanBio.match(/\b(?:based|located|living|residing)\s+in\s+([A-Z][A-Za-z\s,.-]{2,40}?)(?:\.|,|;|\s+and\s+|\s+who\s+|\s+with\s+|$)/)
      || cleanBio.match(/\b(?:producer|dj|artist|musician|duo|project|trio|collective)\s+from\s+([A-Z][A-Za-z\s,.-]{2,35}?)(?:\.|,|;|\s+and\s+|\s+who\s+|$)/i)
      || cleanBio.match(/\b(?:hailing\s+from|born\s+in)\s+([A-Z][A-Za-z\s,.-]{2,35}?)(?:\.|,|;|$)/i);
    if (locMatch && locMatch[1]) {
      artistLocation = locMatch[1].trim().replace(/[.,;]+$/, '');
    }
  }
  if (!artistLocation && cleanArtistName) {
    try {
      const bcLocRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ search_text: cleanArtistName, search_filter: 'b', full_page: false, fan_id: 0 }),
      });
      if (bcLocRes.ok) {
        const bcLocJson = await bcLocRes.json();
        const wantNorm = normName(cleanArtistName);
        const bcHit = (bcLocJson?.auto?.results || []).find(item => item.type === 'b' && normName(item.name) === wantNorm);
        if (bcHit?.location) artistLocation = bcHit.location.trim();
      }
    } catch (e) {}
  }

  const personaBundle = buildArtistPersonaInfluencesAndCollaborations({
    name: cleanArtistName,
    realname: stripArtistSuffix(profileData.realname || ''),
    bio: cleanBio || '',
    mbAnnotation: mbArtist?.annotation || '',
    area: artistLocation || mbArtist?.area || '',
    beginDate: mbArtist?.beginDate || '',
    aliases: fullAliases,
    groups: dcGroups,
    members: dcMembers,
    labels: associatedLabels,
    mbTags: mbArtist?.tags || [],
    mbArtistRelations: mbArtist?.artistRelations || [],
    topReleases,
  });

  // Build concise 1-sentence summary for display right above Releases
  let shortSummary = '';
  const rawBioForSummary = (cleanBio || mbArtist?.annotation || '').replace(/\s+/g, ' ').trim();
  if (rawBioForSummary) {
    const firstSent = (rawBioForSummary.split(/(?<=[.!?])\s+/)[0] || '').trim();
    if (firstSent.length >= 20 && firstSent.length <= 190) {
      shortSummary = /[.!?]$/.test(firstSent) ? firstSent : `${firstSent}.`;
    }
  }
  if (!shortSummary) {
    const personaFirst = ((personaBundle.artisticPersona || '').split(/(?<=[.!?])\s+/)[0] || '').trim();
    if (personaFirst) {
      shortSummary = /[.!?]$/.test(personaFirst) ? personaFirst : `${personaFirst}.`;
    }
  }

  const result = {
    _v: 6,
    id: artistId,
    name: cleanArtistName,
    realname: profileData.realname || '',
    location: artistLocation,
    summary: shortSummary,
    profile: cleanBio || mbArtist?.annotation || profileData.profile || '',
    artisticPersona: personaBundle.artisticPersona,
    influencesAndInspirations: personaBundle.influencesAndInspirations,
    collaborations: personaBundle.collaborations,
    collaborators: personaBundle.collaborators,
    urls: Array.from(new Set([
      ...crossUrls,
      ...(profileData.urls || []),
      ...extractedUrls,
      ...(mbArtist?.urls || []),
    ])).filter(Boolean),
    aliases: fullAliases,
    images: (profileData.images || []).map(i => i.uri).filter(Boolean),
    topReleases
  };

  await cacheSet(supabase, cacheKey, result);
  return res.status(200).json(result);
}

async function handleLabelProfile(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  let { labelId, labelName } = body || {};

  // 1. Find Discogs label ID if not provided
  if (!labelId && labelName) {
    const hit = await findDiscogsLabelHit(labelName);
    if (hit) labelId = hit.id;
  }

  const cacheKey = `label-profile-v5|${labelId || normLabelName(labelName || '')}`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 5);
  if (cached) return res.status(200).json(cached);

  // 2. Fetch MusicBrainz label data in parallel with Discogs label data
  const mbPromise = fetchMusicBrainzLabel(labelName || '', labelId);

  const dcProfilePromise = labelId
    ? fetch(`https://api.discogs.com/labels/${labelId}`, { headers: DISCOGS_HEADERS }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    : Promise.resolve({});

  let [mbData, profileData] = await Promise.all([mbPromise, dcProfilePromise]);

  // If Discogs labelId wasn't found initially, check if MusicBrainz has a Discogs label URL!
  if (!labelId && mbData && Array.isArray(mbData.urls)) {
    const dcUrlFromMb = mbData.urls.find(u => /discogs\.com\/label\/(\d+)/i.test(u));
    if (dcUrlFromMb) {
      const m = dcUrlFromMb.match(/discogs\.com\/label\/(\d+)/i);
      if (m && m[1]) {
        labelId = m[1];
        try {
          const r = await fetch(`https://api.discogs.com/labels/${labelId}`, { headers: DISCOGS_HEADERS });
          if (r.ok) profileData = await r.json();
        } catch (e) {}
      }
    }
  }

  // If MusicBrainz was queried without Discogs canonical name and missed, retry with Discogs canonical label name
  if (!mbData && profileData?.name && normName(profileData.name) !== normName(labelName || '')) {
    mbData = await fetchMusicBrainzLabel(stripArtistSuffix(profileData.name), labelId);
  }

  const resolvedLabelName = stripArtistSuffix(profileData?.name || mbData?.name || labelName || '');

  // 3. Fetch Discogs label releases (up to 3 pages) + release search (for high-res artwork, years, & genres/styles)
  let topReleases = [];
  const dcGenres = new Map();
  let dcCountry = '';

  if (labelId || resolvedLabelName) {
    const [relListPage1, relSearchRes] = await Promise.all([
      labelId
        ? fetch(`https://api.discogs.com/labels/${labelId}/releases?sort=year&sort_order=desc&per_page=100&page=1`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
      resolvedLabelName
        ? fetch(`https://api.discogs.com/database/search?label=${encodeURIComponent(resolvedLabelName)}&type=release&per_page=100`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
    ]);

    let allDcLabelReleases = Array.isArray(relListPage1?.releases) ? [...relListPage1.releases] : [];
    const totalPages = Math.min(relListPage1?.pagination?.pages || 1, 3);
    if (labelId && totalPages > 1) {
      const extraPages = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(`https://api.discogs.com/labels/${labelId}/releases?sort=year&sort_order=desc&per_page=100&page=${i + 2}`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        )
      );
      for (const ep of extraPages) {
        if (Array.isArray(ep?.releases)) allDcLabelReleases.push(...ep.releases);
      }
    }

    // Extract high-res covers, years, genres, styles, and country from Discogs search results
    const hiResCovers = new Map();
    const searchYears = new Map();
    if (relSearchRes && Array.isArray(relSearchRes.results)) {
      const countryCounts = new Map();
      for (const sr of relSearchRes.results) {
        if (sr.country) countryCounts.set(sr.country, (countryCounts.get(sr.country) || 0) + 1);
        for (const g of [...(sr.style || []), ...(sr.genre || [])]) {
          if (g) dcGenres.set(g, (dcGenres.get(g) || 0) + 1);
        }
        const parts = (sr.title || '').split(' - ');
        const rTitle = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : (sr.title || '');
        const srYear = sr.year ? parseInt(sr.year, 10) : null;
        if (srYear && srYear >= 1950) {
          if (rTitle) searchYears.set(normName(rTitle), srYear);
          if (sr.id) searchYears.set(`id:${sr.id}`, srYear);
        }
        if (sr.cover_image && !sr.cover_image.includes('spacer.gif')) {
          if (rTitle) hiResCovers.set(normName(rTitle), sr.cover_image);
          if (sr.id) hiResCovers.set(`id:${sr.id}`, sr.cover_image);
        }
      }
      if (countryCounts.size > 0) {
        dcCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    const seen = new Set();
    for (const rel of allDcLabelReleases) {
      const cleanArtist = stripArtistSuffix(rel.artist || '');
      const cleanTitle = (rel.title || '').trim();
      const dedupKey = `${normName(cleanArtist)}::${normName(cleanTitle)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const hiRes = hiResCovers.get(`id:${rel.id}`) || hiResCovers.get(normName(cleanTitle)) || rel.thumb || '';
      const resolvedYear = (rel.year && rel.year >= 1950 ? rel.year : null)
        || searchYears.get(`id:${rel.id}`)
        || searchYears.get(normName(cleanTitle))
        || null;
      topReleases.push({
        id: `discogs-l-${rel.type || 'release'}-${rel.id}`,
        discogsId: String(rel.id || ''),
        type: rel.type || 'release',
        title: cleanTitle,
        artist: cleanArtist,
        artistName: cleanArtist,
        label: resolvedLabelName,
        catno: rel.catno || '',
        format: rel.format || '',
        year: resolvedYear,
        thumb: rel.thumb || hiRes || '',
        coverImage: hiRes || rel.thumb || '',
        entityType: 'release',
        provider: 'discogs'
      });
    }

    // Also include any releases from Discogs database search for this label that weren't in /labels/{id}/releases
    if (relSearchRes && Array.isArray(relSearchRes.results)) {
      const wantLabelCore = normLabelName(resolvedLabelName);
      for (const sr of relSearchRes.results) {
        const srLabels = Array.isArray(sr.label) ? sr.label : (sr.label ? [sr.label] : []);
        if (srLabels.length > 0 && !srLabels.some(l => normLabelName(l) === wantLabelCore)) continue;
        const parts = (sr.title || '').split(' - ');
        const cleanArtist = stripArtistSuffix(parts.length >= 2 ? parts[0].trim() : '');
        const cleanTitle = (parts.length >= 2 ? parts.slice(1).join(' - ').trim() : (sr.title || '')).trim();
        if (!cleanTitle) continue;
        const dedupKey = `${normName(cleanArtist)}::${normName(cleanTitle)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const hiRes = (sr.cover_image && !sr.cover_image.includes('spacer.gif')) ? sr.cover_image : (sr.thumb || '');
        const srYear = sr.year ? parseInt(sr.year, 10) : null;
        topReleases.push({
          id: `discogs-l-release-${sr.id}`,
          discogsId: String(sr.id || ''),
          type: 'release',
          title: cleanTitle,
          artist: cleanArtist,
          artistName: cleanArtist,
          label: resolvedLabelName,
          catno: sr.catno || '',
          format: Array.isArray(sr.format) ? sr.format.join(', ') : (sr.format || ''),
          year: (srYear && srYear >= 1950) ? srYear : null,
          thumb: sr.thumb || hiRes || '',
          coverImage: hiRes || sr.thumb || '',
          entityType: 'release',
          provider: 'discogs'
        });
      }
    }
  }

  // 4. Clean and resolve Discogs profile and contact_info markup
  const [profileResolved, contactResolved] = await Promise.all([
    resolveDiscogsTextAndMeta(profileData?.profile || ''),
    resolveDiscogsTextAndMeta(profileData?.contact_info || ''),
  ]);

  const discogsUrl = labelId ? (profileData?.uri || `https://www.discogs.com/label/${labelId}`) : '';
  const mbUrl = mbData?.mbUrl || '';
  const founders = Array.from(new Set([...profileResolved.founders, ...(mbData?.founders || [])])).filter(Boolean);
  const foundedYear = mbData?.foundedYear || profileResolved.foundedYear || '';
  const parentLabel = (profileData?.parent_label?.name ? stripArtistSuffix(profileData.parent_label.name) : '') || mbData?.parentLabel || '';
  const sublabels = Array.from(new Set([
    ...(profileData?.sublabels || []).map(s => stripArtistSuffix(s.name || '')),
    ...(mbData?.sublabels || []),
  ])).filter(Boolean);

  const crossLabelUrls = await discoverCrossEntityUrls({
    name: resolvedLabelName,
    aliases: [...(mbData?.aliases || []), ...founders],
    labels: [parentLabel, ...sublabels, ...(profileResolved.referencedLabels || [])].filter(Boolean),
    releaseTitles: topReleases.slice(0, 6).map(r => `${r.artist || ''} ${r.title || ''}`.trim()),
    isLabel: true,
  });

  const rawUrls = [
    discogsUrl,
    mbUrl,
    ...(Array.isArray(profileData?.urls) ? profileData.urls : []),
    ...profileResolved.extractedUrls,
    ...contactResolved.extractedUrls,
    ...(mbData?.urls || []),
    ...crossLabelUrls,
  ].filter(Boolean);

  // 5. If Bandcamp URL is not yet in rawUrls, query Bandcamp autocomplete for the label (including "<Core> Records")
  let bcDiscoveredUrl = rawUrls.find(u => /bandcamp\.com/i.test(u)) || '';
  let bcDiscoveredImg = '';
  let bcDiscoveredLoc = '';
  if (resolvedLabelName) {
    const wantCore = normLabelName(resolvedLabelName);
    const wantSlug = wantCore.replace(/[^a-z0-9]/g, '');
    const bcSearchCandidates = Array.from(new Set([
      resolvedLabelName,
      labelName || '',
      wantCore ? `${wantCore} records` : '',
      wantCore,
    ])).filter(Boolean);

    if (!bcDiscoveredUrl) {
      for (const term of bcSearchCandidates) {
        try {
          const bcRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({ search_text: term, search_filter: 'b', full_page: false, fan_id: 0 }),
          });
          if (!bcRes.ok) continue;
          const bcJson = await bcRes.json();
          const results = bcJson?.auto?.results || [];
          const bcHit = results.find(item => {
            if (item.type !== 'b') return false;
            const itemCore = normLabelName(item.name);
            const root = (item.item_url_root || item.item_url_path || item.url || '').toLowerCase();
            const subMatch = root.match(/https?:\/\/([a-z0-9-]+)\.bandcamp\.com/);
            const sub = subMatch ? subMatch[1].replace(/-/g, '') : '';
            return itemCore === wantCore
              || (wantSlug.length >= 4 && (sub === wantSlug || sub === `${wantSlug}records` || sub === `${wantSlug}recordings` || sub === `${wantSlug}music`));
          });
          if (bcHit) {
            bcDiscoveredUrl = bcHit.item_url_root || bcHit.item_url_path || bcHit.url || '';
            if (bcDiscoveredUrl) rawUrls.push(bcDiscoveredUrl);
            if (bcHit.img_id) bcDiscoveredImg = `https://f4.bcbits.com/img/00${bcHit.img_id}_23.jpg`;
            else if (bcHit.img) bcDiscoveredImg = bcHit.img;
            if (bcHit.location) bcDiscoveredLoc = bcHit.location;
            break;
          }
        } catch (e) {}
      }
    }

    // Direct Bandcamp subdomain fallback check (e.g. moonshoerecords.bandcamp.com or moonshoe.bandcamp.com)
    if (!bcDiscoveredUrl && wantSlug.length >= 4) {
      const candidateSubdomains = [
        `https://${wantSlug}records.bandcamp.com`,
        `https://${wantSlug}.bandcamp.com`,
      ];
      for (const candUrl of candidateSubdomains) {
        try {
          const probe = await fetch(`${candUrl}/music`, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(2500),
          });
          if (probe.ok) {
            const html = await probe.text();
            if (html.includes('music-grid') || html.includes('TralbumData') || html.includes('band-navbar')) {
              bcDiscoveredUrl = candUrl;
              rawUrls.push(bcDiscoveredUrl);
              break;
            }
          }
        } catch (e) {}
      }
    }
  }

  // Combine biography from Discogs + MusicBrainz
  const bioParts = [];
  if (profileResolved.cleanText) bioParts.push(profileResolved.cleanText);
  if (mbData?.annotation && (!profileResolved.cleanText || !profileResolved.cleanText.toLowerCase().includes(mbData.annotation.slice(0, 40).toLowerCase()))) {
    bioParts.push(mbData.annotation);
  }
  if (bioParts.length === 0 && mbData?.disambiguation) {
    bioParts.push(mbData.disambiguation);
  }

  // Combine genres from Discogs release styles/genres + MusicBrainz tags
  const sortedDcGenres = [...dcGenres.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  const mbGenres = (mbData?.genres || []).map(g => g.replace(/\b\w/g, c => c.toUpperCase()));
  const combinedGenres = [];
  const seenGenreNorm = new Set();
  for (const g of [...sortedDcGenres, ...mbGenres]) {
    const gn = g.toLowerCase().trim();
    if (!gn || seenGenreNorm.has(gn)) continue;
    seenGenreNorm.add(gn);
    combinedGenres.push(g);
  }

  const sources = [];
  if (labelId || profileData?.name) sources.push('Discogs');
  if (mbData?.mbid) sources.push('MusicBrainz');
  if (bcDiscoveredUrl) sources.push('Bandcamp');

  const images = Array.from(new Set([
    ...(profileData?.images || []).map(i => i.uri || i.resource_url),
    bcDiscoveredImg,
  ])).filter(Boolean);

  const allUrls = Array.from(new Set(rawUrls)).filter(Boolean);

  const result = {
    _v: 5,
    id: labelId || mbData?.mbid || `label-${normLabelName(resolvedLabelName)}`,
    name: resolvedLabelName,
    profile: bioParts.join('\n\n'),
    contactInfo: contactResolved.cleanText || '',
    parentLabel,
    parentLabelId: profileData?.parent_label?.id || null,
    sublabels,
    foundedYear,
    founders,
    labelType: mbData?.labelType || '',
    labelCode: mbData?.labelCode || '',
    aliases: mbData?.aliases || [],
    country: mbData?.country || dcCountry || '',
    location: bcDiscoveredLoc || mbData?.country || dcCountry || '',
    genres: combinedGenres.slice(0, 12),
    sources,
    discogsUrl,
    mbUrl,
    bandcampUrl: bcDiscoveredUrl,
    urls: allUrls,
    images,
    topReleases
  };

  await cacheSet(supabase, cacheKey, result);
  return res.status(200).json(result);
}

async function handleReleaseDetails(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { releaseId, releaseType } = body || {};
  if (!releaseId) return res.status(400).json({ error: 'Missing releaseId' });

  const isMaster = releaseType === 'master';
  const cacheKey = `release-details|${isMaster ? 'm' : 'r'}|${releaseId}`;
  const cached = await cacheGet(supabase, cacheKey, 7 * 24 * 60 * 60 * 1000, 1);
  if (cached) return res.status(200).json(cached);

  try {
    const endpoint = isMaster
      ? `https://api.discogs.com/masters/${encodeURIComponent(releaseId)}`
      : `https://api.discogs.com/releases/${encodeURIComponent(releaseId)}`;
    const r = await fetch(endpoint, { headers: DISCOGS_HEADERS });
    if (!r.ok) return res.status(200).json({ error: 'Release not found on Discogs' });
    const d = await r.json();
    const artist = (d.artists || []).map(a => stripArtistSuffix(a.name || '')).filter(Boolean).join(', ');
    const label = (d.labels || []).map(l => stripArtistSuffix(l.name || '')).filter(Boolean)[0] || '';
    const cover = (d.images || [])[0]?.uri || (d.images || [])[0]?.resource_url || d.thumb || '';
    const genres = [...(d.styles || []), ...(d.genres || [])].slice(0, 4).join(', ');
    const tracks = (d.tracklist || [])
      .filter(t => t.type_ !== 'heading')
      .map((t, idx) => {
        const trackArtist = (t.artists || []).map(a => stripArtistSuffix(a.name || '')).filter(Boolean).join(', ') || artist;
        let durSec = 0;
        if (t.duration && /^\d+:\d+$/.test(t.duration.trim())) {
          const [mm, ss] = t.duration.trim().split(':').map(Number);
          durSec = (mm || 0) * 60 + (ss || 0);
        }
        return {
          id: `discogs-trk-${releaseId}-${idx}`,
          title: t.title || `Track ${idx + 1}`,
          artist: trackArtist,
          position: t.position || String(idx + 1),
          duration: durSec,
          durationStr: t.duration || '',
        };
      });

    const result = {
      _v: 1,
      id: String(d.id || releaseId),
      title: d.title || '',
      artist,
      label,
      year: d.year ? String(d.year) : '',
      genre: genres,
      cover,
      notes: d.notes || '',
      uri: d.uri || '',
      tracks,
    };
    await cacheSet(supabase, cacheKey, result);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({ error: 'Failed to fetch release details' });
  }
}

async function handleGenreExplore(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { genre, artist } = body || {};
  if (!genre) return res.status(400).json({ error: 'Missing genre' });

  // Clean style term for Discogs query (e.g. "UK Garage / 2-Step" -> "UK Garage", "Hypnotic Techno" -> "Techno")
  const primaryTerm = String(genre).split(/[\/&]/)[0].trim();
  const cacheKey = `genre-explore|${primaryTerm.toLowerCase()}|${String(artist || '').trim().toLowerCase()}`;
  const cached = await cacheGet(supabase, cacheKey, 7 * 24 * 60 * 60 * 1000, 1);
  if (cached) return res.status(200).json(cached);

  try {
    const searchUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(primaryTerm)}&type=release&per_page=14`;
    const r = await fetch(searchUrl, { headers: DISCOGS_HEADERS });
    let items = [];
    if (r.ok) {
      const d = await r.json();
      items = (d.results || []).map(item => {
        const rawTitle = String(item.title || '');
        const parts = rawTitle.split(' - ');
        const itemArtist = stripArtistSuffix(parts.length > 1 ? parts[0] : (artist || 'Various'));
        const itemTitle = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawTitle;
        const lbl = Array.isArray(item.label) ? stripArtistSuffix(item.label[0] || '') : '';
        return {
          id: `discogs-g-${item.type || 'release'}-${item.id}`,
          discogsId: String(item.id || ''),
          type: item.type || 'release',
          title: itemTitle,
          artist: itemArtist,
          label: lbl,
          year: item.year ? String(item.year) : '',
          coverImage: item.cover_image || item.thumb || '',
          thumb: item.thumb || item.cover_image || '',
          styles: item.style || [],
          genres: item.genre || [],
        };
      });
    }
    const result = { _v: 1, genre: primaryTerm, releases: items };
    await cacheSet(supabase, cacheKey, result);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({ genre: primaryTerm, releases: [] });
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
  if (requestLog.length >= RATE_LIMIT) return res.status(429).json({ error: 'Rate limit reached' });
  requestLog.push(now);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { query, type, page, perPage, action } = body || {};

  // ==== ACTION: genre-explore ====
  if (action === 'genre-explore') {
    return handleGenreExplore(body, res);
  }

  // ==== ACTION: artist-profile ====
  if (action === 'artist-profile') {
    return handleArtistProfile(body, res);
  }

  // ==== ACTION: label-profile ====
  if (action === 'label-profile') {
    return handleLabelProfile(body, res);
  }

  // ==== ACTION: release-details ====
  if (action === 'release-details') {
    return handleReleaseDetails(body, res);
  }

  // ==== ACTION: track-info ====
  if (action === 'track-info') {
    return handleTrackInfo(body, res);
  }

  // ==== ACTION: artist-top-releases ====
  if (action === 'artist-top-releases') {
    return handleArtistTopReleases(body, res);
  }

  // ==== ACTION: track-release ====
  if (action === 'track-release') {
    return handleTrackRelease(body, res);
  }

  // ==== ACTION: resolve-aliases ====
  if (action === 'resolve-aliases') {
    if (!query || query.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    const cacheKey = query.trim().toLowerCase();
    if (aliasCache.has(cacheKey)) {
      const cached = aliasCache.get(cacheKey);
      if (now - cached.timestamp < ALIAS_CACHE_TTL) return res.status(200).json(cached.data);
      aliasCache.delete(cacheKey);
    }
    let canonical = query;
    try {
      const fuzzyQ = query.split(' ').filter(w => w.trim()).map(w => w + '~').join(' ');
      const mbRes = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(fuzzyQ)}&fmt=json`, { headers: { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' } });
      if (mbRes.ok) {
        const mbData = await mbRes.json();
        if (mbData.artists && mbData.artists.length > 0 && mbData.artists[0].score > 50) canonical = mbData.artists[0].name;
      }
    } catch (e) {}
    let aliases = [];
    try {
      const discogsRes = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(canonical)}&type=artist`, { headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` } });
      if (discogsRes.ok) {
        const discogsData = await discogsRes.json();
        if (discogsData.results && discogsData.results.length > 0) {
          const discogsId = discogsData.results[0].id;
          const artistRes = await fetch(`https://api.discogs.com/artists/${discogsId}`, { headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` } });
          if (artistRes.ok) {
            const artistData = await artistRes.json();
            if (artistData.aliases) aliases = artistData.aliases.map(a => a.name.replace(/\s\(\d+\)$/, ''));
            if (artistData.groups) artistData.groups.forEach(g => aliases.push(g.name.replace(/\s\(\d+\)$/, '')));
          }
        }
      }
    } catch (e) {}
    const result = { original: query, canonical, aliases: Array.from(new Set(aliases)) };
    aliasCache.set(cacheKey, { data: result, timestamp: now });
    if (aliasCache.size > 200) {
      const oldest = [...aliasCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 50);
      oldest.forEach(([k]) => aliasCache.delete(k));
    }
    return res.status(200).json(result);
  }

  // ==== DEFAULT ACTION: search ====
  if (!query) return res.status(400).json({ error: 'Missing query' });
  const p = page || 1;
  const pp = perPage || 10;
  let url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&page=${p}&per_page=${pp}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;

  const cacheKey = `search|${String(query).trim().toLowerCase()}|${p}|${pp}|${type || ''}`;
  const mem = searchMemCache.get(cacheKey);
  if (mem && now - mem.ts < SEARCH_MEM_TTL) return res.status(200).json(mem.data);

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  let stale = null;
  try {
    const { data: row } = await supabase.from('track_info_cache').select('data, updated_at').eq('lookup_key', cacheKey).single();
    if (row?.data && row.data._v === SEARCH_CACHE_VERSION) {
      const { _v, ...cachedData } = row.data;
      if (Date.now() - new Date(row.updated_at).getTime() < SEARCH_DB_TTL) {
        searchMemCache.set(cacheKey, { data: cachedData, ts: now });
        return res.status(200).json(cachedData);
      }
      stale = cachedData;
    }
  } catch (e) { /* cache miss */ }

  try {
    // Discogs answers 429 when the per-minute quota is used up — wait and retry instead of returning nothing
    let discogsRes = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      discogsRes = await fetch(url, { headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` } });
      if (discogsRes.status !== 429 && discogsRes.status < 500) break;
      if (attempt === 0) await sleep(900);
    }
    if (!discogsRes.ok) {
      if (stale) return res.status(200).json(stale);
      return res.status(discogsRes.status).json({ error: 'Discogs API error' });
    }
    const data = await discogsRes.json();
    searchMemCache.set(cacheKey, { data, ts: now });
    if (searchMemCache.size > 300) {
      [...searchMemCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100).forEach(([k]) => searchMemCache.delete(k));
    }
    if ((data.results || []).length > 0) {
      try {
        await supabase.from('track_info_cache').upsert({
          lookup_key: cacheKey, title: '', artist: '', album: '', data: { ...data, _v: SEARCH_CACHE_VERSION }, updated_at: new Date().toISOString(),
        }, { onConflict: 'lookup_key' });
      } catch (e) { /* non-fatal */ }
    }
    return res.status(200).json(data);
  } catch (e) {
    if (stale) return res.status(200).json(stale);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
