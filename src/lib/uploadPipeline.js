import { supabase } from './supabase';

const R2_PUBLIC = import.meta.env.VITE_R2_PUBLIC_URL || 'https://audio.ree.fm';

/* ─── Helpers ────────────────────────────────────────────── */

function withTimeout(promise, ms = 4 * 60 * 1000, label = 'Request') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out — check your internet connection.`)), ms
    );
    promise
      .then(v => { clearTimeout(timer); resolve(v); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Upload a file directly to Cloudflare R2 via presigned URL.
 * Returns the R2 key (stored in DB) and the public streaming URL.
 * Uses XHR so we get real upload progress.
 */
async function uploadToR2(file, userId, onProgress) {
  // 1. Get a presigned PUT URL from our Vercel API
  const res = await fetch('/api/r2-presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename:    file.name,
      contentType: file.type || guessMime(file.name),
      fileSize:    file.size,
      userId,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Presign request failed (${res.status})`);
  }
  const { presignedUrl, key } = await res.json();

  // 2. Upload directly to R2 (browser → Cloudflare, no Vercel body limit)
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload  = () => xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`R2 upload failed: ${xhr.status} ${xhr.statusText}`));
    xhr.onerror = () => reject(new Error('Network error during upload — check your connection.'));
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || guessMime(file.name));
    xhr.send(file);
  });

  return key;
}

function guessMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = { wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff',
                mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4' };
  return map[ext] || 'application/octet-stream';
}

/** Returns the public streaming URL for a track stored in R2 */
export function r2Url(key) {
  if (!key) return null;
  // Already a full URL (legacy Supabase tracks)
  if (key.startsWith('http')) return key;
  return `${R2_PUBLIC}/${key}`;
}

/* ─── Main upload pipeline ───────────────────────────────── */

/**
 * Uploads a full release (multiple tracks) to R2 (audio) + Supabase (artwork + DB).
 */
export async function uploadRelease({ audioFiles, trackMetas, globalForm, onProgress }) {
  // ── Auth check ──────────────────────────────────────────────
  const { data: { user }, error: authErr } = await withTimeout(
    supabase.auth.getUser(), 15_000, 'Auth check'
  );
  if (authErr || !user) {
    throw new Error('You are not logged in. Please sign in to your creator account before uploading.');
  }

  const results = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const { file } = audioFiles[i];
    const meta = trackMetas[i] || {};

    // ── 1. Upload audio to R2 ────────────────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'audio' });
    console.log('[Reef] Uploading audio to R2:', file.name, Math.round(file.size / 1024 / 1024) + ' MB');

    const audioKey = await uploadToR2(file, user.id, (pct) => {
      // Forward XHR progress as an extended progress object
      onProgress?.({ track: i, total: audioFiles.length, phase: 'audio', pct });
    });

    // ── 2. Upload artwork to Supabase Storage ────────────────
    let artworkKey = null;
    if (meta.artwork) {
      onProgress?.({ track: i, total: audioFiles.length, phase: 'artwork' });
      const ext = (meta.artwork.name?.split('.').pop() || 'jpg').toLowerCase();
      artworkKey = `${user.id}/${Date.now()}-artwork.${ext}`;

      const { error: artErr } = await withTimeout(
        supabase.storage.from('artwork').upload(artworkKey, meta.artwork, {
          contentType: meta.artwork.type || 'image/jpeg',
          upsert: false,
        }),
        60_000, 'Artwork upload'
      );
      if (artErr) throw new Error(`Artwork upload failed: ${artErr.message}`);
    }

    // ── 3. Save metadata to tracks table ────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'saving' });

    const { data: track, error: dbErr } = await withTimeout(
      supabase.from('tracks').insert({
        creator_id:  user.id,
        title:       meta.title?.trim()  || file.name,
        artist:      meta.artist?.trim() || null,
        album:       meta.album?.trim()  || null,
        genre:       meta.genre?.trim()  || null,
        year:        meta.year ? parseInt(meta.year) : null,
        format:      file.name.split('.').pop().toUpperCase(),
        tags:        [meta.genre].filter(Boolean),
        visibility:  meta.visibility || 'private',
        status:      'pending',
        storage_key: audioKey,     // R2 key — use r2Url(key) to get the full URL
        artwork_key: artworkKey,
      }).select().single(),
      30_000, 'Metadata save'
    );
    if (dbErr) throw new Error(`Metadata save failed: ${dbErr.message}`);

    // ── 4. Save per-track credits ────────────────────────────
    if (meta.credits?.length && track?.id) {
      const rows = meta.credits
        .filter(c => c.name?.trim())
        .map(c => ({ track_id: track.id, role: c.role?.trim() || null, name: c.name.trim() }));
      if (rows.length) {
        const { error: credErr } = await supabase.from('track_credits').insert(rows);
        if (credErr) console.warn('[Reef] Credits insert (non-fatal):', credErr);
      }
    }

    results.push(track);
  }

  return results;
}

/* ─── Streaming helpers ──────────────────────────────────── */

/**
 * Returns the artwork URL for a track.
 * Artwork stays on Supabase Storage (small files, not streamed).
 */
export async function getArtworkUrl(artworkKey, expiresIn = 43200) {
  if (!artworkKey) return null;
  const { data, error } = await supabase.storage
    .from('artwork')
    .createSignedUrl(artworkKey, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Fetches the authenticated creator's tracks from the DB,
 * enriched with artwork URLs.
 */
export async function fetchMyTracks() {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const enriched = await Promise.all(
    (data || []).map(async t => ({
      ...t,
      audioUrl:   r2Url(t.storage_key),
      artworkUrl: t.artwork_key ? await getArtworkUrl(t.artwork_key) : null,
    }))
  );
  return enriched;
}

// Legacy alias — kept for any existing imports
export { getArtworkUrl as getSignedUrl };
