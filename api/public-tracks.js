// api/public-tracks.js
// Returns all public releases from Supabase, bypassing RLS.
// No auth required — this data is intentionally public.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { q = '' } = req.query;

    // Fetch public tracks + their creator profiles
    let query = supabase
      .from('tracks')
      .select(`
        id, title, artist, album, label, genre, year,
        artwork_url, artwork_key, audio_url, audio_key,
        visibility, status, creator_id, created_at,
        digital_format, physical_format
      `)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(200);

    if (q) {
      query = query.or(
        `title.ilike.%${q}%,artist.ilike.%${q}%,album.ilike.%${q}%,label.ilike.%${q}%,genre.ilike.%${q}%`
      );
    }

    const { data: tracks, error } = await query;
    if (error) throw error;

    // Resolve artwork and audio URLs
    const normalized = (tracks || []).map(t => ({
      id:       t.id,
      title:    t.title   || 'Untitled',
      artist:   t.artist  || 'Unknown Artist',
      artistId: t.creator_id,
      album:    t.album   || t.title || '',
      label:    t.label   || '',
      genre:    t.genre   || '',
      year:     t.year    || new Date().getFullYear(),
      // cover image
      cover:
        t.artwork_url ||
        (t.artwork_key
          ? `${SUPABASE_URL}/storage/v1/object/public/artwork/${t.artwork_key}`
          : null),
      // streamable audio
      audioUrl:
        t.audio_url ||
        (t.audio_key
          ? `${SUPABASE_URL}/storage/v1/object/public/audio/${t.audio_key}`
          : null),
      formats: [
        t.digital_format  !== 'None' ? t.digital_format  : null,
        t.physical_format !== 'None' ? t.physical_format : null,
      ].filter(Boolean),
      createdAt: t.created_at,
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ tracks: normalized });
  } catch (err) {
    console.error('[public-tracks]', err.message);
    return res.status(500).json({ error: 'Failed to load public tracks' });
  }
}
