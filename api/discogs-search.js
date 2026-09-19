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

async function fetchDiscogsRelease(query) {
  try {
    const searchRes = await fetch(
      `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=5`,
      { headers: DISCOGS_HEADERS }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const best = searchData.results?.[0];
    if (!best) return null;
    let detail = null;
    if (best.id) {
      try {
        const r = await fetch(`https://api.discogs.com/releases/${best.id}`, { headers: DISCOGS_HEADERS });
        if (r.ok) detail = await r.json();
      } catch (e) {}
    }
    const credits = [];
    (detail?.extraartists || []).forEach(ea => {
      credits.push({ name: ea.name?.replace(/\s\(\d+\)$/, '') || '', role: ea.role || '' });
    });
    const releaseArtists = (detail?.artists || []).map(a => ({
      name: a.name?.replace(/\s\(\d+\)$/, '') || '', id: a.id,
    }));
    const labels = (detail?.labels || []).map(l => ({ name: l.name || '', catno: l.catno || '', id: l.id }));
    return {
      title: detail?.title || best.title || '',
      year: detail?.year || best.year || '',
      genre: [...(detail?.genres || best.genre || []), ...(detail?.styles || best.style || [])].join(', '),
      labels, country: detail?.country || '',
      description: (detail?.notes || '').replace(/\[a=([^\]]+)\]/g, '$1').replace(/\[l=([^\]]+)\]/g, '$1').replace(/\[url=[^\]]*\]([^\[]*)\[\/url\]/g, '$1').replace(/\[b\]|\[\/b\]|\[i\]|\[\/i\]/g, ''),
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
      discogsUrl: detail?.uri ? `https://www.discogs.com${detail.uri}` : (best.uri ? `https://www.discogs.com${best.uri}` : ''),
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
    const cleanBio = (data.profile || '').replace(/\[a=([^\]]+)\]/g, '$1').replace(/\[l=([^\]]+)\]/g, '$1').replace(/\[url=[^\]]*\]([^\[]*)\[\/url\]/g, '$1').replace(/\[b\]|\[\/b\]|\[i\]|\[\/i\]/g, '');
    return {
      bio: cleanBio, realName: data.realname || '',
      members: (data.members || []).map(m => m.name?.replace(/\s\(\d+\)$/, '') || '').slice(0, 10),
      discogsUrl: data.uri ? `https://www.discogs.com/artist/${data.id}` : '',
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
      discogsUrl: data.uri ? `https://www.discogs.com/label/${data.id}` : '',
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
    return {
      recordingId: rec.id, releaseId: release?.id || '',
      year: release?.date?.substring(0, 4) || '', label: lbl?.name || '',
      catno: release?.['label-info']?.[0]?.['catalog-number'] || '',
      tags: (rec.tags || []).sort((a, b) => b.count - a.count).slice(0, 8).map(t => t.name),
      artistMbid: rec['artist-credit']?.[0]?.artist?.id || '',
    };
  } catch (e) { return null; }
}

async function fetchMusicBrainzArtist(mbid) {
  if (!mbid) return null;
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      type: data.type || '', area: data.area?.name || '',
      beginDate: data['life-span']?.begin || '', disambiguation: data.disambiguation || '',
      urls: (data.relations || [])
        .filter(r => ['official homepage', 'bandcamp', 'soundcloud', 'social network'].includes(r.type))
        .map(r => ({ type: r.type, url: r.url?.resource || '' })).slice(0, 5),
    };
  } catch (e) { return null; }
}

async function handleTrackInfo(body, res) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { title, artist, album, provider, trackId } = body || {};
  if (!title && !artist) return res.status(400).json({ error: 'Missing title or artist' });

  const lookupKey = makeLookupKey(artist || '', album || '', title || '');

  // Check cache
  try {
    const { data: cached } = await supabase.from('track_info_cache').select('data, updated_at').eq('lookup_key', lookupKey).single();
    if (cached?.data) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < 30 * 24 * 60 * 60 * 1000) return res.status(200).json(cached.data);
    }
  } catch (e) {}

  // Fetch sources
  const searchQuery = [artist, album || title].filter(Boolean).join(' ');
  const [discogs, mb] = await Promise.all([fetchDiscogsRelease(searchQuery), fetchMusicBrainz(title || '', artist || '')]);
  const [discogsArtist, mbArtist, labelInfo] = await Promise.all([
    fetchDiscogsArtistFull(discogs?.primaryArtistId),
    fetchMusicBrainzArtist(mb?.artistMbid),
    fetchDiscogsLabel(discogs?.labels?.[0]?.id),
  ]);

  // Build result
  const links = [];
  let labelDisplay = '';
  if (labelInfo) {
    labelDisplay = labelInfo.name;
    if (labelInfo.parentLabel && labelInfo.parentLabel.toLowerCase() !== labelInfo.name.toLowerCase()) {
      labelDisplay += ` (sub-label of ${labelInfo.parentLabel})`;
    }
  } else {
    labelDisplay = discogs?.labels?.[0]?.name || mb?.label || '';
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
  if (mb?.releaseId) links.push({ name: 'Release on MusicBrainz', url: `https://musicbrainz.org/release/${mb.releaseId}` });
  if (mbArtist?.urls) mbArtist.urls.forEach(u => { if (u.url) links.push({ name: u.type === 'official homepage' ? 'Official Website' : u.type, url: u.url }); });

  const result = {
    album: discogs?.title || album || '', artist: artist || '',
    year: String(discogs?.year || mb?.year || ''),
    label: labelDisplay, labelProfile: labelInfo?.profile || '',
    genre: discogs?.genre || (mb?.tags || []).join(', ') || '',
    formats: discogs?.formats || [], country: discogs?.country || mbArtist?.area || '',
    description: discogs?.description || '', tracklist: discogs?.tracklist || [],
    credits: { mixing: credits.filter(c => /mix/i.test(c.role)).map(c => c.name), mastering: credits.filter(c => /master/i.test(c.role)).map(c => c.name), other: credits.filter(c => !/mix|master/i.test(c.role)) },
    releaseArtists: (discogs?.releaseArtists || []).map(a => a.name),
    artistBio, artistMembers: discogsArtist?.members || [],
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
