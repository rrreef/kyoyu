// POST /api/discogs-ingest
// Body: { type: 'artist'|'release'|'label', discogsId: number }
// Returns: canonical entity record

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DISCOGS_BASE = 'https://api.discogs.com';
const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];

// Simple in-memory rate limiter
let requestLog = [];
const RATE_LIMIT = 55;
const RATE_WINDOW = 60000;

async function discogsGet(path) {
  const now = Date.now();
  requestLog = requestLog.filter(t => now - t < RATE_WINDOW);
  if (requestLog.length >= RATE_LIMIT) {
    throw new Error('Discogs rate limit reached');
  }
  requestLog.push(now);

  const headers = {
    'User-Agent': process.env.DISCOGS_USER_AGENT || 'Kyoyu/1.0 +https://ree.fm',
    'Accept': 'application/json',
  };
  if (process.env.DISCOGS_TOKEN) {
    headers['Authorization'] = `Discogs token=${process.env.DISCOGS_TOKEN}`;
  }

  const res = await fetch(`${DISCOGS_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`Discogs API ${res.status}`);
  return res.json();
}

function slugify(text) {
  if (!text) return '';
  return text.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function classifyUrl(url) {
  if (!url) return 'website';
  const u = url.toLowerCase();
  if (u.includes('spotify.com')) return 'spotify';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('bandcamp.com')) return 'bandcamp';
  if (u.includes('soundcloud.com')) return 'soundcloud';
  if (u.includes('deezer.com')) return 'deezer';
  if (u.includes('discogs.com')) return 'discogs';
  return 'website';
}

async function generateSlug(table, name) {
  const base = slugify(name);
  const { data } = await supabase.from(table).select('slug').like('slug', `${base}%`);
  const existing = data ? data.map(d => d.slug) : [];
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

async function insertExternalLinks(entityType, entityId, urls) {
  if (!urls || urls.length === 0) return;
  const links = urls.map(url => ({
    entity_type: entityType,
    entity_id: entityId,
    platform: classifyUrl(url),
    url,
  }));
  // Use upsert to avoid duplicate conflicts
  await supabase.from('external_links').upsert(links, { onConflict: 'entity_type,entity_id,platform' });
}

async function insertSourceRecord(entityType, entityId, discogsData) {
  await supabase.from('source_records').upsert({
    entity_type: entityType,
    entity_id: entityId,
    source: 'discogs',
    source_id: discogsData.id.toString(),
    source_url: discogsData.uri || null,
    raw_data: discogsData,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'entity_type,source,source_id' });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, discogsId } = req.body || {};
    if (!type || !discogsId) {
      return res.status(400).json({ error: 'Missing type or discogsId' });
    }

    // ── ARTIST ──
    if (type === 'artist') {
      const { data: existing } = await supabase
        .from('canonical_artists').select('*').eq('discogs_id', discogsId).maybeSingle();
      if (existing) return res.status(200).json({ ...existing, status: 'existing' });

      const artist = await discogsGet(`/artists/${discogsId}`);
      const slug = await generateSlug('canonical_artists', artist.name);

      const { data: inserted, error } = await supabase
        .from('canonical_artists')
        .insert({
          name: artist.name,
          slug,
          real_name: artist.realname || null,
          profile_text: artist.profile || null,
          discogs_id: artist.id,
        })
        .select().single();
      if (error) throw error;

      await insertExternalLinks('artist', inserted.id, artist.urls);
      await insertSourceRecord('artist', inserted.id, artist);

      return res.status(200).json({ ...inserted, status: 'created' });
    }

    // ── LABEL ──
    if (type === 'label') {
      const { data: existing } = await supabase
        .from('canonical_labels').select('*').eq('discogs_id', discogsId).maybeSingle();
      if (existing) return res.status(200).json({ ...existing, status: 'existing' });

      const label = await discogsGet(`/labels/${discogsId}`);
      const slug = await generateSlug('canonical_labels', label.name);

      const { data: inserted, error } = await supabase
        .from('canonical_labels')
        .insert({
          name: label.name,
          slug,
          profile_text: label.profile || null,
          contact_info: label.contact_info || null,
          discogs_id: label.id,
        })
        .select().single();
      if (error) throw error;

      await insertExternalLinks('label', inserted.id, label.urls);
      await insertSourceRecord('label', inserted.id, label);

      return res.status(200).json({ ...inserted, status: 'created' });
    }

    // ── RELEASE ──
    if (type === 'release') {
      const { data: existing } = await supabase
        .from('canonical_releases').select('*').eq('discogs_id', discogsId).maybeSingle();
      if (existing) return res.status(200).json({ ...existing, status: 'existing' });

      const release = await discogsGet(`/releases/${discogsId}`);
      const slug = await generateSlug('canonical_releases', release.title);

      // Try to find/create the artist
      let artistId = null;
      if (release.artists && release.artists.length > 0) {
        const mainArtist = release.artists[0];
        if (mainArtist.id) {
          const { data: existingArtist } = await supabase
            .from('canonical_artists').select('id').eq('discogs_id', mainArtist.id).maybeSingle();
          if (existingArtist) {
            artistId = existingArtist.id;
          }
        }
      }

      // Try to find/create the label
      let labelId = null;
      if (release.labels && release.labels.length > 0) {
        const mainLabel = release.labels[0];
        if (mainLabel.id) {
          const { data: existingLabel } = await supabase
            .from('canonical_labels').select('id').eq('discogs_id', mainLabel.id).maybeSingle();
          if (existingLabel) {
            labelId = existingLabel.id;
          }
        }
      }

      const { data: inserted, error } = await supabase
        .from('canonical_releases')
        .insert({
          title: release.title,
          slug,
          artist_id: artistId,
          label_id: labelId,
          discogs_id: release.id,
          discogs_master_id: release.master_id || null,
          release_date: release.released || null,
          country: release.country || null,
          format: release.formats?.[0]?.name || null,
          catalog_number: release.labels?.[0]?.catno || null,
          barcode: (release.identifiers || []).find(i => i.type === 'Barcode')?.value || null,
          genres: release.genres || [],
          styles: release.styles || [],
          notes: release.notes || null,
        })
        .select().single();
      if (error) throw error;

      // Insert tracklist
      if (release.tracklist && release.tracklist.length > 0) {
        const tracks = release.tracklist
          .filter(t => t.type_ === 'track') // skip headings/index tracks
          .map(t => ({
            title: t.title,
            position: t.position,
            duration: t.duration,
            release_id: inserted.id,
            discogs_release_id: release.id,
          }));
        if (tracks.length > 0) {
          await supabase.from('canonical_tracks').insert(tracks);
        }
      }

      // Insert credits
      if (release.extraartists && release.extraartists.length > 0) {
        const credits = release.extraartists.map(c => ({
          release_id: inserted.id,
          artist_name: c.name,
          role: c.role,
        }));
        await supabase.from('release_credits').insert(credits);
      }

      await insertSourceRecord('release', inserted.id, release);

      return res.status(200).json({ ...inserted, status: 'created' });
    }

    return res.status(400).json({ error: 'Unsupported type. Use: artist, label, release' });
  } catch (err) {
    console.error('Discogs ingest error:', err);
    return res.status(500).json({ error: err.message || 'Ingest failed' });
  }
}
