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
  return [artist, album || title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
}

async function fetchDiscogsRelease(query, explicitReleaseId = null) {
  try {
    let best = null;
    let explicitType = 'release';
    
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
      const searchRes = await fetch(
        `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=5`,
        { headers: DISCOGS_HEADERS }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        best = searchData.results?.[0];
      }
    }
    if (!best) return null;
    let detail = null;
    if (best.id) {
      try {
        const endpoint = best.type === 'master' ? `masters/${best.id}` : `releases/${best.id}`;
        const r = await fetch(`https://api.discogs.com/${endpoint}`, { headers: DISCOGS_HEADERS });
        if (r.ok) detail = await r.json();
        
        // If it was a master, Discogs uses 'main_release' or we can still extract year/title
        if (best.type === 'master' && detail && detail.main_release) {
           const mr = await fetch(`https://api.discogs.com/releases/${detail.main_release}`, { headers: DISCOGS_HEADERS });
           if (mr.ok) detail = await mr.json();
        }
      } catch (e) {}
    }
    const credits = [];
    (detail?.extraartists || []).forEach(ea => {
      credits.push({ name: ea.name?.replace(/\s\(\d+\)$/, '') || '', role: ea.role || '' });
    });
    const releaseArtists = (detail?.artists || []).map(a => ({
      name: a.name?.replace(/\s\(\d+\)$/, '') || '', id: a.id,
    }));
    const labels = (detail?.labels || []).map(l => ({ name: l.name?.replace(/\s\(\d+\)$/, '') || '', catno: l.catno || '', id: l.id }));
    // Series = sub-imprints (e.g., "Mantis" under "Delsin")
    const series = (detail?.series || []).map(s => ({ name: s.name?.replace(/\s\(\d+\)$/, '') || '', catno: s.catno || '', id: s.id }));
    return {
      title: detail?.title || best.title || '',
      year: detail?.year || best.year || '',
      genre: [...(detail?.genres || best.genre || []), ...(detail?.styles || best.style || [])].join(', '),
      labels, series, country: detail?.country || '',
      description: (detail?.notes || '').replace(/Track durations and BPM are not provided on the record\.?/gi, '').replace(/\[a=([^\]]+)\]/g, '$1').replace(/\[l=([^\]]+)\]/g, '$1').replace(/\[url=[^\]]*\]([^\[]*)\[\/url\]/g, '$1').replace(/\[b\]|\[\/b\]|\[i\]|\[\/i\]/g, ''),
      formats: (detail?.formats || []).map(f => {
        const parts = [f.name];
        if (f.descriptions) parts.push(...f.descriptions);
        if (f.qty && f.qty !== '1') parts.unshift(`${f.qty}x`);
        return parts.join(', ');
      }),
      tracklist: (detail?.tracklist || []).filter(t => t.type_ === 'track').map(t => ({
        position: t.position || '', title: t.title || '', duration: t.duration || '',
        artists: (t.artists || []).map(a => a.name?.replace(/\s\(\d+\)$/, '') || ''),
      })),
      credits, releaseArtists,
      discogsUrl: detail?.uri ? (detail.uri.startsWith('http') ? detail.uri : `https://www.discogs.com${detail.uri}`) : (best?.uri ? (best.uri.startsWith('http') ? best.uri : `https://www.discogs.com${best.uri}`) : ''),
      primaryArtistId: detail?.artists?.[0]?.id || null,
    };
  } catch (e) { return null; }
}

async function fetchDiscogsArtistFull(artistId) {
  if (!artistId) return null;
  try {
    const res = await fetch(`https://api.discogs.com/artists/${artistId}`, { headers: DISCOGS_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    let topReleases = [], latestReleases = [];
    try {
      const relRes = await fetch(`https://api.discogs.com/artists/${artistId}/releases?sort=year&sort_order=desc&per_page=15&page=1`, { headers: DISCOGS_HEADERS });
      if (relRes.ok) {
        const relData = await relRes.json();
        const releases = (relData.releases || []).filter(r => r.role === 'Main' || r.role === 'TrackAppearance');
        latestReleases = releases.slice(0, 3).map(r => ({ title: r.title || '', year: r.year || 0, label: r.label || '' }));
      }
    } catch (e) {}
    try {
      const popRes = await fetch(`https://api.discogs.com/artists/${artistId}/releases?sort=year&sort_order=asc&per_page=20&page=1`, { headers: DISCOGS_HEADERS });
      if (popRes.ok) {
        const popData = await popRes.json();
        const mainReleases = (popData.releases || []).filter(r => r.role === 'Main' && r.type !== 'appearance');
        topReleases = mainReleases.slice(0, 3).map(r => ({ title: r.title || '', year: r.year || 0, label: r.label || '' }));
      }
    } catch (e) {}
    let cleanBio = (data.profile || '')
      .replace(/\[a=([^\]]+)\]/gi, '$1')
      .replace(/\[l=([^\]]+)\]/gi, '$1')
      .replace(/\[url=[^\]]*\]([^\[]*)\[\/url\]/gi, '$1')
      .replace(/\[b\]|\[\/b\]|\[i\]|\[\/i\]/gi, '');
      
    // Fetch numeric tags [l12345], [a12345]
    const tagRegex = /\[([alrm])(\d+)\]/gi;
    let match;
    const toFetch = [];
    while ((match = tagRegex.exec(cleanBio)) !== null) {
      toFetch.push({ full: match[0], type: match[1].toLowerCase(), id: match[2] });
    }
    
    if (toFetch.length > 0) {
      const uniqueTags = [...new Map(toFetch.map(item => [item.full, item])).values()];
      await Promise.all(uniqueTags.slice(0, 8).map(async (tag) => {
         try {
           let endpoint = '';
           if (tag.type === 'l') endpoint = `labels/${tag.id}`;
           else if (tag.type === 'a') endpoint = `artists/${tag.id}`;
           else if (tag.type === 'r') endpoint = `releases/${tag.id}`;
           else if (tag.type === 'm') endpoint = `masters/${tag.id}`;
           if (!endpoint) return;
           const res = await fetch(`https://api.discogs.com/${endpoint}`, { headers: DISCOGS_HEADERS });
           if (res.ok) {
             const json = await res.json();
             const name = json.name || json.title || '';
             if (name) {
               let mdLink = name;
               if (tag.type === 'l') mdLink = `[${name}](https://www.discogs.com/label/${tag.id})`;
               else if (tag.type === 'a') mdLink = `[${name}](https://www.discogs.com/artist/${tag.id})`;
               else if (tag.type === 'r') mdLink = `[${name}](https://www.discogs.com/release/${tag.id})`;
               else if (tag.type === 'm') mdLink = `[${name}](https://www.discogs.com/master/${tag.id})`;
               cleanBio = cleanBio.replace(new RegExp(`\\[${tag.type}${tag.id}\\]`, 'gi'), mdLink);
             }
           }
         } catch(e){}
      }));
    }
    cleanBio = cleanBio.replace(/\[[alrm]\d+\]/gi, '');

    return {
      bio: cleanBio, realName: data.realname || '',
      aliases: (data.aliases || []).map(a => a.name?.replace(/\s\(\d+\)$/, '') || ''),
      members: (data.members || []).map(m => m.name?.replace(/\s\(\d+\)$/, '') || '').slice(0, 10),
      discogsUrl: data.uri ? (data.uri.startsWith('http') ? data.uri : `https://www.discogs.com${data.uri}`) : `https://www.discogs.com/artist/${data.id}`,
      topReleases, latestReleases,
    };
  } catch (e) { return null; }
}

async function fetchDiscogsLabel(labelId) {
  if (!labelId) return null;
  try {
    const res = await fetch(`https://api.discogs.com/labels/${labelId}`, { headers: DISCOGS_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
      // Clean Discogs markup: [a=Artist Name] → Artist Name, [l=Label Name] → Label Name, etc.
      const rawProfile = (data.profile || '').replace(/\[a=([^\]]+)\]/g, '$1').replace(/\[l=([^\]]+)\]/g, '$1').replace(/\[url=[^\]]*\]([^\[]*)\[\/url\]/g, '$1').replace(/\[b\]|\[\/b\]|\[i\]|\[\/i\]/g, '');
      return {
        name: data.name || '', parentLabel: data.parent_label?.name || '',
        sublabels: (data.sublabels || []).map(s => s.name).slice(0, 5),
        profile: rawProfile,
      discogsUrl: data.uri ? (data.uri.startsWith('http') ? data.uri : `https://www.discogs.com${data.uri}`) : `https://www.discogs.com/label/${data.id}`,
    };
  } catch (e) { return null; }
}

async function fetchMusicBrainz(title, artist) {
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(`${title} AND artist:${artist}`)}&fmt=json&limit=3`, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const rec = data.recordings?.[0];
    if (!rec) return null;
    const release = rec.releases?.[0];
    const lbl = release?.['label-info']?.[0]?.label;
    const resObj = {
      recordingId: rec.id, releaseId: release?.id || '',
      year: release?.date?.substring(0, 4) || '', label: lbl?.name || '',
      catno: release?.['label-info']?.[0]?.['catalog-number'] || '',
      tags: (rec.tags || []).sort((a, b) => b.count - a.count).slice(0, 8).map(t => t.name),
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
      } catch(e){}
    }
    return resObj;
  } catch (e) { return null; }
}

async function fetchMusicBrainzArtist(mbid) {
  if (!mbid) return null;
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels+aliases&fmt=json`, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      type: data.type || '', area: data.area?.name || '', aliases: (data.aliases || []).map(a => a.name),
      beginDate: data['life-span']?.begin || '', disambiguation: data.disambiguation || '',
      urls: (data.relations || [])
        .filter(r => ['official homepage', 'bandcamp', 'soundcloud', 'social network'].includes(r.type))
        .map(r => ({ type: r.type, url: r.url?.resource || '' })).slice(0, 5),
    };
  } catch (e) { return null; }
}

async function handleTrackInfo(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { title, artist, album, provider, trackId, discogsReleaseId } = body || {};
  if (!title && !artist) return res.status(400).json({ error: 'Missing title or artist' });

  const lookupKey = makeLookupKey(artist || '', album || '', title || '');

  // Check cache
  try {
    const { data: cached } = await supabase.from('track_info_cache').select('data, updated_at').eq('lookup_key', lookupKey).single();
    if (cached?.data && cached.data._v === 2) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < 30 * 24 * 60 * 60 * 1000) return res.status(200).json(cached.data);
    }
  } catch (e) {}

  // Fetch sources
  const searchQuery = [artist, album || title].filter(Boolean).join(' ');
  const [discogs, mb] = await Promise.all([fetchDiscogsRelease(searchQuery, discogsReleaseId), fetchMusicBrainz(title || '', artist || '')]);
  const [discogsArtist, mbArtist, labelInfo] = await Promise.all([
    fetchDiscogsArtistFull(discogs?.primaryArtistId),
    fetchMusicBrainzArtist(mb?.artistMbid),
    fetchDiscogsLabel(discogs?.labels?.[0]?.id),
  ]);

  // Build result
  const links = [];

  // Label display: combine label + series (sub-imprint) properly
  let labelDisplay = '';
  const mainLabelName = discogs?.labels?.[0]?.name || labelInfo?.name || mb?.label || '';
  const seriesName = discogs?.series?.[0]?.name || '';

  if (seriesName && seriesName.toLowerCase() !== mainLabelName.toLowerCase()) {
    // Series exists and is different from main label (e.g., Mantis under Delsin)
    labelDisplay = `${mainLabelName} — ${seriesName}`;
  } else if (labelInfo) {
    labelDisplay = labelInfo.name;
    // Only show sub-label if parent is genuinely different (not just "Records" suffix)
    if (labelInfo.parentLabel) {
      const parentClean = labelInfo.parentLabel.replace(/\s*(Records|Music|Label|Recordings)$/i, '').trim().toLowerCase();
      const labelClean = labelInfo.name.replace(/\s*(Records|Music|Label|Recordings)$/i, '').trim().toLowerCase();
      if (parentClean !== labelClean && !parentClean.includes(labelClean) && !labelClean.includes(parentClean)) {
        labelDisplay += ` (sub-label of ${labelInfo.parentLabel})`;
      }
    }
  } else {
    labelDisplay = mainLabelName;
  }
  const catno = discogs?.labels?.[0]?.catno || mb?.catno || '';
  if (catno) labelDisplay += ` [${catno}]`;

  const credits = (discogs?.credits || []).map(c => ({ name: c.name, role: c.role }));

  let artistBio = discogsArtist?.bio || '';
  if (discogsArtist?.realName) artistBio = `Real name: ${discogsArtist.realName}. ${artistBio}`;
  if (mbArtist?.disambiguation && !artistBio.includes(mbArtist.disambiguation)) {
    artistBio = artistBio ? `${mbArtist.disambiguation}. ${artistBio}` : mbArtist.disambiguation;
  }
  if (mbArtist?.beginDate) artistBio += ` Active since ${mbArtist.beginDate}.`;

  if (discogs?.discogsUrl) links.push({ name: 'Release on Discogs', url: discogs.discogsUrl });
  if (labelInfo?.discogsUrl) links.push({ name: 'Label on Discogs', url: labelInfo.discogsUrl });
  if (discogsArtist?.discogsUrl) links.push({ name: 'Artist on Discogs', url: discogsArtist.discogsUrl });
  if (mb?.recordingId) links.push({ name: 'MusicBrainz', url: `https://musicbrainz.org/recording/${mb.recordingId}` });
  // Bandcamp fallback if missing
  if (!links.some(l => l.url.includes('bandcamp.com'))) {
    try {
      const bcq = `${artist} ${album || title}`.trim();
      const bcRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Kyoyu/1.0' },
        body: JSON.stringify({ search_text: bcq, search_filter: 'a,t', full_page: false, fan_id: 0 })
      });
      if (bcRes.ok) {
        const bcData = await bcRes.json();
        const first = bcData.auto?.results?.[0];
        if (first && first.item_url_path) {
          links.push({ name: 'Bandcamp', url: first.item_url_path });
        }
      }
    } catch(e){}
  }

  if (mb?.releaseId)
  if (mb?.releaseUrls) mb.releaseUrls.forEach(u => { if (u.url) links.push({ name: u.type || 'Link', url: u.url }); });
  if (mbArtist?.urls) mbArtist.urls.forEach(u => { if (u.url) links.push({ name: u.type === 'official homepage' ? 'Official Website' : u.type, url: u.url }); });

  const allAliases = [...(discogsArtist?.aliases || []), ...(mbArtist?.aliases || [])];
  const uniqueAliases = [...new Set(allAliases)].filter(Boolean);
  
  const result = {
    _v: 7,
    album: discogs?.title || album || '', artist: artist || '',
    year: String(discogs?.year || mb?.year || ''),
    label: labelDisplay, labelProfile: labelInfo?.profile || '',
    genre: discogs?.genre || (mb?.tags || []).join(', ') || '',
    formats: discogs?.formats || [], country: discogs?.country || mbArtist?.area || '',
    description: discogs?.description || '', tracklist: discogs?.tracklist || [],
    credits: { mixing: credits.filter(c => /mix/i.test(c.role)).map(c => c.name), mastering: credits.filter(c => /master/i.test(c.role)).map(c => c.name), other: credits.filter(c => !/mix|master/i.test(c.role)) },
    releaseArtists: (discogs?.releaseArtists || []).map(a => a.name),
    artistBio, artistMembers: discogsArtist?.members || [], artistAliases: uniqueAliases,
    topReleases: discogsArtist?.topReleases || [], latestReleases: discogsArtist?.latestReleases || [],
    links,
  };

  // Cache
  try {
    await supabase.from('track_info_cache').upsert({
      lookup_key: lookupKey, title: title || '', artist: artist || '', album: album || '',
      data: result, updated_at: new Date().toISOString(),
    }, { onConflict: 'lookup_key' });
  } catch (e) {}

  return res.status(200).json(result);
}

// ── Search orchestration helpers (artist-top-releases, track-release) ──

const stripArtistSuffix = (s) => (s || '').replace(/\s*\(\d+\)\s*$/, '').replace(/\*+$/, '').trim();
const normName = (s) => stripArtistSuffix(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

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
  let { artistId, artistName } = body || {};

  if (!artistId && artistName) {
    try {
      const r = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(artistName)}&type=artist&per_page=5`, { headers: DISCOGS_HEADERS });
      if (r.ok) {
        const d = await r.json();
        const want = normName(artistName);
        const hit = (d.results || []).find(a => normName(a.title) === want) || (d.results || [])[0];
        if (hit) artistId = hit.id;
      }
    } catch (e) {}
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
  } else if (!/\brecords\b/i.test(labelName)) {
    queries.push(`${labelName.trim()} Records`);
  }

  const wantExact = normName(labelName);
  const wantCore = normLabelName(labelName);

  for (const q of queries) {
    try {
      const r = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(q)}&type=label&per_page=10`, { headers: DISCOGS_HEADERS });
      if (!r.ok) continue;
      const d = await r.json();
      const results = d.results || [];
      if (!results.length) continue;
      const exact = results.find(a => normName(a.title) === wantExact);
      if (exact) return exact;
      const coreMatch = results.find(a => normLabelName(a.title) === wantCore);
      if (coreMatch) return coreMatch;
      const prefixMatch = results.find(a => normName(a.title).startsWith(wantCore) || wantCore.startsWith(normLabelName(a.title)));
      if (prefixMatch) return prefixMatch;
      if (q === queries[0]) return results[0];
    } catch (e) {}
  }
  return null;
}

async function resolveDiscogsTextAndMeta(rawText) {
  if (!rawText) return { cleanText: '', extractedUrls: [], founders: [], foundedYear: '' };
  let work = String(rawText);

  const extractedUrls = [];
  // Extract [url=...] links
  const urlTagRegex = /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi;
  let um;
  while ((um = urlTagRegex.exec(work)) !== null) {
    const u = um[1].trim();
    if (/^https?:\/\//i.test(u)) extractedUrls.push(u);
    else if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(u)) extractedUrls.push(`https://${u}`);
  }

  // Resolve numeric tags [a12345], [l12345], [r12345], [m12345]
  const tagRegex = /\[([alrm])(\d+)\]/gi;
  let tm;
  const toFetch = [];
  while ((tm = tagRegex.exec(work)) !== null) {
    toFetch.push({ full: tm[0], type: tm[1].toLowerCase(), id: tm[2] });
  }
  if (toFetch.length > 0) {
    const uniqueTags = [...new Map(toFetch.map(item => [item.full.toLowerCase(), item])).values()];
    await Promise.all(uniqueTags.slice(0, 8).map(async (tag) => {
      try {
        const endpoint = tag.type === 'l' ? `labels/${tag.id}`
          : tag.type === 'a' ? `artists/${tag.id}`
          : tag.type === 'r' ? `releases/${tag.id}`
          : tag.type === 'm' ? `masters/${tag.id}` : '';
        if (!endpoint) return;
        const res = await fetch(`https://api.discogs.com/${endpoint}`, { headers: DISCOGS_HEADERS });
        if (res.ok) {
          const json = await res.json();
          const name = stripArtistSuffix(json.name || json.title || '');
          if (name) {
            const replacement = tag.type === 'a' ? `[a=${name}]` : name;
            work = work.replace(new RegExp(`\\[${tag.type}${tag.id}\\]`, 'gi'), replacement);
          }
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
      const fName = stripArtistSuffix(am[1]);
      if (fName && !founders.includes(fName)) founders.push(fName);
    }
  }

  // Extract founded year
  let foundedYear = '';
  const yearMatch = work.match(/(?:founded|established|started|launched|formed|active since|est\.?)\s+(?:in\s+)?((?:19|20)\d{2})\b/i);
  if (yearMatch) foundedYear = yearMatch[1];

  // Clean Discogs markup for display
  let cleanText = work
    .replace(/\[a=([^\]]+)\]/gi, (_, n) => stripArtistSuffix(n))
    .replace(/\[l=([^\]]+)\]/gi, (_, n) => stripArtistSuffix(n))
    .replace(/\[r=([^\]]+)\]/gi, '$1')
    .replace(/\[m=([^\]]+)\]/gi, '$1')
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[\/?(?:b|i|u)\]/gi, '')
    .replace(/\[[alrm]\d+\]/gi, '')
    .trim();

  // Extract any raw URLs or social handles from text
  const rawHttp = cleanText.match(/https?:\/\/[^\s\])"<>]+/gi) || [];
  rawHttp.forEach(u => extractedUrls.push(u.replace(/[.,;]+$/, '')));
  const bareSocial = cleanText.match(/(?:instagram\.com|soundcloud\.com|facebook\.com|ra\.co\/labels|residentadvisor\.net\/record-label\.aspx\?id=|[a-z0-9_-]+\.bandcamp\.com)[a-zA-Z0-9_.\-\/?=&]*/gi) || [];
  bareSocial.forEach(b => {
    const cleaned = b.replace(/[.,;]+$/, '');
    extractedUrls.push(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
  });

  return { cleanText, extractedUrls, founders, foundedYear };
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
  let { artistId, artistName } = body || {};

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
      const r = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(artistName)}&type=artist&per_page=8`, { headers: DISCOGS_HEADERS });
      if (r.ok) {
        const d = await r.json();
        const want = normName(artistName);
        const results = d.results || [];
        // Only match an artist whose name actually matches artistName (never blindly take results[0] which may be a label founder whose bio mentions the label!)
        const exactHit = results.find(a => normName(a.title) === want)
          || results.find(a => normName(a.title).includes(want) || want.includes(normName(a.title)));
        if (exactHit) {
          artistId = exactHit.id;
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
          if (results[0]) artistId = results[0].id;
        }
      }
    } catch (e) {}
  }
  if (!artistId) return res.status(200).json({ error: 'Artist not found on Discogs' });

  const cacheKey = `artist-profile-v2|${artistId}`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 2);
  if (cached) return res.status(200).json(cached);

  let profileData = {};
  try {
    const r = await fetch(`https://api.discogs.com/artists/${artistId}`, { headers: DISCOGS_HEADERS });
    if (r.ok) profileData = await r.json();
  } catch (e) {}

  const { cleanText: cleanBio, extractedUrls } = await resolveDiscogsTextAndMeta(profileData.profile || '');

  // Fetch top releases by reusing the artist-top-releases logic internally
  let topReleases = [];
  try {
    const mockRes = { status: () => ({ json: (d) => { topReleases = d.releases || []; return { releases: topReleases }; } }) };
    await handleArtistTopReleases({ artistId, artistName }, mockRes);
  } catch(e) {}

  const result = {
    _v: 2,
    id: artistId,
    name: stripArtistSuffix(profileData.name || artistName || ''),
    realname: profileData.realname || '',
    profile: cleanBio || profileData.profile || '',
    urls: Array.from(new Set([...(profileData.urls || []), ...extractedUrls])).filter(Boolean),
    aliases: (profileData.aliases || []).map(a => stripArtistSuffix(a.name)),
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

  const cacheKey = `label-profile-v3|${labelId || normLabelName(labelName || '')}`;
  const cached = await cacheGet(supabase, cacheKey, 24 * 60 * 60 * 1000, 3);
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

  // 3. Fetch Discogs label releases + release search (for high-res artwork & genres/styles) in parallel
  let topReleases = [];
  const dcGenres = new Map();
  let dcCountry = '';

  if (labelId) {
    const [relListRes, relSearchRes] = await Promise.all([
      fetch(`https://api.discogs.com/labels/${labelId}/releases?sort=year&sort_order=desc&per_page=100`, { headers: DISCOGS_HEADERS })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      resolvedLabelName
        ? fetch(`https://api.discogs.com/database/search?label=${encodeURIComponent(resolvedLabelName)}&type=release&per_page=25`, { headers: DISCOGS_HEADERS })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Extract high-res covers, genres, styles, and country from Discogs search results
    const hiResCovers = new Map();
    if (relSearchRes && Array.isArray(relSearchRes.results)) {
      const countryCounts = new Map();
      for (const sr of relSearchRes.results) {
        if (sr.country) countryCounts.set(sr.country, (countryCounts.get(sr.country) || 0) + 1);
        for (const g of [...(sr.style || []), ...(sr.genre || [])]) {
          if (g) dcGenres.set(g, (dcGenres.get(g) || 0) + 1);
        }
        if (sr.cover_image && !sr.cover_image.includes('spacer.gif')) {
          const parts = (sr.title || '').split(' - ');
          const rTitle = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : (sr.title || '');
          if (rTitle) hiResCovers.set(normName(rTitle), sr.cover_image);
          if (sr.id) hiResCovers.set(`id:${sr.id}`, sr.cover_image);
        }
      }
      if (countryCounts.size > 0) {
        dcCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    if (relListRes && Array.isArray(relListRes.releases)) {
      const seen = new Set();
      for (const rel of relListRes.releases) {
        const cleanArtist = stripArtistSuffix(rel.artist || '');
        const cleanTitle = (rel.title || '').trim();
        const dedupKey = `${normName(cleanArtist)}::${normName(cleanTitle)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const hiRes = hiResCovers.get(`id:${rel.id}`) || hiResCovers.get(normName(cleanTitle)) || rel.thumb || '';
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
          year: rel.year || null,
          thumb: rel.thumb || hiRes || '',
          coverImage: hiRes || rel.thumb || '',
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
  const rawUrls = [
    discogsUrl,
    mbUrl,
    ...(Array.isArray(profileData?.urls) ? profileData.urls : []),
    ...profileResolved.extractedUrls,
    ...contactResolved.extractedUrls,
    ...(mbData?.urls || []),
  ].filter(Boolean);

  // 5. If Bandcamp URL is not yet in rawUrls, query Bandcamp autocomplete for the label
  let bcDiscoveredUrl = rawUrls.find(u => /bandcamp\.com/i.test(u)) || '';
  let bcDiscoveredImg = '';
  let bcDiscoveredLoc = '';
  if (!bcDiscoveredUrl && resolvedLabelName) {
    try {
      const bcRes = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ search_text: resolvedLabelName, search_filter: 'b', full_page: false, fan_id: 0 }),
      });
      if (bcRes.ok) {
        const bcJson = await bcRes.json();
        const wantCore = normLabelName(resolvedLabelName);
        const bcHit = (bcJson?.auto?.results || []).find(item =>
          item.type === 'b' && (normLabelName(item.name) === wantCore || normName(item.name).includes(wantCore))
        );
        if (bcHit) {
          bcDiscoveredUrl = bcHit.item_url_root || bcHit.item_url_path || bcHit.url || '';
          if (bcDiscoveredUrl) rawUrls.push(bcDiscoveredUrl);
          if (bcHit.img_id) bcDiscoveredImg = `https://f4.bcbits.com/img/00${bcHit.img_id}_23.jpg`;
          else if (bcHit.img) bcDiscoveredImg = bcHit.img;
          if (bcHit.location) bcDiscoveredLoc = bcHit.location;
        }
      }
    } catch (e) {}
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

  // Combine founders, parent label, sublabels
  const founders = Array.from(new Set([...profileResolved.founders, ...(mbData?.founders || [])])).filter(Boolean);
  const foundedYear = mbData?.foundedYear || profileResolved.foundedYear || '';
  const parentLabel = (profileData?.parent_label?.name ? stripArtistSuffix(profileData.parent_label.name) : '') || mbData?.parentLabel || '';
  const sublabels = Array.from(new Set([
    ...(profileData?.sublabels || []).map(s => stripArtistSuffix(s.name || '')),
    ...(mbData?.sublabels || []),
  ])).filter(Boolean);

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
    _v: 3,
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
