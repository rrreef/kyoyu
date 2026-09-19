// POST /api/track-info
// Aggregates rich release/album/artist info from Discogs + MusicBrainz.
// Returns: label + sub-label hierarchy, credits (mixing/mastering engineers),
// all release artists, artist bio + 3 most known + 3 latest releases.
// Caches in Supabase track_info_cache (30-day TTL).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || '';
const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];
const DISCOGS_HEADERS = { 'User-Agent': 'Kyoyu/1.0 +https://ree.fm', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` };
const MB_HEADERS = { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' };

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

let requestLog = [];
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

function makeLookupKey(artist, album, title) {
  return [artist, album || title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
}

// ── Discogs: full release details ──
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

    // Extract credits (mixing, mastering, all involved artists)
    const credits = [];
    const extraArtists = detail?.extraartists || [];
    extraArtists.forEach(ea => {
      credits.push({ name: ea.name?.replace(/\s\(\d+\)$/, '') || '', role: ea.role || '' });
    });

    // All main artists on the release
    const releaseArtists = (detail?.artists || []).map(a => ({
      name: a.name?.replace(/\s\(\d+\)$/, '') || '',
      id: a.id,
    }));

    // Label hierarchy (label + parent label / sub-label info)
    const labels = (detail?.labels || []).map(l => ({
      name: l.name || '',
      catno: l.catno || '',
      id: l.id,
    }));

    return {
      title: detail?.title || best.title || '',
      year: detail?.year || best.year || '',
      genre: [...(detail?.genres || best.genre || []), ...(detail?.styles || best.style || [])].join(', '),
      labels,
      country: detail?.country || '',
      description: detail?.notes || '',
      formats: (detail?.formats || []).map(f => {
        const parts = [f.name];
        if (f.descriptions) parts.push(...f.descriptions);
        if (f.qty && f.qty !== '1') parts.unshift(`${f.qty}x`);
        return parts.join(', ');
      }),
      tracklist: (detail?.tracklist || []).filter(t => t.type_ === 'track').map(t => ({
        position: t.position || '',
        title: t.title || '',
        duration: t.duration || '',
        artists: (t.artists || []).map(a => a.name?.replace(/\s\(\d+\)$/, '') || ''),
      })),
      credits,
      releaseArtists,
      discogsUrl: detail?.uri ? `https://www.discogs.com${detail.uri}` : (best.uri ? `https://www.discogs.com${best.uri}` : ''),
      primaryArtistId: detail?.artists?.[0]?.id || null,
    };
  } catch (e) { console.warn('Discogs fetch error:', e); return null; }
}

// ── Discogs: artist + discography ──
async function fetchDiscogsArtistFull(artistId) {
  if (!artistId) return null;
  try {
    const res = await fetch(`https://api.discogs.com/artists/${artistId}`, { headers: DISCOGS_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();

    // Fetch releases for "most known" (most wanted) and "latest"
    let topReleases = [];
    let latestReleases = [];
    try {
      // Sort by year descending for latest
      const relRes = await fetch(
        `https://api.discogs.com/artists/${artistId}/releases?sort=year&sort_order=desc&per_page=15&page=1`,
        { headers: DISCOGS_HEADERS }
      );
      if (relRes.ok) {
        const relData = await relRes.json();
        const releases = (relData.releases || []).filter(r => r.role === 'Main' || r.role === 'TrackAppearance');
        // Latest 3
        latestReleases = releases.slice(0, 3).map(r => ({
          title: r.title || '',
          year: r.year || 0,
          label: r.label || '',
          type: r.type || '',
        }));
        // Most known = sort by stats.community.have (approximated by sorting differently)
        // Discogs API doesn't expose "most popular" directly, so use the "most wanted" sort
      }
    } catch (e) {}

    try {
      // Sort by most popular (year ascending tends to show classics first for established artists)
      const popRes = await fetch(
        `https://api.discogs.com/artists/${artistId}/releases?sort=year&sort_order=asc&per_page=20&page=1`,
        { headers: DISCOGS_HEADERS }
      );
      if (popRes.ok) {
        const popData = await popRes.json();
        const mainReleases = (popData.releases || []).filter(r => (r.role === 'Main') && r.type !== 'appearance');
        topReleases = mainReleases.slice(0, 3).map(r => ({
          title: r.title || '',
          year: r.year || 0,
          label: r.label || '',
          type: r.type || '',
        }));
      }
    } catch (e) {}

    return {
      bio: data.profile || '',
      realName: data.realname || '',
      members: (data.members || []).map(m => m.name?.replace(/\s\(\d+\)$/, '') || '').slice(0, 10),
      discogsUrl: data.uri ? `https://www.discogs.com/artist/${data.id}` : '',
      topReleases,
      latestReleases,
    };
  } catch (e) { return null; }
}

// ── Discogs: label info (for parent/sub-label hierarchy) ──
async function fetchDiscogsLabel(labelId) {
  if (!labelId) return null;
  try {
    const res = await fetch(`https://api.discogs.com/labels/${labelId}`, { headers: DISCOGS_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name: data.name || '',
      parentLabel: data.parent_label?.name || '',
      parentLabelId: data.parent_label?.id || null,
      sublabels: (data.sublabels || []).map(s => s.name).slice(0, 5),
      profile: data.profile || '',
      discogsUrl: data.uri ? `https://www.discogs.com/label/${data.id}` : '',
    };
  } catch (e) { return null; }
}

// ── MusicBrainz: recording + release ──
async function fetchMusicBrainz(title, artist) {
  try {
    const mbQuery = encodeURIComponent(`${title} AND artist:${artist}`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${mbQuery}&fmt=json&limit=3`,
      { headers: MB_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rec = data.recordings?.[0];
    if (!rec) return null;
    const release = rec.releases?.[0];
    const lbl = release?.['label-info']?.[0]?.label;
    return {
      recordingId: rec.id,
      releaseId: release?.id || '',
      year: release?.date?.substring(0, 4) || '',
      label: lbl?.name || '',
      catno: release?.['label-info']?.[0]?.['catalog-number'] || '',
      tags: (rec.tags || []).sort((a, b) => b.count - a.count).slice(0, 8).map(t => t.name),
      artistMbid: rec['artist-credit']?.[0]?.artist?.id || '',
    };
  } catch (e) { return null; }
}

// ── MusicBrainz: artist details ──
async function fetchMusicBrainzArtist(mbid) {
  if (!mbid) return null;
  try {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`,
      { headers: MB_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      type: data.type || '',
      area: data.area?.name || '',
      beginDate: data['life-span']?.begin || '',
      disambiguation: data.disambiguation || '',
      urls: (data.relations || [])
        .filter(r => ['official homepage', 'bandcamp', 'soundcloud', 'social network'].includes(r.type))
        .map(r => ({ type: r.type, url: r.url?.resource || '' })).slice(0, 5),
    };
  } catch (e) { return null; }
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

  const now = Date.now();
  requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
  if (requestLog.length >= RATE_LIMIT) return res.status(429).json({ error: 'Rate limit reached' });
  requestLog.push(now);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { title, artist, album, provider, trackId } = body || {};
  if (!title && !artist) return res.status(400).json({ error: 'Missing title or artist' });

  const lookupKey = makeLookupKey(artist || '', album || '', title || '');

  // 1. Check cache (30 day TTL)
  try {
    const { data: cached } = await supabase
      .from('track_info_cache')
      .select('data, updated_at')
      .eq('lookup_key', lookupKey)
      .single();
    if (cached?.data) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < 30 * 24 * 60 * 60 * 1000) return res.status(200).json(cached.data);
    }
  } catch (e) {}

  // 2. Fetch sources in parallel
  const searchQuery = [artist, album || title].filter(Boolean).join(' ');
  const [discogs, mb] = await Promise.all([
    fetchDiscogsRelease(searchQuery),
    fetchMusicBrainz(title || '', artist || ''),
  ]);

  // 3. Fetch artist details + label hierarchy (needs IDs from step 2)
  const [discogsArtist, mbArtist, labelInfo] = await Promise.all([
    fetchDiscogsArtistFull(discogs?.primaryArtistId),
    fetchMusicBrainzArtist(mb?.artistMbid),
    fetchDiscogsLabel(discogs?.labels?.[0]?.id),
  ]);

  // 4. Build merged result
  const links = [];
  const mergedAlbum = discogs?.title || album || '';
  const mergedYear = String(discogs?.year || mb?.year || '');

  // Label with parent/sub-label hierarchy
  let labelDisplay = '';
  if (labelInfo) {
    labelDisplay = labelInfo.name;
    if (labelInfo.parentLabel) {
      labelDisplay += ` (sub-label of ${labelInfo.parentLabel})`;
    }
  } else {
    labelDisplay = discogs?.labels?.[0]?.name || mb?.label || '';
  }
  const catno = discogs?.labels?.[0]?.catno || mb?.catno || '';
  if (catno) labelDisplay += ` [${catno}]`;

  const mergedGenre = discogs?.genre || (mb?.tags || []).join(', ') || '';
  const mergedFormats = discogs?.formats || [];
  const mergedCountry = discogs?.country || mbArtist?.area || '';
  const mergedDescription = discogs?.description || '';
  const mergedTracklist = discogs?.tracklist || [];

  // Credits: extract mixing/mastering engineers and other roles
  const credits = (discogs?.credits || []).map(c => ({ name: c.name, role: c.role }));
  const mixingEngineers = credits.filter(c => /mix/i.test(c.role)).map(c => c.name);
  const masteringEngineers = credits.filter(c => /master/i.test(c.role)).map(c => c.name);
  const otherCredits = credits.filter(c => !/mix|master/i.test(c.role));

  // All artists on the release
  const releaseArtists = (discogs?.releaseArtists || []).map(a => a.name);

  // Artist bio
  let artistBio = discogsArtist?.bio || '';
  if (discogsArtist?.realName) artistBio = `Real name: ${discogsArtist.realName}. ${artistBio}`;
  if (mbArtist?.disambiguation && !artistBio.includes(mbArtist.disambiguation)) {
    artistBio = artistBio ? `${mbArtist.disambiguation}. ${artistBio}` : mbArtist.disambiguation;
  }
  if (mbArtist?.beginDate) artistBio += ` Active since ${mbArtist.beginDate}.`;

  // Artist discography
  const topReleases = discogsArtist?.topReleases || [];
  const latestReleases = discogsArtist?.latestReleases || [];

  // Links
  if (discogs?.discogsUrl) links.push({ name: 'Release on Discogs', url: discogs.discogsUrl });
  if (labelInfo?.discogsUrl) links.push({ name: 'Label on Discogs', url: labelInfo.discogsUrl });
  if (discogsArtist?.discogsUrl) links.push({ name: 'Artist on Discogs', url: discogsArtist.discogsUrl });
  if (mb?.recordingId) links.push({ name: 'MusicBrainz', url: `https://musicbrainz.org/recording/${mb.recordingId}` });
  if (mb?.releaseId) links.push({ name: 'Release on MusicBrainz', url: `https://musicbrainz.org/release/${mb.releaseId}` });
  if (mbArtist?.urls) {
    mbArtist.urls.forEach(u => {
      if (u.url) links.push({ name: u.type === 'official homepage' ? 'Official Website' : u.type, url: u.url });
    });
  }

  const result = {
    album: mergedAlbum,
    artist: artist || '',
    year: mergedYear,
    label: labelDisplay,
    labelProfile: labelInfo?.profile || '',
    genre: mergedGenre,
    formats: mergedFormats,
    country: mergedCountry,
    description: mergedDescription,
    tracklist: mergedTracklist,
    credits: { mixing: mixingEngineers, mastering: masteringEngineers, other: otherCredits },
    releaseArtists,
    artistBio,
    artistMembers: discogsArtist?.members || [],
    topReleases,
    latestReleases,
    links,
  };

  // 5. Cache (fire-and-forget)
  try {
    await supabase.from('track_info_cache').upsert({
      lookup_key: lookupKey,
      title: title || '',
      artist: artist || '',
      album: album || '',
      data: result,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lookup_key' });
  } catch (e) { console.warn('Cache upsert error:', e); }

  return res.status(200).json(result);
}
