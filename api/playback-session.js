// api/playback-session.js — Vercel serverless function
// Returns a short-lived presigned GET URL for streaming audio directly from R2.
// Audio bytes go client → R2 (not through the app server).
// Also returns track metadata (duration, format) so the client has it instantly.

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];
const SIGNED_URL_TTL  = 300; // 5 minutes — short-lived for security

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { storageKey, trackId } = req.body ?? {};

  if (!storageKey && !trackId) {
    return res.status(400).json({ error: 'Missing: storageKey or trackId' });
  }

  try {
    let track = null;

    if (trackId) {
      // Look up track by ID
      const { data, error } = await supabase
        .from('tracks')
        .select('id, title, artist, duration, format, storage_key, artwork_url, artwork_key')
        .eq('id', trackId)
        .single();
      if (error || !data) {
        return res.status(404).json({ error: 'Track not found' });
      }
      track = data;
    } else {
      // Look up track by storage_key (from audio URL path)
      const { data, error } = await supabase
        .from('tracks')
        .select('id, title, artist, duration, format, storage_key, artwork_url, artwork_key')
        .eq('storage_key', storageKey)
        .single();
      if (error || !data) {
        // If no track found in DB, still try to sign the key directly
        // (handles tracks not yet in DB or with different key format)
        track = { storage_key: storageKey };
      } else {
        track = data;
      }
    }

    const key = track.storage_key || storageKey;
    if (!key) {
      return res.status(400).json({ error: 'No storage key available' });
    }

    // Generate presigned GET URL — goes directly to R2 S3 endpoint
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key:    key,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: SIGNED_URL_TTL });

    // Resolve artwork URL
    let artworkUrl = track.artwork_url || null;
    if (!artworkUrl && track.artwork_key) {
      artworkUrl = `${SUPABASE_URL}/storage/v1/object/public/artwork/${track.artwork_key}`;
    }

    return res.status(200).json({
      url:       signedUrl,
      expiresIn: SIGNED_URL_TTL,
      trackId:   track.id || null,
      title:     track.title || null,
      artist:    track.artist || null,
      duration:  track.duration || null,
      format:    track.format || null,
      artwork:   artworkUrl,
    });
  } catch (err) {
    console.error('[playback-session] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
