// POST /api/discogs-search
// Handles: standard search, resolve-aliases, and track-info actions

import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];
const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || '';
const DISCOGS_HEADERS = { 'User-Agent': 'Kyoyu/1.0 +https://ree.fm', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` };
const MB_HEADERS = { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' };

let requestLog = [];
const RATE_LIMIT = 55;
const RATE_WINDOW = 60000;

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

  try {
    const discogsRes = await fetch(url, { headers: { 'User-Agent': 'Kyoyu/1.0', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` } });
    if (!discogsRes.ok) return res.status(discogsRes.status).json({ error: 'Discogs API error' });
    const data = await discogsRes.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
