// POST /api/track-info
// Aggregates track/album/artist info from Discogs, MusicBrainz, and Bandcamp.
// Caches results in Supabase track_info_cache table (refreshed every 30 days).
// Input: { title, artist, album, provider, trackId }
// Output: { album, artist, year, label, genre, formats, country, description, artistBio, tracklist, links }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || '';
const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

let requestLog = [];
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

function makeLookupKey(artist, album, title) {
  return [artist, album || title].filter(Boolean).map(s => s.trim().toLowerCase()).join('|');
}

async function fetchDiscogs(query) {
  try {
    const searchRes = await fetch(
      `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=3`,
      { headers: { 'User-Agent': 'Kyoyu/1.0 +https://ree.fm', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` } }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const best = searchData.results?.[0];
    if (!best) return null;

    // Fetch full release details
    let detail = null;
    if (best.id) {
      try {
        const detailRes = await fetch(
          `https://api.discogs.com/releases/${best.id}`,
          { headers: { 'User-Agent': 'Kyoyu/1.0 +https://ree.fm', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` } }
        );
        if (detailRes.ok) detail = await detailRes.json();
      } catch (e) { /* ignore */ }
    }

    const result = {
      title: best.title || '',
      year: detail?.year || best.year || '',
      genre: [...(detail?.genres || best.genre || []), ...(detail?.styles || best.style || [])].join(', '),
      label: detail?.labels?.[0]?.name || (best.label || [])[0] || '',
      catno: detail?.labels?.[0]?.catno || '',
      country: detail?.country || '',
      description: detail?.notes || '',
      formats: (detail?.formats || []).map(f => {
        const parts = [f.name];
        if (f.descriptions) parts.push(...f.descriptions);
        return parts.join(', ');
      }),
      tracklist: (detail?.tracklist || []).filter(t => t.type_ === 'track').map(t => ({
        position: t.position || '',
        title: t.title || '',
        duration: t.duration || '',
      })),
      discogsUrl: detail?.uri ? `https://www.discogs.com${detail.uri}` : (best.uri ? `https://www.discogs.com${best.uri}` : ''),
      artistDiscogsId: detail?.artists?.[0]?.id || null,
    };
    return result;
  } catch (e) { console.warn('Discogs fetch error:', e); return null; }
}

async function fetchDiscogsArtist(artistId) {
  if (!artistId) return null;
  try {
    const res = await fetch(
      `https://api.discogs.com/artists/${artistId}`,
      { headers: { 'User-Agent': 'Kyoyu/1.0 +https://ree.fm', 'Authorization': `Discogs token=${DISCOGS_TOKEN}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      bio: data.profile || '',
      discogsUrl: data.uri ? `https://www.discogs.com/artist/${data.id}` : '',
      realName: data.realname || '',
      members: (data.members || []).map(m => m.name).slice(0, 10),
    };
  } catch (e) { return null; }
}

async function fetchMusicBrainz(title, artist) {
  try {
    const mbQuery = encodeURIComponent(`${title} AND artist:${artist}`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${mbQuery}&fmt=json&limit=3`,
      { headers: { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' } }
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
  } catch (e) { console.warn('MusicBrainz fetch error:', e); return null; }
}

async function fetchMusicBrainzArtist(mbid) {
  if (!mbid) return null;
  try {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`,
      { headers: { 'User-Agent': 'Kyoyu/1.0 (https://ree.fm)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      type: data.type || '',
      area: data.area?.name || '',
      beginDate: data['life-span']?.begin || '',
      disambiguation: data.disambiguation || '',
      urls: (data.relations || []).filter(r => r.type === 'official homepage' || r.type === 'bandcamp' || r.type === 'soundcloud' || r.type === 'social network')
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
  if (requestLog.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit reached' });
  }
  requestLog.push(now);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { title, artist, album, provider, trackId } = body || {};
  if (!title && !artist) return res.status(400).json({ error: 'Missing title or artist' });

  const lookupKey = makeLookupKey(artist || '', album || '', title || '');

  // 1. Check cache
  try {
    const { data: cached } = await supabase
      .from('track_info_cache')
      .select('data, updated_at')
      .eq('lookup_key', lookupKey)
      .single();

    if (cached?.data) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (age < thirtyDays) {
        return res.status(200).json(cached.data);
      }
    }
  } catch (e) { /* cache miss — continue to fetch */ }

  // 2. Fetch from sources in parallel
  const searchQuery = [artist, album || title].filter(Boolean).join(' ');

  const [discogs, mb] = await Promise.all([
    fetchDiscogs(searchQuery),
    fetchMusicBrainz(title || '', artist || ''),
  ]);

  // 3. Fetch artist details (parallel, needs IDs from above)
  const [discogsArtist, mbArtist] = await Promise.all([
    fetchDiscogsArtist(discogs?.artistDiscogsId),
    fetchMusicBrainzArtist(mb?.artistMbid),
  ]);

  // 4. Merge into unified result
  const links = [];

  const mergedAlbum = discogs?.title || album || '';
  const mergedYear = String(discogs?.year || mb?.year || '');
  const mergedLabel = discogs?.label || mb?.label || '';
  const mergedCatno = discogs?.catno || mb?.catno || '';
  const mergedGenre = discogs?.genre || (mb?.tags || []).join(', ') || '';
  const mergedFormats = discogs?.formats || [];
  const mergedCountry = discogs?.country || mbArtist?.area || '';
  const mergedDescription = discogs?.description || '';
  const mergedTracklist = discogs?.tracklist || [];

  // Artist bio
  let artistBio = discogsArtist?.bio || '';
  if (artistBio && discogsArtist?.realName) {
    artistBio = `Real name: ${discogsArtist.realName}. ${artistBio}`;
  }
  if (mbArtist?.disambiguation && !artistBio.includes(mbArtist.disambiguation)) {
    artistBio = artistBio ? `${mbArtist.disambiguation}. ${artistBio}` : mbArtist.disambiguation;
  }
  if (mbArtist?.beginDate) {
    artistBio += ` Active since ${mbArtist.beginDate}.`;
  }

  // Links
  if (discogs?.discogsUrl) links.push({ name: 'View Release on Discogs', url: discogs.discogsUrl });
  if (discogsArtist?.discogsUrl) links.push({ name: 'Artist on Discogs', url: discogsArtist.discogsUrl });
  if (mb?.recordingId) links.push({ name: 'View on MusicBrainz', url: `https://musicbrainz.org/recording/${mb.recordingId}` });
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
    label: mergedLabel + (mergedCatno ? ` (${mergedCatno})` : ''),
    genre: mergedGenre,
    formats: mergedFormats,
    country: mergedCountry,
    description: mergedDescription,
    artistBio,
    tracklist: mergedTracklist,
    links,
  };

  // 5. Cache in Supabase (fire-and-forget)
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
