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

function extractMixQualifier(rawTitle = '') {
  const m = String(rawTitle || '').match(/[\(\[]([^)\]]*\b(?:mix|remix|edit|dub|rework|vip|bootleg|version|instrumental|extended|original|club|radio)\b[^)\]]*)[\)\]]/i);
  return m ? normName(m[1]) : '';
}

function stripMixQualifier(rawTitle = '') {
  return String(rawTitle || '')
    .replace(/[\(\[][^)\]]*\b(?:mix|remix|edit|dub|rework|vip|bootleg|version|instrumental|extended|original|club|radio)\b[^)\]]*[\)\]]/gi, '')
    .trim();
}

function resolveConsensusBpmAndKey({ beatport, deezer, ab, sc, notesBpm, notesKey, stylesAndGenres = [] }) {
  const genreBlob = (stylesAndGenres || []).join(' ').toLowerCase();
  const isElectronicOrClub = /house|techno|trance|electro|minimal|dubstep|garage|breakbeat|jungle|drum and bass|d&b|disco|acid|club|dance|idm|uk bass|hardcore|downtempo/.test(genreBlob);

  // 1. BPM Consensus & Octave (Half-time / Double-time) Reconciliation
  const rawBpmCandidates = [
    beatport?.bpm ? { val: Number(beatport.bpm), weight: beatport.exactMixMatch ? 5.0 : 3.8, src: 'beatport' } : null,
    deezer?.bpm ? { val: Number(deezer.bpm), weight: 3.4, src: 'deezer' } : null,
    ab?.bpm ? { val: Number(ab.bpm), weight: 3.2, src: 'acousticbrainz' } : null,
    sc?.bpm ? { val: Number(sc.bpm), weight: 2.5, src: 'soundcloud' } : null,
    notesBpm ? { val: Number(notesBpm), weight: 2.8, src: 'discogs_notes' } : null,
  ].filter(c => c && Number.isFinite(c.val) && c.val >= 45 && c.val <= 220);

  let finalBpm = '';
  if (rawBpmCandidates.length > 0) {
    // Normalize half-time candidates (e.g. 60-87 BPM) when another provider or club genre indicates 120-174 BPM
    const hasFastRef = rawBpmCandidates.some(c => c.val >= 115 && c.val <= 178);
    const normalized = rawBpmCandidates.map(c => {
      let v = c.val;
      if (v >= 56 && v <= 88 && (hasFastRef || isElectronicOrClub)) {
        const doubled = v * 2;
        if (hasFastRef) {
          const matchesFast = rawBpmCandidates.some(other => Math.abs(other.val - doubled) <= 2.5);
          if (matchesFast) v = doubled;
        } else if (isElectronicOrClub && v >= 58 && v <= 75) {
          v = doubled;
        }
      }
      return { ...c, normVal: Math.round(v) };
    });

    // Cluster candidates within ±1.5 BPM and sum weights
    let bestClusterWeight = -1;
    let bestClusterBpm = normalized[0].normVal;
    for (const pivot of normalized) {
      let wSum = 0;
      let weightedValSum = 0;
      for (const other of normalized) {
        if (Math.abs(other.normVal - pivot.normVal) <= 1.5) {
          wSum += other.weight;
          weightedValSum += other.normVal * other.weight;
        }
      }
      if (wSum > bestClusterWeight) {
        bestClusterWeight = wSum;
        bestClusterBpm = Math.round(weightedValSum / wSum);
      }
    }
    finalBpm = String(bestClusterBpm);
  }

  // 2. Musical Key Consensus (Beatport + Essentia EDMA + Essentia Krumhansl + Chords + SoundCloud)
  const keyVotes = new Map();
  const addKeyVote = (rawK, weight) => {
    if (!rawK) return;
    const formatted = normalizeMusicalKey(rawK);
    if (!formatted) return;
    keyVotes.set(formatted, (keyVotes.get(formatted) || 0) + weight);
  };

  if (beatport?.key) addKeyVote(beatport.key, beatport.exactMixMatch ? 5.0 : 3.6);
  if (ab?.edmaKey) addKeyVote(ab.edmaKey, isElectronicOrClub ? 4.2 : 3.2);
  if (ab?.krumKey) addKeyVote(ab.krumKey, 2.8);
  if (ab?.chordsKey) addKeyVote(ab.chordsKey, 2.2);
  if (sc?.key) addKeyVote(sc.key, 2.6);
  if (notesKey) addKeyVote(notesKey, 3.0);

  let finalKey = '';
  let bestKeyWeight = -1;
  for (const [kName, w] of keyVotes.entries()) {
    if (w > bestKeyWeight) {
      bestKeyWeight = w;
      finalKey = kName;
    }
  }

  return { bpm: finalBpm, key: finalKey };
}

async function fetchAcousticBrainzForMbid(mbid) {
  if (!mbid) return null;
  try {
    const r = await fetchWithTimeout(`https://acousticbrainz.org/api/v1/${mbid}/low-level`, { headers: MB_HEADERS }, 2400);
    if (!r.ok) return null;
    const d = await r.json();
    const bpmVal = Number(d?.rhythm?.bpm || 0);
    const edmaK = d?.tonal?.key_edma?.key || '';
    const edmaS = d?.tonal?.key_edma?.scale || '';
    const krumK = d?.tonal?.key_key || '';
    const krumS = d?.tonal?.key_scale || '';
    const chordsK = d?.tonal?.chords_key || '';
    const chordsS = d?.tonal?.chords_scale || '';
    const edmaKey = edmaK ? normalizeMusicalKey(edmaK, edmaS) : '';
    const krumKey = krumK ? normalizeMusicalKey(krumK, krumS) : '';
    const chordsKey = chordsK ? normalizeMusicalKey(chordsK, chordsS) : '';
    return {
      bpm: bpmVal >= 45 && bpmVal <= 220 ? String(Math.round(bpmVal)) : '',
      key: edmaKey || krumKey || chordsKey || '',
      edmaKey,
      krumKey,
      chordsKey,
      tuningFrequency: Number(d?.tonal?.tuning_frequency || 440),
    };
  } catch (e) {
    return null;
  }
}

async function fetchMultiProviderTrackMeta(title, artist, album, mbRecordingId, rawNotes = '', stylesAndGenres = [], mbExtra = {}) {
  const wantTitle = normName(title || '');
  const wantBaseTitle = normName(stripMixQualifier(title || '')) || wantTitle;
  const wantMix = extractMixQualifier(title || '');
  const wantArtist = normName(artist || '');
  const wantAlbum = normName(album || '');
  const knownIsrc = String(mbExtra?.isrc || '').trim().toUpperCase();

  // 1. Deezer Track Search + Detail (mix-aware scoring + ISRC extraction)
  const deezerPromise = (async () => {
    if (!title && !artist) return null;
    try {
      const qStrict = artist && title ? `artist:"${artist}" track:"${title}"` : `${artist} ${title}`.trim();
      let r = await fetchWithTimeout(`https://api.deezer.com/search?q=${encodeURIComponent(qStrict)}&limit=8`, {}, 2800);
      let d = r.ok ? await r.json() : null;
      let list = d?.data || [];
      if (!list.length && artist && title) {
        r = await fetchWithTimeout(`https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=8`, {}, 2500);
        d = r.ok ? await r.json() : null;
        list = d?.data || [];
      }
      let bestHit = null;
      let bestScore = -1;
      for (const item of list) {
        const tFullNorm = normName(item.title || '');
        const tShortNorm = normName(item.title_short || item.title || '');
        const aNorm = normName(item.artist?.name || '');
        const titleMatch = tFullNorm === wantTitle || tShortNorm === wantBaseTitle || tFullNorm.includes(wantBaseTitle) || wantBaseTitle.includes(tShortNorm);
        const artistMatch = !wantArtist || aNorm === wantArtist || aNorm.includes(wantArtist) || wantArtist.includes(aNorm);
        if (!titleMatch || !artistMatch) continue;
        let score = 10;
        if (tFullNorm === wantTitle) score += 8;
        const itemMix = extractMixQualifier(item.title || item.title_version || '');
        if (wantMix) {
          if (itemMix && (itemMix.includes(wantMix) || wantMix.includes(itemMix))) score += 10;
          else if (itemMix) score -= 6;
        } else if (itemMix && !/original|extended|main|album|radio/.test(itemMix)) {
          score -= 5;
        }
        if (wantAlbum && normName(item.album?.title || '') === wantAlbum) score += 4;
        if (score > bestScore) {
          bestScore = score;
          bestHit = item;
        }
      }
      if (!bestHit?.id) return null;

      const detRes = await fetchWithTimeout(`https://api.deezer.com/track/${bestHit.id}`, {}, 2500);
      const det = detRes.ok ? await detRes.json() : bestHit;
      const bpmVal = Number(det.bpm || bestHit.bpm || 0);
      return {
        bpm: bpmVal >= 45 && bpmVal <= 220 ? String(Math.round(bpmVal)) : '',
        isrc: det.isrc || '',
        duration: det.duration ? formatDurationSec(det.duration) : '',
        releaseDate: det.release_date || '',
        previewUrl: det.preview || bestHit.preview || '',
        albumTitle: det.album?.title || bestHit.album?.title || '',
        deezerUrl: det.link || bestHit.link || '',
      };
    } catch (e) { return null; }
  })();

  // 2. iTunes / Apple Music Search API
  const itunesPromise = (async () => {
    if (!title && !artist) return null;
    try {
      const q = `${artist} ${title}`.trim();
      const r = await fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=6`, {}, 2800);
      if (!r.ok) return null;
      const d = await r.json();
      const list = d.results || [];
      const hit = list.find(item => {
        const tNorm = normName(item.trackName || '');
        const aNorm = normName(item.artistName || '');
        return (tNorm === wantTitle || tNorm.includes(wantBaseTitle) || wantBaseTitle.includes(tNorm)) &&
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

  // 3. Beatport Track Search (Official API v4 if BEATPORT_API_TOKEN is configured, plus __NEXT_DATA__ with exact mix_name scoring)
  const beatportPromise = (async () => {
    if (!title || !artist) return null;
    try {
      const q = `${artist} ${title}`.trim();
      let tracks = [];
      const bpToken = process.env.BEATPORT_API_TOKEN || '';
      if (bpToken) {
        try {
          const apiRes = await fetchWithTimeout(`https://api.beatport.com/v4/catalog/tracks/?q=${encodeURIComponent(q)}&per_page=10`, {
            headers: {
              'Authorization': `Bearer ${bpToken}`,
              'Accept': 'application/json',
            },
          }, 2400);
          if (apiRes.ok) {
            const apiJson = await apiRes.json();
            if (Array.isArray(apiJson?.results)) tracks.push(...apiJson.results);
          }
        } catch (e) {}
      }

      if (!tracks.length) {
        const r = await fetchWithTimeout(`https://www.beatport.com/search/tracks?q=${encodeURIComponent(q)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
        }, 2800);
        if (r.ok) {
          const html = await r.text();
          const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
          if (m) {
            const nextData = JSON.parse(m[1]);
            const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
            for (const qObj of queries) {
              const dataArr = qObj?.state?.data?.data || qObj?.state?.data?.tracks?.data || [];
              if (Array.isArray(dataArr) && dataArr.length) {
                tracks.push(...dataArr);
              }
            }
          }
        }
      }

      if (!tracks.length) return null;

      let bestHit = null;
      let bestScore = -1;
      let exactMixMatch = false;

      for (const t of tracks) {
        const rawTrackName = t.track_name || t.name || '';
        const rawMixName = t.mix_name || '';
        const tBaseNorm = normName(rawTrackName);
        const tMixNorm = normName(rawMixName);
        const tFullNorm = normName(`${rawTrackName} ${rawMixName}`);
        const artistsNorm = (t.artists || []).map(a => normName(a.artist_name || a.name || ''));
        const remixersNorm = (t.remixers || []).map(a => normName(a.artist_name || a.name || ''));
        const allArtistsNorm = [...artistsNorm, ...remixersNorm];

        const titleMatch = tBaseNorm === wantBaseTitle || tFullNorm === wantTitle || tBaseNorm.includes(wantBaseTitle) || wantBaseTitle.includes(tBaseNorm);
        const artistMatch = allArtistsNorm.some(a => a && (a === wantArtist || a.includes(wantArtist) || wantArtist.includes(a)));
        if (!titleMatch || !artistMatch) continue;

        let score = 10;
        if (tBaseNorm === wantBaseTitle) score += 6;
        if (knownIsrc && String(t.isrc || '').toUpperCase() === knownIsrc) score += 20;

        let isMixExact = false;
        if (wantMix) {
          if (tMixNorm && (tMixNorm === wantMix || tMixNorm.includes(wantMix) || wantMix.includes(tMixNorm))) {
            score += 14;
            isMixExact = true;
          } else if (remixersNorm.some(rem => wantMix.includes(rem))) {
            score += 12;
            isMixExact = true;
          } else {
            score -= 8;
          }
        } else {
          // User requested original / un-remixed track: prefer Original Mix / Extended Mix / Main Mix over unrelated remixes
          if (!tMixNorm || /^(original|extended|main|club|album|vocal)\s*(mix|version)?$/i.test(rawMixName.trim())) {
            score += 8;
            isMixExact = true;
          } else if (remixersNorm.length > 0 || /remix|rework|bootleg|flip|edit|dub/i.test(rawMixName)) {
            score -= 7;
          }
        }

        const relNameNorm = normName(t.release?.release_name || t.release?.name || '');
        if (wantAlbum && relNameNorm && (relNameNorm === wantAlbum || relNameNorm.includes(wantAlbum))) {
          score += 4;
        }

        if (score > bestScore) {
          bestScore = score;
          bestHit = t;
          exactMixMatch = isMixExact;
        }
      }

      if (!bestHit) return null;
      const bpmVal = Number(bestHit.bpm || 0);
      const rawKeyName = bestHit.key_name || bestHit.key?.name || '';
      const bpGenre = bestHit.sub_genre?.sub_genre_name || bestHit.sub_genre?.name || (Array.isArray(bestHit.genre) ? bestHit.genre[0]?.genre_name || bestHit.genre[0]?.name : bestHit.genre?.genre_name || bestHit.genre?.name) || '';
      const lengthMs = Number(bestHit.length_ms || bestHit.length || 0);
      return {
        bpm: bpmVal >= 45 && bpmVal <= 220 ? String(Math.round(bpmVal)) : '',
        key: rawKeyName ? normalizeMusicalKey(rawKeyName) : '',
        exactMixMatch,
        isrc: bestHit.isrc || '',
        releaseDate: bestHit.publish_date || bestHit.release_date || bestHit.new_release_date || '',
        duration: lengthMs > 0 ? formatDurationSec(lengthMs / 1000) : '',
        labelName: bestHit.label?.label_name || bestHit.label?.name || bestHit.release?.label?.name || '',
        albumTitle: bestHit.release?.release_name || bestHit.release?.name || '',
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
        const titleMatches = wantTitle && (tNorm.includes(wantTitle) || wantTitle.includes(tNorm) || tNorm.includes(wantBaseTitle));
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

  // 5. AcousticBrainz Low-Level API across all known MusicBrainz Recording MBIDs
  const initialMbids = Array.from(new Set([mbRecordingId, ...(mbExtra?.recordingIds || [])].filter(Boolean))).slice(0, 4);
  const acousticBrainzPromise = (async () => {
    if (!initialMbids.length) return null;
    const results = await Promise.all(initialMbids.map(id => fetchAcousticBrainzForMbid(id)));
    return results.find(r => r && (r.bpm || r.key)) || null;
  })();

  let [deezer, itunes, beatport, sc, ab] = await Promise.all([
    deezerPromise, itunesPromise, beatportPromise, soundcloudPromise, acousticBrainzPromise,
  ]);

  // 6. Tier-2 ISRC -> MusicBrainz -> AcousticBrainz Essentia Bridge:
  // If AcousticBrainz didn't hit on the initial recording MBID (or we still need Key/BPM) and Deezer/Beatport/SC gave us an ISRC,
  // resolve all MusicBrainz recording MBIDs linked to that exact ISRC and check AcousticBrainz!
  const resolvedIsrc = beatport?.isrc || deezer?.isrc || sc?.isrc || knownIsrc || '';
  if (!ab && resolvedIsrc && (!beatport?.key || !beatport?.bpm)) {
    try {
      const isrcRes = await fetchWithTimeout(
        `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(resolvedIsrc)}?inc=recordings&fmt=json`,
        { headers: MB_HEADERS },
        2000
      );
      if (isrcRes.ok) {
        const isrcData = await isrcRes.json();
        const isrcMbids = (isrcData?.recordings || [])
          .map(r => r?.id)
          .filter(id => id && !initialMbids.includes(id))
          .slice(0, 3);
        if (isrcMbids.length) {
          const abIsrcResults = await Promise.all(isrcMbids.map(id => fetchAcousticBrainzForMbid(id)));
          ab = abIsrcResults.find(r => r && (r.bpm || r.key)) || null;
        }
      }
    } catch (e) {}
  }

  // Check Discogs notes for explicit BPM / Key mentions
  let notesBpm = '';
  let notesKey = '';
  if (rawNotes) {
    const bm = String(rawNotes).match(/\b([6-9]\d|1\d{2})\s*BPM\b/i);
    if (bm) notesBpm = bm[1];
    const km = String(rawNotes).match(/\bKey\s*[:=-]\s*([A-G][#b♯♭]?\s*(?:maj(?:or)?|min(?:or)?|m))\b/i);
    if (km) notesKey = normalizeMusicalKey(km[1]);
  }

  const consensus = resolveConsensusBpmAndKey({
    beatport,
    deezer,
    ab,
    sc,
    notesBpm,
    notesKey,
    stylesAndGenres,
  });

  const providerBpm = consensus.bpm || beatport?.bpm || deezer?.bpm || ab?.bpm || sc?.bpm || notesBpm || '';
  const providerKey = consensus.key || beatport?.key || ab?.key || sc?.key || notesKey || '';

  return {
    bpm: providerBpm || '',
    key: providerKey || '',
    bpmFromProvider: Boolean(providerBpm),
    keyFromProvider: Boolean(providerKey),
    isrc: resolvedIsrc,
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

async function fetchDiscogsRelease(query, explicitReleaseId = null, fallbackArtist = '', targetTitle = '', targetArtist = '', targetAlbum = '', preferredLabel = '') {
  try {
    let best = null;
    let explicitType = 'release';
    const wantTitle = normName(targetTitle || '');
    const wantArtist = normName(targetArtist || fallbackArtist || '');
    const wantAlbum = (targetAlbum && !/unknown album/i.test(targetAlbum)) ? normName(targetAlbum) : '';
    const wantLabelCore = preferredLabel ? normLabelName(preferredLabel) : '';
    const wantLabelExact = preferredLabel ? normName(preferredLabel) : '';

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
    }
    const siblingFormatStrings = [];
    if (!best) {
      const searches = [];
      if (targetTitle && (targetArtist || fallbackArtist)) {
        const artParam = (targetArtist || fallbackArtist).trim();
        searches.push(
          fetch(`https://api.discogs.com/database/search?track=${encodeURIComponent(targetTitle.trim())}&artist=${encodeURIComponent(artParam)}&type=release&per_page=10`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null)
            .then(d => d?.results ? { results: d.results.map(x => ({ ...x, _fromTrackSearch: true })) } : null)
            .catch(() => null)
        );
      }
      if (wantAlbum && (targetArtist || fallbackArtist)) {
        const artParam = (targetArtist || fallbackArtist).trim();
        searches.push(
          fetch(`https://api.discogs.com/database/search?release_title=${encodeURIComponent(targetAlbum.trim())}&artist=${encodeURIComponent(artParam)}&type=release&per_page=8`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        );
      }
      if (preferredLabel && (targetTitle || targetAlbum)) {
        const artParam = (targetArtist || fallbackArtist || '').trim();
        const relOrTrack = (targetAlbum || targetTitle || '').trim();
        searches.push(
          fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(`${artParam} ${relOrTrack}`.trim())}&label=${encodeURIComponent(preferredLabel.trim())}&type=release&per_page=6`, { headers: DISCOGS_HEADERS })
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
        let bestRelNorm = '';
        const scoredCandidates = [];
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
          if (wantArtist && !hasArtistMatch && !(isVarious && ((wantAlbum && candRelNorm.includes(wantAlbum)) || (wantTitle && candRelNorm.includes(wantTitle)) || c._fromTrackSearch))) {
            continue;
          }

          let score = 0;
          if (wantArtist && hasArtistMatch) score += 60;
          else if (isVarious) score += 5;

          const isAlbumLookup = Boolean(wantAlbum && wantTitle && wantAlbum === wantTitle);
          if (c._fromTrackSearch) score += isAlbumLookup ? 20 : 55;

          if (wantAlbum && (candRelNorm === wantAlbum || candRelNorm.includes(wantAlbum) || wantAlbum.includes(candRelNorm))) {
            score += candRelNorm === wantAlbum ? (isAlbumLookup ? 95 : 65) : 45;
          }
          if (wantTitle && (candRelNorm === wantTitle || candRelNorm.includes(wantTitle) || wantTitle.includes(candRelNorm))) {
            score += candRelNorm === wantTitle ? 50 : 35;
          }
          const cLabels = Array.isArray(c.label) ? c.label : (c.label ? [c.label] : []);
          if (wantLabelCore && cLabels.some(l => normLabelName(l) === wantLabelCore || normName(stripArtistSuffix(l)) === wantLabelExact)) {
            score += 65;
          }
          const cFormats = Array.isArray(c.format) ? c.format : [];
          const isCompOrUnofficial = cFormats.some(f => /comp|mixed|unofficial|promo|sampler/i.test(f));
          if (!isCompOrUnofficial) score += 18;
          else score -= 15;
          if (cFormats.some(f => /vinyl|12"|10"|7"|\blp\b|cassette|\bcd\b/i.test(f))) {
            score += 8;
          }
          if (c.year) score += 5;

          scoredCandidates.push({ c, score, candRelNorm });
          if (score > bestScore) {
            bestScore = score;
            best = c;
            bestRelNorm = candRelNorm;
          }
        }
        scoredCandidates.sort((a, b) => b.score - a.score);
        if (best && bestRelNorm) {
          for (const c of candidates) {
            const rawFull = String(c.title || '');
            const splitIdx = rawFull.indexOf(' - ');
            const candArtistRaw = splitIdx >= 0 ? rawFull.slice(0, splitIdx) : '';
            const candRelRaw = splitIdx >= 0 ? rawFull.slice(splitIdx + 3) : rawFull;
            const candRelNorm = normName(candRelRaw);
            const hasArtistMatch = !wantArtist || artistMatchesString(candArtistRaw, wantArtist) || normName(rawFull).startsWith(wantArtist);
            if (hasArtistMatch && candRelNorm === bestRelNorm && Array.isArray(c.format) && c.format.length > 0) {
              siblingFormatStrings.push(c.format.join(', '));
            }
          }
        }
        best._topFallbacks = scoredCandidates.slice(1, 4).map(x => x.c);
      }
    }
    if (!best) return null;
    let detail = null;
    const candidateQueue = [best, ...(best._topFallbacks || [])].filter((v, i, a) => v?.id && a.findIndex(x => x?.id === v.id) === i);
    for (let cIdx = 0; cIdx < Math.min(3, candidateQueue.length); cIdx++) {
      const cand = candidateQueue[cIdx];
      try {
        const endpoint = cand.type === 'master' ? `masters/${cand.id}` : `releases/${cand.id}`;
        const r = await fetch(`https://api.discogs.com/${endpoint}`, { headers: DISCOGS_HEADERS });
        if (!r.ok) continue;
        let candDetail = await r.json();

        const masterId = cand.type === 'master' ? cand.id : candDetail?.master_id;
        const [mrRes, verRes] = await Promise.all([
          (cand.type === 'master' && candDetail && candDetail.main_release)
            ? fetch(`https://api.discogs.com/releases/${candDetail.main_release}`, { headers: DISCOGS_HEADERS }).catch(() => null)
            : Promise.resolve(null),
          (cIdx === 0 && masterId)
            ? fetch(`https://api.discogs.com/masters/${masterId}/versions?per_page=30`, { headers: DISCOGS_HEADERS }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (mrRes && mrRes.ok) {
          candDetail = await mrRes.json();
        }
        if (verRes && verRes.ok) {
          const verData = await verRes.json();
          for (const v of (verData.versions || [])) {
            const parts = [];
            if (Array.isArray(v.major_formats)) parts.push(...v.major_formats);
            if (v.format) parts.push(v.format);
            if (parts.length > 0) siblingFormatStrings.push(parts.join(', '));
          }
        }
        const candTracks = (candDetail?.tracklist || []).filter(t => t.type_ === 'track' || !t.type_);
        const candRelTitleNorm = normName(candDetail?.title || '');
        const hasReleaseTitleMatch = Boolean(wantAlbum && candRelTitleNorm && (candRelTitleNorm === wantAlbum || candRelTitleNorm.includes(wantAlbum) || wantAlbum.includes(candRelTitleNorm)));
        const hasTrackMatch = !wantTitle || hasReleaseTitleMatch || candTracks.some(t => {
          const tn = normName(t.title || '');
          return tn && (tn === wantTitle || tn.includes(wantTitle) || wantTitle.includes(tn));
        });
        if (!detail || hasTrackMatch) {
          detail = candDetail;
          best = cand;
          if (hasTrackMatch) break;
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
      formats: [
        ...(detail?.formats || []).map(f => {
          const parts = [f.name];
          if (f.descriptions) parts.push(...f.descriptions);
          if (f.qty && f.qty !== '1') parts.unshift(`${f.qty}x`);
          return parts.join(', ');
        }),
        ...siblingFormatStrings,
      ],
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
    const wantBaseTitle = normName(stripMixQualifier(title || '')) || wantTitle;
    const wantArtist = normName(artist || '');
    const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(`"${title}" AND artist:"${artist}"`)}&fmt=json&limit=8`, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const recordings = data.recordings || [];
    const matchedRecordings = recordings.filter(r => {
      const rTitle = normName(r.title || '');
      const rArtists = (r['artist-credit'] || []).map(ac => normName(ac.name || ac.artist?.name || ''));
      return (rTitle === wantTitle || rTitle === wantBaseTitle || rTitle.includes(wantBaseTitle) || wantBaseTitle.includes(rTitle)) &&
             (!wantArtist || rArtists.some(a => a === wantArtist || a.includes(wantArtist) || wantArtist.includes(a)));
    });
    const rec = matchedRecordings[0];
    if (!rec) return null;
    const allRecordingIds = matchedRecordings.map(r => r.id).filter(Boolean).slice(0, 5);
    const allIsrcs = Array.from(new Set(matchedRecordings.flatMap(r => r.isrcs || []).filter(Boolean)));
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
      recordingIds: allRecordingIds,
      releaseId: release?.id || '',
      releaseTitle: release?.title || '',
      title: rec.title || title || '',
      lengthSec: rec.length ? Math.round(rec.length / 1000) : 0,
      isrc: rec.isrcs?.[0] || allIsrcs[0] || '',
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
  const { title, artist, album, provider, trackId, discogsReleaseId, knownLabel, forceRefresh } = body || {};
  if (!title && !artist) return res.status(400).json({ error: 'Missing title or artist' });

  const isForceRefresh = forceRefresh === true || forceRefresh === 'true' || forceRefresh === '1' || forceRefresh === 1;

  const cleanTitle = (title || '').trim();
  const cleanArtist = stripArtistSuffix(artist || '');
  const cleanAlbum = (album && !/unknown album/i.test(album))
    ? String(album).replace(/\s*\(single\)\s*$/i, '').trim()
    : '';

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

  const cleanKnownLabel = isValidLabelForArtist(knownLabel)
    ? stripArtistSuffix(String(knownLabel || '').replace(/\s*\[[^\]]+\]\s*$/, '').split(' — ')[0].split(' (sub-label')[0].trim())
    : '';

  const lookupKey = makeLookupKey(cleanArtist, cleanAlbum, cleanTitle);
  const analysisKey = `kyoyu_analysis|${normName(cleanArtist)}|${normName(cleanTitle)}`;

  let savedAnalysis = null;
  if (!isForceRefresh) {
    try {
      const [cachedResp, analysisResp] = await Promise.all([
        supabase.from('track_info_cache').select('data, updated_at').eq('lookup_key', lookupKey).single(),
        (cleanTitle ? supabase.from('track_info_cache').select('data').eq('lookup_key', analysisKey).single() : Promise.resolve({ data: null })),
      ]);
      if (analysisResp?.data?.data && analysisResp.data.data._analyzed) {
        savedAnalysis = analysisResp.data.data;
      }
      const cached = cachedResp?.data;
      if (cached?.data && cached.data._v === 20) {
        const age = Date.now() - new Date(cached.updated_at).getTime();
        if (age < 30 * 24 * 60 * 60 * 1000) {
          const mergedCached = {
            ...cached.data,
            ...(savedAnalysis ? {
              kyoyuAnalysis: savedAnalysis,
              analyzed: true,
              bpm: savedAnalysis.bpm || cached.data.bpm || '',
              key: savedAnalysis.key || cached.data.key || '',
              bpmFromProvider: true,
              keyFromProvider: true,
              primaryGenre: savedAnalysis.primaryGenre || '',
              secondaryGenres: savedAnalysis.secondaryGenres || [],
            } : {}),
          };
          if (cleanKnownLabel && normLabelName(mergedCached.labelName || mergedCached.label || '') !== normLabelName(cleanKnownLabel)) {
            return res.status(200).json({
              ...mergedCached,
              label: cleanKnownLabel,
              labelName: cleanKnownLabel,
            });
          }
          return res.status(200).json(mergedCached);
        }
      }
    } catch (e) {}
  }

  // Fetch primary release & recording sources in parallel
  const searchQuery = [cleanArtist, cleanAlbum || cleanTitle].filter(Boolean).join(' ');
  const [discogs, mb] = await Promise.all([
    fetchDiscogsRelease(searchQuery, discogsReleaseId, cleanArtist, cleanTitle, cleanArtist, cleanAlbum, cleanKnownLabel),
    fetchMusicBrainz(cleanTitle, cleanArtist),
  ]);

  const validDiscogsLabels = (discogs?.labels || []).filter(l => l && isValidLabelForArtist(l.name));
  const matchingKnownDiscogsLabel = cleanKnownLabel
    ? validDiscogsLabels.find(l => normLabelName(l.name) === normLabelName(cleanKnownLabel) || normName(l.name) === normName(cleanKnownLabel))
    : null;
  const validDiscogsLabelObj = matchingKnownDiscogsLabel || validDiscogsLabels[0] || null;
  const primaryLabelName = cleanKnownLabel || validDiscogsLabelObj?.name || (isValidLabelForArtist(mb?.label) ? mb.label : '');
  const primaryLabelId = matchingKnownDiscogsLabel?.id || (!cleanKnownLabel ? validDiscogsLabelObj?.id : null) || null;
  const rawStylesAndGenres = [...(discogs?.styles || []), ...(discogs?.genres || []), ...(mb?.tags || [])];

  // Fetch Artist Info, Label Info, MusicBrainz Label Info, and Multi-Provider Track BPM/Key/ISRC in parallel
  const [discogsArtist, mbArtist, labelInfo, mbLabel, trackMeta] = await Promise.all([
    fetchDiscogsArtistFull(discogs?.primaryArtistId, cleanArtist),
    fetchMusicBrainzArtist(mb?.artistMbid, cleanArtist),
    fetchDiscogsLabel(primaryLabelId, primaryLabelName),
    fetchMusicBrainzLabel(primaryLabelName, primaryLabelId),
    fetchMultiProviderTrackMeta(
      cleanTitle,
      cleanArtist,
      cleanAlbum || discogs?.title || mb?.releaseTitle || '',
      mb?.recordingId || '',
      discogs?.rawNotes || '',
      rawStylesAndGenres,
      { isrc: mb?.isrc || '', recordingIds: mb?.recordingIds || [] }
    ),
  ]);

  // Build links (both unified and categorized by Release, Artist, Label)
  const links = [];
  const releaseLinks = [];
  const artistLinks = [];
  const labelLinks = [];

  // Label display: combine label + series (sub-imprint) properly
  let labelDisplay = '';
  const mainLabelName = [
    cleanKnownLabel,
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

  const labelUrlName = (rawUrl, fallback = 'Website') => {
    const u = String(rawUrl || '').toLowerCase();
    if (u.includes('discogs.com')) return 'Discogs';
    if (u.includes('bandcamp.com')) return 'Bandcamp';
    if (u.includes('soundcloud.com')) return 'SoundCloud';
    if (u.includes('musicbrainz.org')) return 'MusicBrainz';
    if (u.includes('instagram.com')) return 'Instagram';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('ra.co') || u.includes('residentadvisor.net')) return 'Resident Advisor';
    if (u.includes('facebook.com')) return 'Facebook';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'X';
    if (u.includes('wikipedia.org')) return 'Wikipedia';
    return fallback;
  };

  if (discogs?.discogsUrl) {
    links.push({ name: 'Release on Discogs', url: discogs.discogsUrl });
    releaseLinks.push({ name: 'Discogs', url: discogs.discogsUrl });
  }
  if (mb?.recordingId) {
    const mbRecUrl = `https://musicbrainz.org/recording/${mb.recordingId}`;
    links.push({ name: 'MusicBrainz', url: mbRecUrl });
    releaseLinks.push({ name: 'MusicBrainz', url: mbRecUrl });
  }
  if (trackMeta?.scUrl) {
    links.push({ name: 'SoundCloud', url: trackMeta.scUrl });
    releaseLinks.push({ name: 'SoundCloud', url: trackMeta.scUrl });
  }

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
          releaseLinks.push({ name: 'Bandcamp', url: first.item_url_path });
        }
        if (first) {
          bcAlbumTitle = first.album_name || (first.type === 'a' ? first.name : '') || '';
        }
      }
    } catch (e) {}
  }

  if (mb?.releaseUrls) {
    mb.releaseUrls.forEach(u => {
      if (u.url) {
        const nm = labelUrlName(u.url, u.type || 'Website');
        links.push({ name: nm, url: u.url });
        releaseLinks.push({ name: nm, url: u.url });
      }
    });
  }

  // Artist Links
  if (discogsArtist?.discogsUrl) {
    links.push({ name: 'Artist on Discogs', url: discogsArtist.discogsUrl });
    artistLinks.push({ name: 'Discogs', url: discogsArtist.discogsUrl });
  }
  if (Array.isArray(discogsArtist?.urls)) {
    discogsArtist.urls.forEach(u => {
      if (u && /^https?:\/\//i.test(u)) {
        const nm = labelUrlName(u, 'Website');
        links.push({ name: nm, url: u });
        artistLinks.push({ name: nm, url: u });
      }
    });
  }
  if (mbArtist?.urls) {
    mbArtist.urls.forEach(u => {
      if (u.url) {
        const nm = labelUrlName(u.url, u.type === 'official homepage' ? 'Website' : (u.type || 'Website'));
        links.push({ name: nm, url: u.url });
        artistLinks.push({ name: nm, url: u.url });
      }
    });
  }

  // Label Links
  if (labelInfo?.discogsUrl) {
    links.push({ name: 'Label on Discogs', url: labelInfo.discogsUrl });
    labelLinks.push({ name: 'Discogs', url: labelInfo.discogsUrl });
  }
  if (Array.isArray(labelInfo?.urls)) {
    labelInfo.urls.forEach(u => {
      if (u && /^https?:\/\//i.test(u)) {
        const nm = labelUrlName(u, 'Website');
        links.push({ name: nm, url: u });
        labelLinks.push({ name: nm, url: u });
      }
    });
  }
  if (Array.isArray(mbLabel?.urls)) {
    mbLabel.urls.forEach(u => {
      const rawU = typeof u === 'string' ? u : u?.url;
      if (rawU && /^https?:\/\//i.test(rawU)) {
        const nm = labelUrlName(rawU, 'Website');
        links.push({ name: nm, url: rawU });
        labelLinks.push({ name: nm, url: rawU });
      }
    });
  }

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
  const parseDurSec = (dStr) => {
    if (!dStr) return 0;
    const parts = String(dStr).trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(dStr) || 0;
  };
  const resolvedDurSec = parseDurSec(trackDur) || Number(mb?.lengthSec || 0);
  const isLongFormMix = resolvedDurSec > 1320;
  const releaseYear = String(discogs?.year || mb?.year || (trackMeta?.releaseDate ? trackMeta.releaseDate.slice(0, 4) : '') || '');
  const fullReleaseDate = discogs?.released || trackMeta?.releaseDate || mb?.releaseDate || releaseYear;

  const result = {
    _v: 20,
    title: cleanTitle || discogs?.matchedTrack?.title || '',
    album: resolvedAlbumTitle,
    artist: cleanArtist || discogsArtist?.name || '',
    year: releaseYear,
    releaseDate: fullReleaseDate,
    trackPosition: trackPos,
    trackDuration: trackDur,
    isLongFormMix,
    bpm: isLongFormMix ? '' : (savedAnalysis?.bpm || trackMeta?.bpm || ''),
    key: isLongFormMix ? '' : (savedAnalysis?.key || trackMeta?.key || ''),
    bpmFromProvider: isLongFormMix ? false : Boolean(savedAnalysis?.bpm || trackMeta?.bpmFromProvider),
    keyFromProvider: isLongFormMix ? false : Boolean(savedAnalysis?.key || trackMeta?.keyFromProvider),
    analyzed: isLongFormMix ? false : Boolean(savedAnalysis?._analyzed || (trackMeta?.bpmFromProvider && trackMeta?.keyFromProvider && accurateGenres[0])),
    kyoyuAnalysis: isLongFormMix ? null : (savedAnalysis || null),
    primaryGenre: isLongFormMix ? '' : (savedAnalysis?.primaryGenre || accurateGenres[0] || ''),
    secondaryGenres: isLongFormMix ? [] : (savedAnalysis?.secondaryGenres || accurateGenres.slice(1, 4)),
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
    genre: isLongFormMix ? '' : accurateGenres.join(', '),
    styles: isLongFormMix ? [] : accurateGenres,
    genres: isLongFormMix ? [] : (discogs?.genres || []),
    mbTags: isLongFormMix ? [] : (mb?.tags || []),
    formats: discogs?.formats || [],
    country: discogs?.country || mbArtist?.area || '',
    location: artistOrigin || labelCountry || discogs?.country || '',
    description: discogs?.description || '',
    tracklist: discogs?.tracklist || [],
    credits: {
      writing: credits.filter(c => /writ|compos|lyric|author/i.test(c.role)).map(c => c.name),
      production: credits.filter(c => /produc|arrang/i.test(c.role)).map(c => c.name),
      mixing: credits.filter(c => /mix/i.test(c.role)).map(c => c.name),
      mastering: credits.filter(c => /master|lacquer/i.test(c.role)).map(c => c.name),
      artwork: credits.filter(c => /art|design|sleeve|cover|photo|illustr|layout|visual|graphic/i.test(c.role)).map(c => c.name),
      other: credits.filter(c => !/writ|compos|lyric|author|produc|arrang|mix|master|lacquer|art|design|sleeve|cover|photo|illustr|layout|visual|graphic/i.test(c.role)),
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
    releaseLinks,
    artistLinks,
    labelLinks,
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

async function handleGetTrackAnalysis(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { title, artist, tracks } = body || {};
  const items = Array.isArray(tracks) && tracks.length > 0
    ? tracks
    : (title ? [{ title, artist }] : []);
  if (items.length === 0) return res.status(200).json({ analyses: {}, analysis: null });

  const keyToItem = new Map();
  for (const item of items.slice(0, 25)) {
    const t = normName(item?.title || '');
    const a = normName(item?.artist || '');
    if (!t) continue;
    const k = `kyoyu_analysis|${a}|${t}`;
    keyToItem.set(k, item);
  }
  const lookupKeys = [...keyToItem.keys()];
  if (lookupKeys.length === 0) return res.status(200).json({ analyses: {}, analysis: null });

  try {
    const { data: rows } = await supabase
      .from('track_info_cache')
      .select('lookup_key, data')
      .in('lookup_key', lookupKeys);
    const analyses = {};
    for (const row of (rows || [])) {
      if (row?.lookup_key && row?.data?._analyzed) {
        analyses[row.lookup_key] = row.data;
        const shortKey = row.lookup_key.replace(/^kyoyu_analysis\|/, '');
        analyses[shortKey] = row.data;
      }
    }
    const firstKey = lookupKeys[0];
    return res.status(200).json({
      analyses,
      analysis: analyses[firstKey] || null,
    });
  } catch (e) {
    return res.status(200).json({ analyses: {}, analysis: null });
  }
}

async function handleSaveTrackAnalysis(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const items = Array.isArray(body?.analyses) && body.analyses.length > 0
    ? body.analyses
    : [body || {}];

  const rowsToUpsert = [];
  const nowIso = new Date().toISOString();
  for (const item of items.slice(0, 15)) {
    const cleanTitle = String(item.title || '').trim();
    const cleanArtist = stripArtistSuffix(String(item.artist || '').trim());
    const cleanAlbum = String(item.album || '').trim();
    const tNorm = normName(cleanTitle);
    const aNorm = normName(cleanArtist);
    const bpmStr = String(item.bpm || '').trim();
    const keyStr = String(item.key || '').trim();
    const primaryGenre = String(item.primaryGenre || item.genre || '').trim();
    const secondaryGenres = Array.isArray(item.secondaryGenres)
      ? item.secondaryGenres.map(s => String(s || '').trim()).filter(Boolean).slice(0, 3)
      : [];
    if (!tNorm || (!bpmStr && !keyStr && !primaryGenre)) continue;

    const lookupKey = `kyoyu_analysis|${aNorm}|${tNorm}`;
    const payload = {
      _analyzed: true,
      _v: 2,
      title: cleanTitle,
      artist: cleanArtist,
      album: cleanAlbum,
      bpm: bpmStr,
      key: keyStr ? normalizeMusicalKey(keyStr) : '',
      primaryGenre,
      secondaryGenres,
      superGenre: String(item.superGenre || '').trim(),
      subBassRatio: Number(item.subBassRatio || 0),
      kickRegularity4x4: Number(item.kickRegularity4x4 || 0),
      syncopationIndex: Number(item.syncopationIndex || 0),
      spectralBrightness: Number(item.spectralBrightness || 0),
      analyzedAt: nowIso,
    };
    rowsToUpsert.push({
      lookup_key: lookupKey,
      title: cleanTitle,
      artist: cleanArtist,
      album: cleanAlbum,
      data: payload,
      updated_at: nowIso,
    });
  }

  if (rowsToUpsert.length > 0) {
    try {
      await supabase.from('track_info_cache').upsert(rowsToUpsert, { onConflict: 'lookup_key' });
    } catch (e) {}
  }
  return res.status(200).json({ ok: true, saved: rowsToUpsert.length });
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
  const wantAlbumNorm = ctxAlbum ? normName(ctxAlbum) : '';
  const wantTrackNorm = ctxTrack ? normName(ctxTrack) : '';
  const wantLabelCore = ctxLabel ? normLabelName(ctxLabel) : '';

  // 1. If we have track/album/label context (e.g. opened from Player Sheet), resolve the exact artist ID from release & tracklist credits in parallel with artist search
  const releaseContextPromise = (async () => {
    if (!ctxAlbum && !ctxTrack && !ctxLabel) return null;
    const queries = [];
    if (ctxAlbum && ctxLabel && wantAlbumNorm !== wantPlain) {
      queries.push(`https://api.discogs.com/database/search?artist=${encodeURIComponent(clean)}&release_title=${encodeURIComponent(ctxAlbum)}&label=${encodeURIComponent(ctxLabel)}&type=release&per_page=8`);
    }
    if (ctxTrack && ctxLabel) {
      queries.push(`https://api.discogs.com/database/search?artist=${encodeURIComponent(clean)}&track=${encodeURIComponent(ctxTrack)}&label=${encodeURIComponent(ctxLabel)}&type=release&per_page=8`);
    }
    if (ctxAlbum && wantAlbumNorm !== wantPlain) {
      queries.push(`https://api.discogs.com/database/search?artist=${encodeURIComponent(clean)}&release_title=${encodeURIComponent(ctxAlbum)}&type=release&per_page=8`);
    }
    if (ctxTrack) {
      queries.push(`https://api.discogs.com/database/search?artist=${encodeURIComponent(clean)}&track=${encodeURIComponent(ctxTrack)}&type=release&per_page=8`);
    }
    if (ctxLabel) {
      queries.push(`https://api.discogs.com/database/search?artist=${encodeURIComponent(clean)}&label=${encodeURIComponent(ctxLabel)}&type=release&per_page=8`);
    }
    const qCombo = [clean, ctxAlbum || ctxTrack, ctxLabel].filter(Boolean).join(' ');
    queries.push(`https://api.discogs.com/database/search?q=${encodeURIComponent(qCombo)}&type=release&per_page=8`);

    const uniqueQueries = Array.from(new Set(queries)).slice(0, 4);
    const inspectedReleaseIds = new Set();

    for (const url of uniqueQueries) {
      try {
        const r = await fetch(url, { headers: DISCOGS_HEADERS });
        if (!r.ok) continue;
        const d = await r.json();
        const relResults = d.results || [];
        const matchingRels = relResults.filter(rel => {
          const titleStr = String(rel.title || '');
          const artistPart = titleStr.includes(' - ') ? titleStr.split(' - ')[0] : titleStr;
          const isVarious = /^various(\s+artists)?$/i.test(stripArtistSuffix(artistPart));
          if (isVarious && (ctxTrack || ctxAlbum)) return true;
          if (hasAccents && normNameKeepAccents(artistPart).includes(wantAccent)) return true;
          return normName(artistPart) === wantPlain ||
            artistPart.split(/\s*(?:,|&|and|x|vs\.?|feat\.?|ft\.?|\/|\+)\s*/i).some(p => normName(p) === wantPlain);
        });

        // Prioritize releases whose label or title matches the playing context
        matchingRels.sort((a, b) => {
          const scoreRel = (rel) => {
            let s = 0;
            const relLabels = Array.isArray(rel.label) ? rel.label : (rel.label ? [rel.label] : []);
            if (wantLabelCore && relLabels.some(l => normLabelName(l) === wantLabelCore || normName(l).includes(wantLabelCore))) s += 4;
            const parts = String(rel.title || '').split(' - ');
            const relTitleNorm = normName(parts.length > 1 ? parts.slice(1).join(' - ') : rel.title || '');
            if (wantAlbumNorm && (relTitleNorm === wantAlbumNorm || relTitleNorm.includes(wantAlbumNorm))) s += 3;
            if (wantTrackNorm && (relTitleNorm === wantTrackNorm || relTitleNorm.includes(wantTrackNorm))) s += 2;
            return s;
          };
          return scoreRel(b) - scoreRel(a);
        });

        for (const matchingRel of matchingRels.slice(0, 3)) {
          if (!matchingRel?.id || inspectedReleaseIds.has(matchingRel.id)) continue;
          inspectedReleaseIds.add(matchingRel.id);
          const relDetailRes = await fetch(`https://api.discogs.com/releases/${matchingRel.id}`, { headers: DISCOGS_HEADERS });
          if (!relDetailRes.ok) continue;
          const relDetail = await relDetailRes.json();
          const trackCredits = (relDetail.tracklist || []).flatMap(t => [
            ...(t.artists || []),
            ...(t.extraartists || []),
          ]);
          const credits = [
            ...(relDetail.artists || []),
            ...trackCredits,
            ...(relDetail.extraartists || []),
          ];
          const exactAccentCredit = credits.find(a => a && a.id && normNameKeepAccents(a.name) === wantAccent);
          if (exactAccentCredit) return exactAccentCredit.id;
          const exactPlainCredit = credits.find(a => a && a.id && normName(a.name) === wantPlain);
          if (exactPlainCredit) return exactPlainCredit.id;
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
    // If there are multiple homonym artists with the same name and we have track/album/label context,
    // verify which candidate's Discogs catalog actually contains a release matching the playing album, track, or label!
    if (plainMatches.length > 1 && (wantAlbumNorm || wantTrackNorm || wantLabelCore)) {
      try {
        const checkedCandidates = await Promise.all(
          plainMatches.slice(0, 5).map(async (cand) => {
            try {
              const relRes = await fetch(
                `https://api.discogs.com/artists/${cand.id}/releases?sort=year&sort_order=desc&per_page=50`,
                { headers: DISCOGS_HEADERS }
              );
              if (!relRes.ok) return { id: cand.id, score: 0 };
              const relData = await relRes.json();
              let score = 0;
              for (const rel of (relData.releases || [])) {
                const rTitle = normName(rel.title || '');
                const rLabel = normLabelName(rel.label || '');
                if (wantAlbumNorm && rTitle && (rTitle === wantAlbumNorm || rTitle.includes(wantAlbumNorm) || wantAlbumNorm.includes(rTitle))) score += 5;
                if (wantTrackNorm && rTitle && (rTitle === wantTrackNorm || rTitle.includes(wantTrackNorm))) score += 4;
                if (wantLabelCore && rLabel && (rLabel === wantLabelCore || rLabel.includes(wantLabelCore))) score += 4;
              }
              return { id: cand.id, score };
            } catch (e) {
              return { id: cand.id, score: 0 };
            }
          })
        );
        const bestCand = checkedCandidates.sort((a, b) => b.score - a.score)[0];
        if (bestCand && bestCand.score > 0) {
          return { artistId: bestCand.id, results };
        }
      } catch (e) {}
    }

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

const ARTIST_TOP_VERSION = 3;
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
    const validLabelObj = (d?.labels || []).find(l => l?.name && !/^(not on label|self[- ]?released|no label|none)$/i.test(stripArtistSuffix(l.name)))
      || (d?.labels || [])[0];
    const rawRelLabel = validLabelObj?.name ? stripArtistSuffix(validLabelObj.name) : stripArtistSuffix(r.label || '');
    const cleanRelLabel = (!rawRelLabel || /^(not on label.*|self[- ]?released.*|no label|none)$/i.test(rawRelLabel))
      ? stripArtistSuffix(r.artist || artistName || '')
      : rawRelLabel;
    return {
      r, d, avg: Number(rating.average) || 0, count: Number(rating.count) || 0,
      cover: img?.uri || img?.uri150 || r.thumb || '',
      label: cleanRelLabel,
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
    label: label || stripArtistSuffix(r.artist || artistName || ''),
    labels: label ? [label] : (r.artist ? [stripArtistSuffix(r.artist)] : []),
    formats,
    rating: count > 0 ? Math.round(avg * 100) / 100 : null,
    ratingCount: count,
    entityType: 'release',
    provider: 'discogs',
    isExternal: true,
  }));

  // Also extract individual tracks (type: 'track') from the artist's release tracklists
  const seenTracks = new Set();
  for (const { r, d, cover, label } of rows) {
    const rawTracks = (d?.tracklist || []).filter(t => (t.type_ === 'track' || !t.type_) && t.title);
    for (let ti = 0; ti < rawTracks.length; ti++) {
      const trk = rawTracks[ti];
      const trkTitle = String(trk.title || '').trim();
      if (!trkTitle) continue;
      const tk = normName(trkTitle);
      if (!tk || seenTracks.has(tk)) continue;
      seenTracks.add(tk);
      const trkArtist = stripArtistSuffix(r.artist || artistName || '');
      releases.push({
        id: `discogs-trk-${r.id}-${ti}`,
        discogsId: r.id,
        type: 'track',
        title: trkTitle,
        releaseName: r.title || '',
        artistName: trkArtist,
        year: r.year || null,
        thumb: r.thumb || '',
        coverImage: cover,
        label: label || trkArtist,
        labels: label ? [label] : (trkArtist ? [trkArtist] : []),
        trackUrl: `resolve:${trkArtist} ${trkTitle}`.trim(),
        entityType: 'track',
        provider: 'discogs',
        isExternal: true,
      });
    }
  }

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
  const founderClauseRegex = /(?:founded|co-founded|run|owned|started|established|headed|operated|curated|created|launched|managed|set up|imprint of|label of|brainchild of)[^.\n;]{0,100}/gi;
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
  const yearMatch = work.match(/(?:founded|established|started|launched|formed|active since|est\.?|incepted|created|begun)\s+(?:in\s+|around\s+)?((?:19|20)\d{2})\b/i)
    || work.match(/\b((?:19|20)\d{2})\s*[-–]\s*(?:present|now|\d{4})\b/i);
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

  // Plain-text founder extraction when [a=...] tags were not used
  if (founders.length === 0 && cleanText) {
    const plainFounderPatterns = [
      /(?:founded|co-founded|started|established|created|launched|run|operated|headed|owned|managed|curated|set up)\s+(?:in\s+(?:19|20)\d{2}\s+)?(?:in\s+[A-Z][A-Za-z\s,-]{1,28}\s+)?by\s+([A-Z][A-Za-z0-9À-ÖØ-öø-ÿ\s.&,'/-]{1,70}?)(?:\s+(?:in\s+(?:19|20)\d{2}|in\s+[A-Z]|as\s+|to\s+|for\s+|with\s+|who\s+|which\s+|and\s+based|focused|dedicated|specializing)|[.;,\n(]|$)/gi,
      /(?:imprint|label|project|platform)\s+of\s+([A-Z][A-Za-z0-9À-ÖØ-öø-ÿ\s.&,'-]{1,55}?)(?:[.;,\n(]|$)/gi,
    ];
    for (const pat of plainFounderPatterns) {
      let pm;
      while ((pm = pat.exec(cleanText)) !== null) {
        const rawGroup = (pm[1] || '').trim();
        const parts = rawGroup
          .split(/\s*(?:,|&|\band\b|\+)\s*/i)
          .map(s => stripArtistSuffix(s.replace(/^(?:DJ|producer|artist|musician)s?\s+/i, '').trim()))
          .filter(s => s.length >= 2 && s.length <= 36 && /^[A-Z0-9À-ÖØ-Þ]/.test(s) && !/^(the|a|an|this|their|his|her|its|record|records|label|music|london|berlin|detroit|uk|us|usa|germany|france|japan)$/i.test(s));
        for (const p of parts) {
          if (!founders.includes(p)) founders.push(p);
        }
      }
    }
  }

  // Extract city/location from text or contact block
  let extractedLocation = '';
  if (cleanText) {
    const locMatch = cleanText.match(/\b(?:based in|located in|operating out of|hailing from|from|headquartered in)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ\s.-]{2,28}(?:,\s*[A-Z][A-Za-zÀ-ÖØ-öø-ÿ\s.-]{2,24})?)/)
      || cleanText.match(/\b([A-Z][a-zA-ZÀ-ÖØ-öø-ÿ]+(?:\s+[A-Z][a-zA-ZÀ-ÖØ-öø-ÿ]+)?)-based\s+(?:record\s+)?(?:label|imprint|collective)/i);
    if (locMatch && locMatch[1]) {
      extractedLocation = locMatch[1].replace(/\s+(?:record|label|imprint|collective|founded|established|run|started).*$/i, '').replace(/[.,;]+$/, '').trim();
    }
  }

  // Extract any raw URLs or social handles from text
  const rawHttp = cleanText.match(/https?:\/\/[^\s\])"<>]+/gi) || [];
  rawHttp.forEach(u => extractedUrls.push(u.replace(/[.,;]+$/, '')));
  const bareSocial = cleanText.match(/(?:instagram\.com|soundcloud\.com|facebook\.com|ra\.co\/labels|residentadvisor\.net\/record-label\.aspx\?id=|[a-z0-9_-]+\.bandcamp\.com)[a-zA-Z0-9_.\-\/?=&]*/gi) || [];
  bareSocial.forEach(b => {
    const cleaned = b.replace(/[.,;]+$/, '');
    extractedUrls.push(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
  });

  return { cleanText, extractedUrls, founders, foundedYear, referencedLabels, extractedLocation };
}

const CURATED_LABEL_KNOWLEDGE = {
  'warp': { founders: ['Steve Beckett', 'Rob Mitchell', 'Robert Gordon'], foundedYear: '1989', location: 'London, UK', country: 'UK', sublabels: ['Arcola', 'Gift Records', 'Lex Records', 'LuckyMe'] },
  'hyperdub': { founders: ['Kode9'], foundedYear: '2004', location: 'London, UK', country: 'UK', sublabels: ['Flatlines'] },
  'hessle audio': { founders: ['Ben UFO', 'Pearson Sound', 'Pangaea'], foundedYear: '2007', location: 'London, UK', country: 'UK', sublabels: ['Hesaitix'] },
  'livity sound': { founders: ['Peverelist'], foundedYear: '2011', location: 'Bristol, UK', country: 'UK', sublabels: ['Dnuos Ytivil'] },
  'ilian tape': { founders: ['Dario Zenker', 'Marco Zenker'], foundedYear: '2007', location: 'Munich, Germany', country: 'Germany', sublabels: [] },
  'giegling': { founders: ['Konstantin', 'DJ Dustin', 'Dwig', 'Ateq'], foundedYear: '2009', location: 'Weimar, Germany', country: 'Germany', sublabels: ['Forum', 'Staub', 'Traumprinz', 'All Possible Worlds'] },
  'all possible worlds': { founders: ['Traumprinz'], foundedYear: '2017', location: 'Berlin, Germany', country: 'Germany', sublabels: ['Planet Uterus'] },
  'planet uterus': { founders: ['Traumprinz'], foundedYear: '2016', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'ostgut ton': { founders: ['Nick Höppner', 'Michael Teufele', 'Norbert Thormann'], foundedYear: '2005', location: 'Berlin, Germany', country: 'Germany', sublabels: ['Unterton', 'A-TON'] },
  'tresor': { founders: ['Dimitri Hegemann'], foundedYear: '1991', location: 'Berlin, Germany', country: 'Germany', sublabels: [' Headquarters'] },
  'basic channel': { founders: ['Moritz von Oswald', 'Mark Ernestus'], foundedYear: '1993', location: 'Berlin, Germany', country: 'Germany', sublabels: ['Chain Reaction', 'Maurizio', 'Main Street Records', 'Burial Mix', 'Rhythm & Sound'] },
  'chain reaction': { founders: ['Moritz von Oswald', 'Mark Ernestus'], foundedYear: '1995', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'burial mix': { founders: ['Moritz von Oswald', 'Mark Ernestus'], foundedYear: '1996', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'rhythm sound': { founders: ['Moritz von Oswald', 'Mark Ernestus'], foundedYear: '1997', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'delsin': { founders: ['Marsel van der Wielen'], foundedYear: '1996', location: 'Amsterdam, Netherlands', country: 'Netherlands', sublabels: ['Ann Aimee', 'Mantis', 'DSR Lines'] },
  'mantis': { founders: ['Marsel van der Wielen'], foundedYear: '2019', location: 'Amsterdam, Netherlands', country: 'Netherlands', sublabels: [] },
  'dekmantel': { founders: ['Thomas Martojo', 'Casper Tielrooij'], foundedYear: '2009', location: 'Amsterdam, Netherlands', country: 'Netherlands', sublabels: ['Dekmantel UFO Series'] },
  'rush hour': { founders: ['Antal Heitlager', 'Christiaan Macdonald'], foundedYear: '1997', location: 'Amsterdam, Netherlands', country: 'Netherlands', sublabels: ['No Label'] },
  'clone': { founders: ['Serge Verschuren'], foundedYear: '1992', location: 'Rotterdam, Netherlands', country: 'Netherlands', sublabels: ['Clone Basement Series', 'Clone Jack For Daze', 'Clone Royal Oak', 'Clone West Coast Series', 'Clone Aqualung Series'] },
  'stroboscopic artefacts': { founders: ['Lucy'], foundedYear: '2009', location: 'Berlin, Germany', country: 'Germany', sublabels: ['Monad', 'Totem'] },
  'northern electronics': { founders: ['Anthony Linell', 'Varg²™'], foundedYear: '2013', location: 'Stockholm, Sweden', country: 'Sweden', sublabels: [] },
  'hypnus': { founders: ['Michel Iseneld'], foundedYear: '2013', location: 'Stockholm, Sweden', country: 'Sweden', sublabels: ['Kabbalistic Village'] },
  'spazio disponibile': { founders: ['Donato Dozzy', 'Neel'], foundedYear: '2015', location: 'Rome, Italy', country: 'Italy', sublabels: [] },
  'timedance': { founders: ['Batu'], foundedYear: '2015', location: 'Bristol, UK', country: 'UK', sublabels: [] },
  'deep medi': { founders: ['Mala'], foundedYear: '2006', location: 'London, UK', country: 'UK', sublabels: [] },
  'deep medi musik': { founders: ['Mala'], foundedYear: '2006', location: 'London, UK', country: 'UK', sublabels: [] },
  'planet mu': { founders: ['Mike Paradinas'], foundedYear: '1995', location: 'London, UK', country: 'UK', sublabels: [] },
  'ninja tune': { founders: ['Matt Black', 'Jonathan More'], foundedYear: '1990', location: 'London, UK', country: 'UK', sublabels: ['Big Dada', 'Brainfeeder', 'Technicolour', 'Counter Records'] },
  'r s': { founders: ['Renaat Vandepapeliere', 'Sabine Maes'], foundedYear: '1984', location: 'Ghent, Belgium', country: 'Belgium', sublabels: ['Apollo', 'Global Cuts'] },
  'xl': { founders: ['Richard Russell', 'Tim Palmer', 'Nick Halkes'], foundedYear: '1989', location: 'London, UK', country: 'UK', sublabels: ['Young'] },
  'kompakt': { founders: ['Wolfgang Voigt', 'Michael Mayer', 'Jürgen Paape'], foundedYear: '1998', location: 'Cologne, Germany', country: 'Germany', sublabels: ['Kompakt Extra', 'K2'] },
  'perlon': { founders: ['Zip', 'Markus Nikolai', 'Chris Rehberger'], foundedYear: '1997', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'dial': { founders: ['Lawrence', 'Carsten Jost', 'Paul Brtschitsch'], foundedYear: '2000', location: 'Hamburg, Germany', country: 'Germany', sublabels: ['Laid'] },
  'smallville': { founders: ['Julius Steinhoff', 'Just von Ahlefeld', 'Stefan Marx'], foundedYear: '2006', location: 'Hamburg, Germany', country: 'Germany', sublabels: [] },
  'workshop': { founders: ['Lowtec'], foundedYear: '2006', location: 'Germany', country: 'Germany', sublabels: [] },
  'running back': { founders: ['Gerd Janson'], foundedYear: '2002', location: 'Lorsch, Germany', country: 'Germany', sublabels: ['Running Back Double Copy'] },
  'innervisions': { founders: ['Dixon', 'Âme'], foundedYear: '2005', location: 'Berlin, Germany', country: 'Germany', sublabels: ['Exit Strategy'] },
  'pampa': { founders: ['DJ Koze', 'Marcus Fink'], foundedYear: '2009', location: 'Hamburg, Germany', country: 'Germany', sublabels: [] },
  'mule musiq': { founders: ['Toshiya Kawasaki'], foundedYear: '2004', location: 'Tokyo, Japan', country: 'Japan', sublabels: ['Endless Flight', 'Studio Mule'] },
  'music from memory': { founders: ['Jamie Tiller', 'Tako Reyenga', 'Abel Nagengast'], foundedYear: '2013', location: 'Amsterdam, Netherlands', country: 'Netherlands', sublabels: ['Second Circle'] },
  'houndstooth': { founders: ['Rob Booth'], foundedYear: '2013', location: 'London, UK', country: 'UK', sublabels: [] },
  'downwards': { founders: ['Regis', 'Female'], foundedYear: '1993', location: 'Birmingham, UK', country: 'UK', sublabels: ['Sandwell District'] },
  'sandwell district': { founders: ['Regis', 'Function', 'Silent Servant', 'Female'], foundedYear: '2002', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'token': { founders: ['Kr!z'], foundedYear: '2007', location: 'Ghent, Belgium', country: 'Belgium', sublabels: [] },
  'mord': { founders: ['Bas Mooy'], foundedYear: '2013', location: 'Rotterdam, Netherlands', country: 'Netherlands', sublabels: [] },
  'semantica': { founders: ['Svreca'], foundedYear: '2006', location: 'Madrid, Spain', country: 'Spain', sublabels: [] },
  'polegroup': { founders: ['Oscar Mulero'], foundedYear: '2004', location: 'Madrid, Spain', country: 'Spain', sublabels: ['Warm Up Recordings'] },
  'warm up': { founders: ['Oscar Mulero'], foundedYear: '2000', location: 'Madrid, Spain', country: 'Spain', sublabels: [] },
  'underground resistance': { founders: ['Jeff Mills', 'Mad Mike Banks', 'Robert Hood'], foundedYear: '1989', location: 'Detroit, US', country: 'US', sublabels: ['Red Planet', 'Somewhere In Detroit'] },
  'axis': { founders: ['Jeff Mills'], foundedYear: '1992', location: 'Chicago, US', country: 'US', sublabels: ['Purpose Maker', 'Tomorrow'] },
  'metroplex': { founders: ['Juan Atkins'], foundedYear: '1985', location: 'Detroit, US', country: 'US', sublabels: [] },
  'transmat': { founders: ['Derrick May'], foundedYear: '1986', location: 'Detroit, US', country: 'US', sublabels: ['Fragile Records'] },
  'planet e': { founders: ['Carl Craig'], foundedYear: '1991', location: 'Detroit, US', country: 'US', sublabels: [] },
  'fxhe': { founders: ['Omar S'], foundedYear: '2003', location: 'Detroit, US', country: 'US', sublabels: [] },
  'mahogani music': { founders: ['Moodymann'], foundedYear: '1998', location: 'Detroit, US', country: 'US', sublabels: ['KDJ'] },
  'kdj': { founders: ['Moodymann'], foundedYear: '1994', location: 'Detroit, US', country: 'US', sublabels: [] },
  'sound signature': { founders: ['Theo Parrish'], foundedYear: '1997', location: 'Detroit, US', country: 'US', sublabels: [] },
  'echospace': { founders: ['Rod Modell', 'Stephen Hitchell'], foundedYear: '2007', location: 'Detroit, US', country: 'US', sublabels: [] },
  'mojuba': { founders: ['Don Williams', 'Oracy'], foundedYear: '2006', location: 'Berlin, Germany', country: 'Germany', sublabels: ['Wandler', 'a.r.t.less'] },
  'frustrated funk': { founders: ['Jeroen Schrijvershof'], foundedYear: '2004', location: 'Rotterdam, Netherlands', country: 'Netherlands', sublabels: [] },
  'l i e s': { founders: ['Ron Morelli'], foundedYear: '2010', location: 'New York, US', country: 'US', sublabels: ['Russian Torrent Versions'] },
  'hospital productions': { founders: ['Dominick Fernow'], foundedYear: '1997', location: 'New York, US', country: 'US', sublabels: ['Bed Of Nails'] },
  'posh isolation': { founders: ['Loke Rahbek', 'Christian Stadsgaard'], foundedYear: '2009', location: 'Copenhagen, Denmark', country: 'Denmark', sublabels: [] },
  'pan': { founders: ['Bill Kouligas'], foundedYear: '2008', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'blackest ever black': { founders: ['Kiran Sande'], foundedYear: '2010', location: 'London, UK', country: 'UK', sublabels: [] },
  'modern love': { founders: ['Shlomoh'], foundedYear: '2002', location: 'Manchester, UK', country: 'UK', sublabels: ['Daphne', 'Boomkat Editions'] },
  'raster noton': { founders: ['Olaf Bender', 'Carsten Nicolai', 'Frank Bretschneider'], foundedYear: '1999', location: 'Chemnitz, Germany', country: 'Germany', sublabels: ['Raster-Media'] },
  'editions mego': { founders: ['Peter Rehberg'], foundedYear: '1995', location: 'Vienna, Austria', country: 'Austria', sublabels: ['Ideologic Organ', 'Recollection GRM', 'Spectrum Spools'] },
  'touch': { founders: ['Mike Harding', 'Jon Wozencroft'], foundedYear: '1982', location: 'London, UK', country: 'UK', sublabels: ['Ash International'] },
  'kranky': { founders: ['Bruce Adams', 'Joel Leoschke'], foundedYear: '1993', location: 'Chicago, US', country: 'US', sublabels: [] },
  'ghostly international': { founders: ['Sam Valenti IV'], foundedYear: '1999', location: 'Ann Arbor, US', country: 'US', sublabels: ['Spectral Sound'] },
  'stones throw': { founders: ['Peanut Butter Wolf'], foundedYear: '1996', location: 'Los Angeles, US', country: 'US', sublabels: ['Leaving Records'] },
  'brainfeeder': { founders: ['Flying Lotus'], foundedYear: '2008', location: 'Los Angeles, US', country: 'US', sublabels: [] },
  'teklife': { founders: ['DJ Rashad', 'DJ Spinn', 'Ashes57'], foundedYear: '2012', location: 'Chicago, US', country: 'US', sublabels: [] },
  'astrophonica': { founders: ['Fracture'], foundedYear: '2009', location: 'London, UK', country: 'UK', sublabels: [] },
  'rupture': { founders: ['Mantra', 'Double O'], foundedYear: '2006', location: 'London, UK', country: 'UK', sublabels: [] },
  'ruptureldn': { founders: ['Mantra', 'Double O'], foundedYear: '2006', location: 'London, UK', country: 'UK', sublabels: [] },
  'samurai music': { founders: ['Geoff Wright'], foundedYear: '2007', location: 'Berlin, Germany', country: 'Germany', sublabels: ['Samurai Horo', 'Red Seal'] },
  'metalheadz': { founders: ['Goldie', 'Kemistry', 'Storm'], foundedYear: '1994', location: 'London, UK', country: 'UK', sublabels: ['Metalheadz Platinum'] },
  'exit': { founders: ['dBridge'], foundedYear: '2003', location: 'London, UK', country: 'UK', sublabels: [] },
  'punch drunk': { founders: ['Peverelist'], foundedYear: '2006', location: 'Bristol, UK', country: 'UK', sublabels: [] },
  'tectonic': { founders: ['Pinch'], foundedYear: '2005', location: 'Bristol, UK', country: 'UK', sublabels: ['Cold Recordings'] },
  'tempa': { founders: ['Neil Jolliffe'], foundedYear: '2000', location: 'London, UK', country: 'UK', sublabels: [] },
  'dmz': { founders: ['Mala', 'Coki', 'Loefah', 'Sgt Pokes'], foundedYear: '2005', location: 'London, UK', country: 'UK', sublabels: [] },
  'night slugs': { founders: ['Bok Bok', 'L-Vis 1990'], foundedYear: '2010', location: 'London, UK', country: 'UK', sublabels: ['Club Constructions'] },
  'numbers': { founders: ['Jackmaster', 'Spencer', ' Goodhand', 'Morton', 'Nelson'], foundedYear: '2010', location: 'Glasgow, UK', country: 'UK', sublabels: [] },
  'whities': { founders: ['Nic Tasker'], foundedYear: '2014', location: 'London, UK', country: 'UK', sublabels: [] },
  'ad 93': { founders: ['Nic Tasker'], foundedYear: '2014', location: 'London, UK', country: 'UK', sublabels: [] },
  'wisdom teeth': { founders: ['Facta', 'K-LONE'], foundedYear: '2014', location: 'London, UK', country: 'UK', sublabels: [] },
  'kalahari oyster cult': { founders: ['Rey Colino'], foundedYear: '2017', location: 'Amsterdam, Netherlands', country: 'Netherlands', sublabels: ['Oyster Discs'] },
  'safe trip': { founders: ['Young Marco'], foundedYear: '2015', location: 'Amsterdam, Netherlands', country: 'Netherlands', sublabels: [] },
  'peach discs': { founders: ['Shanti Celeste', 'Gramrcy'], foundedYear: '2017', location: 'Bristol, UK', country: 'UK', sublabels: [] },
  'shall not fade': { founders: ['Kieran Williams'], foundedYear: '2015', location: 'Bristol, UK', country: 'UK', sublabels: ['Time Is Now', 'Lost Palms'] },
  'naff': { founders: ['Priori', 'Ex-Terrestrial'], foundedYear: '2018', location: 'Montreal, Canada', country: 'Canada', sublabels: [] },
  'moonshoe': { founders: ['Cousin', 'Jackson Fester'], foundedYear: '2019', location: 'Sydney, Australia', country: 'Australia', sublabels: [] },
  'voam': { founders: ['Blawan', 'Pariah'], foundedYear: '2018', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'ternesc': { founders: ['Blawan'], foundedYear: '2015', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'eaux': { founders: ['Rrose'], foundedYear: '2012', location: 'San Francisco, US', country: 'US', sublabels: [] },
  'dynamic tension': { founders: ['Surgeon'], foundedYear: '1997', location: 'Birmingham, UK', country: 'UK', sublabels: [] },
  'hadal': { founders: ['Pangaea'], foundedYear: '2012', location: 'London, UK', country: 'UK', sublabels: [] },
  'canino': { founders: ['Call Super'], foundedYear: '2021', location: 'Berlin, Germany', country: 'Germany', sublabels: [] },
  'lustwerk music': { founders: ['Galcher Lustwerk'], foundedYear: '2013', location: 'New York, US', country: 'US', sublabels: [] },
};

function lookupCuratedLabelMeta(labelName) {
  if (!labelName) return null;
  const full = normName(labelName);
  const core = normLabelName(labelName);
  return CURATED_LABEL_KNOWLEDGE[full] || CURATED_LABEL_KNOWLEDGE[core] || null;
}

async function fetchWikidataLabelMeta(labelName, mbUrls = []) {
  if (!labelName && (!mbUrls || !mbUrls.length)) return null;
  try {
    let qid = '';
    const wdUrl = (mbUrls || []).find(u => /wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i.test(u));
    if (wdUrl) {
      const m = wdUrl.match(/(Q\d+)/i);
      if (m) qid = m[1].toUpperCase();
    }
    if (!qid && labelName) {
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(labelName)}&language=en&format=json&limit=4`;
      const sRes = await fetch(searchUrl, { headers: MB_HEADERS, signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (sRes && Array.isArray(sRes.search)) {
        const hit = sRes.search.find(item => /record label|imprint|music label|independent label/i.test(item.description || ''))
          || sRes.search.find(item => normLabelName(item.label || '') === normLabelName(labelName));
        if (hit?.id) qid = hit.id;
      }
    }
    if (!qid) return null;

    const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims|descriptions&languages=en&format=json`;
    const eRes = await fetch(entUrl, { headers: MB_HEADERS, signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.json() : null).catch(() => null);
    const ent = eRes?.entities?.[qid];
    if (!ent) return null;

    const claims = ent.claims || {};
    let foundedYear = '';
    const p571 = claims.P571?.[0]?.mainsnak?.datavalue?.value?.time;
    if (p571) {
      const ym = String(p571).match(/([12]\d{3})/);
      if (ym) foundedYear = ym[1];
    }

    const extractIds = (prop) => (claims[prop] || [])
      .map(c => c?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);

    const founderIds = extractIds('P112');
    const hqIds = extractIds('P159');
    const countryIds = extractIds('P17');
    const sublabelIds = extractIds('P355');
    const parentIds = extractIds('P749');
    const allLookupIds = Array.from(new Set([...founderIds, ...hqIds, ...countryIds, ...sublabelIds, ...parentIds])).slice(0, 20);

    let idLabels = {};
    if (allLookupIds.length > 0) {
      const lblUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${allLookupIds.join('|')}&props=labels&languages=en&format=json`;
      const lRes = await fetch(lblUrl, { headers: MB_HEADERS, signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (lRes?.entities) {
        for (const [id, obj] of Object.entries(lRes.entities)) {
          const val = obj?.labels?.en?.value;
          if (val) idLabels[id] = stripArtistSuffix(val);
        }
      }
    }

    const website = claims.P856?.[0]?.mainsnak?.datavalue?.value || '';
    const description = ent?.descriptions?.en?.value || '';

    return {
      qid,
      foundedYear,
      founders: founderIds.map(id => idLabels[id]).filter(Boolean),
      location: hqIds.map(id => idLabels[id]).filter(Boolean)[0] || '',
      country: countryIds.map(id => idLabels[id]).filter(Boolean)[0] || '',
      sublabels: sublabelIds.map(id => idLabels[id]).filter(Boolean),
      parentLabel: parentIds.map(id => idLabels[id]).filter(Boolean)[0] || '',
      website,
      description,
    };
  } catch (e) {
    return null;
  }
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

  const cacheKey = `artist-profile-v8|${artistId}`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 8);
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
    _v: 8,
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

  const cacheKey = `label-profile-v7|${labelId || normLabelName(labelName || '')}`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 7);
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
  const curated = lookupCuratedLabelMeta(resolvedLabelName) || lookupCuratedLabelMeta(labelName || '');

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

    const wantLabelExact = normName(resolvedLabelName);
    const wantLabelCore = normLabelName(resolvedLabelName);
    const matchesTargetLabel = (lblStr) => {
      const cleanLbl = stripArtistSuffix(lblStr || '');
      if (!cleanLbl) return false;
      const nExact = normName(cleanLbl);
      if (nExact === wantLabelExact) return true;
      const nCore = normLabelName(cleanLbl);
      return wantLabelCore.length >= 4 && nCore === wantLabelCore;
    };

    const verifiedSearchResults = Array.isArray(relSearchRes?.results)
      ? relSearchRes.results.filter(sr => {
          const srLabels = Array.isArray(sr.label) ? sr.label : (sr.label ? [sr.label] : []);
          return srLabels.length > 0 && srLabels.some(matchesTargetLabel);
        })
      : [];

    // Extract high-res covers, years, genres, styles, and country ONLY from verified label search results
    const hiResCovers = new Map();
    const searchYears = new Map();
    if (verifiedSearchResults.length > 0) {
      const countryCounts = new Map();
      for (const sr of verifiedSearchResults) {
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
      if (!cleanTitle) continue;
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

    // Only fallback to verified search results when /labels/{id}/releases returned no releases (e.g. labelId not resolved)
    if (allDcLabelReleases.length === 0 && verifiedSearchResults.length > 0) {
      for (const sr of verifiedSearchResults) {
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

  // 4. Clean and resolve Discogs profile, contact_info markup, and Wikidata metadata in parallel
  const [profileResolved, contactResolved, wdData] = await Promise.all([
    resolveDiscogsTextAndMeta(profileData?.profile || ''),
    resolveDiscogsTextAndMeta(profileData?.contact_info || ''),
    fetchWikidataLabelMeta(resolvedLabelName, mbData?.urls || []),
  ]);

  const discogsUrl = labelId ? (profileData?.uri || `https://www.discogs.com/label/${labelId}`) : '';
  const mbUrl = mbData?.mbUrl || '';

  // Resolve Founders (Curated -> Discogs -> MusicBrainz -> Wikidata -> Earliest/Core Catalog Artist Fallback)
  let founders = Array.from(new Set([
    ...(curated?.founders || []),
    ...profileResolved.founders,
    ...contactResolved.founders,
    ...(mbData?.founders || []),
    ...(wdData?.founders || []),
  ])).filter(Boolean);

  if (founders.length === 0 && topReleases.length > 0) {
    // Derive from earliest release (#001 / earliest year) or dominant non-Various catalog artist
    const validRelArtists = topReleases
      .map(r => ({
        artist: stripArtistSuffix(r.artist || r.artistName || ''),
        year: parseInt(r.year, 10) || 9999,
        catno: String(r.catno || ''),
      }))
      .filter(x => x.artist && !/^(various|various artists|unknown|unknown artist|—|-)$/i.test(x.artist) && normName(x.artist) !== normName(resolvedLabelName));

    if (validRelArtists.length > 0) {
      const cat01 = validRelArtists.find(x => /(?:^|[^0-9])0*1(?:$|[^0-9])/i.test(x.catno));
      if (cat01) {
        founders = [cat01.artist];
      } else {
        const sortedByYear = [...validRelArtists].sort((a, b) => a.year - b.year);
        const earliestArtist = sortedByYear[0]?.artist;
        const counts = new Map();
        for (const item of validRelArtists) {
          counts.set(item.artist, (counts.get(item.artist) || 0) + 1);
        }
        const topArtist = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        founders = Array.from(new Set([earliestArtist, topArtist].filter(Boolean))).slice(0, 2);
      }
    }
  }

  // Resolve Founded Year (Curated -> MusicBrainz -> Wikidata -> Discogs Profile -> Earliest Catalog Release Year)
  const earliestCatalogYear = (() => {
    const years = topReleases
      .map(r => parseInt(r.year, 10))
      .filter(y => y >= 1950 && y <= new Date().getFullYear() + 1);
    return years.length > 0 ? String(Math.min(...years)) : '';
  })();

  const foundedYear = curated?.foundedYear
    || mbData?.foundedYear
    || wdData?.foundedYear
    || profileResolved.foundedYear
    || contactResolved.foundedYear
    || earliestCatalogYear
    || '';

  const parentLabel = (profileData?.parent_label?.name ? stripArtistSuffix(profileData.parent_label.name) : '')
    || mbData?.parentLabel
    || wdData?.parentLabel
    || '';

  const sublabels = Array.from(new Set([
    ...(profileData?.sublabels || []).map(s => stripArtistSuffix(s.name || '')),
    ...(mbData?.sublabels || []),
    ...(wdData?.sublabels || []),
    ...(curated?.sublabels || []),
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
    wdData?.website || '',
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

    if (!bcDiscoveredUrl || !bcDiscoveredLoc) {
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
            if (!bcDiscoveredUrl) {
              bcDiscoveredUrl = bcHit.item_url_root || bcHit.item_url_path || bcHit.url || '';
              if (bcDiscoveredUrl) rawUrls.push(bcDiscoveredUrl);
            }
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
              const locSpan = (html.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
              if (locSpan && !bcDiscoveredLoc) {
                bcDiscoveredLoc = locSpan.replace(/<[^>]+>/g, '').trim();
              }
              break;
            }
          }
        } catch (e) {}
      }
    }
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

  // Resolve Country and Location ("City, Country")
  const resolvedCountry = curated?.country || mbData?.country || wdData?.country || dcCountry || '';
  const rawCityOrLoc = curated?.location
    || bcDiscoveredLoc
    || wdData?.location
    || profileResolved.extractedLocation
    || contactResolved.extractedLocation
    || '';
  const resolvedLocation = (() => {
    if (rawCityOrLoc && resolvedCountry) {
      if (rawCityOrLoc.toLowerCase().includes(resolvedCountry.toLowerCase())) return rawCityOrLoc;
      return `${rawCityOrLoc}, ${resolvedCountry}`;
    }
    return rawCityOrLoc || resolvedCountry || '';
  })();

  // Combine biography from Discogs + MusicBrainz + synthesized encyclopedic details so About is always full
  const bioParts = [];
  if (profileResolved.cleanText) bioParts.push(profileResolved.cleanText);
  if (mbData?.annotation && (!profileResolved.cleanText || !profileResolved.cleanText.toLowerCase().includes(mbData.annotation.slice(0, 40).toLowerCase()))) {
    bioParts.push(mbData.annotation);
  }
  if (bioParts.length === 0 && mbData?.disambiguation) {
    bioParts.push(mbData.disambiguation);
  }
  if (bioParts.length === 0 && wdData?.description) {
    bioParts.push(wdData.description);
  }

  // Ensure About section always has a rich, complete encyclopedic overview
  const existingBioJoined = bioParts.join('\n\n').trim();
  const rosterArtists = Array.from(new Set(
    topReleases
      .map(r => stripArtistSuffix(r.artist || r.artistName || ''))
      .filter(a => a && !/^(various|various artists|unknown)$/i.test(a) && normName(a) !== normName(resolvedLabelName))
  )).slice(0, 8);
  const synthBits = [];
  const originBit = [
    foundedYear ? `founded in ${foundedYear}` : '',
    founders.length > 0 ? `by ${founders.join(', ')}` : '',
    resolvedLocation ? `and based in ${resolvedLocation}` : '',
  ].filter(Boolean).join(' ');
  const styleBit = combinedGenres.length > 0
    ? `Focused on ${combinedGenres.slice(0, 5).join(', ')}`
    : 'Dedicated to forward-thinking independent music';
  if (existingBioJoined.length < 140) {
    synthBits.push(`${resolvedLabelName} is a record label${originBit ? ` ${originBit}` : ''}. ${styleBit}, the imprint has curated ${topReleases.length > 0 ? `a catalog of ${topReleases.length}+ releases` : 'an influential underground catalog'}${rosterArtists.length > 0 ? ` featuring artists such as ${rosterArtists.join(', ')}` : ''}.`);
  } else if (rosterArtists.length > 0 && !rosterArtists.slice(0, 3).some(a => existingBioJoined.toLowerCase().includes(a.toLowerCase()))) {
    synthBits.push(`Key artists in the ${resolvedLabelName} catalog include ${rosterArtists.join(', ')}${combinedGenres.length > 0 ? `, spanning ${combinedGenres.slice(0, 5).join(', ')}` : ''}.`);
  }
  if (parentLabel && !existingBioJoined.toLowerCase().includes(parentLabel.toLowerCase())) {
    synthBits.push(`Operates as part of the ${parentLabel} label family.`);
  }
  if (contactResolved.cleanText && !existingBioJoined.toLowerCase().includes(contactResolved.cleanText.slice(0, 30).toLowerCase())) {
    synthBits.push(`Contact & Info: ${contactResolved.cleanText}`);
  }
  if (synthBits.length > 0) {
    bioParts.push(synthBits.join(' '));
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
    _v: 7,
    id: labelId || mbData?.mbid || `label-${normLabelName(resolvedLabelName)}`,
    name: resolvedLabelName,
    profile: bioParts.filter(Boolean).join('\n\n'),
    contactInfo: contactResolved.cleanText || '',
    parentLabel,
    parentLabelId: profileData?.parent_label?.id || null,
    sublabels,
    foundedYear,
    founders,
    labelType: mbData?.labelType || '',
    labelCode: mbData?.labelCode || '',
    aliases: mbData?.aliases || [],
    country: resolvedCountry,
    location: resolvedLocation,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
  if (requestLog.length >= RATE_LIMIT) return res.status(429).json({ error: 'Rate limit reached' });
  requestLog.push(now);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  if (!body || typeof body !== 'object') {
    body = { ...(req.query || {}) };
  } else if (req.query && typeof req.query === 'object') {
    body = { ...req.query, ...body };
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

  // ==== ACTION: get-track-analysis ====
  if (action === 'get-track-analysis') {
    return handleGetTrackAnalysis(body, res);
  }

  // ==== ACTION: save-track-analysis ====
  if (action === 'save-track-analysis') {
    return handleSaveTrackAnalysis(body, res);
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
