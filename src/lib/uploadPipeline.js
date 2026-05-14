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
 * Uses fetch() for broad WebView/Safari compatibility.
 * Retries up to 3 times with exponential back-off.
 */
async function uploadToR2(file, userId, onProgress) {
  const MAX_RETRIES = 3;
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000 * attempt));
      console.log(`[Reef] R2 upload retry ${attempt}/${MAX_RETRIES - 1}`);
    }

    try {
      // 1. Get a presigned PUT URL
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

      // 2. Simulate progress while fetch uploads (fetch has no upload progress API)
      let simPct = 0;
      const SIM_INTERVAL = 800; // ms between ticks
      // Estimate bytes/sec based on file size: assume 500 KB/s min
      const estimatedMs = Math.max(5000, (file.size / (500 * 1024)) * 1000);
      const ticksTotal  = estimatedMs / SIM_INTERVAL;
      let tick = 0;

      const simTimer = setInterval(() => {
        tick++;
        // Ease-out curve: fast start, slows toward 90%
        simPct = Math.min(90, Math.round(90 * (1 - Math.pow(1 - tick / ticksTotal, 2))));
        onProgress?.(simPct);
      }, SIM_INTERVAL);

      // 3. Upload via fetch with 15-minute timeout via AbortController
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 15 * 60 * 1000);

      try {
        const uploadRes = await fetch(presignedUrl, {
          method:  'PUT',
          body:    file,
          headers: { 'Content-Type': file.type || guessMime(file.name) },
          signal:  controller.signal,
        });
        clearTimeout(timeoutId);
        clearInterval(simTimer);

        if (!uploadRes.ok) {
          throw new Error(`R2 upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
        }

        onProgress?.(100);
        return key; // success

      } catch (fetchErr) {
        clearTimeout(timeoutId);
        clearInterval(simTimer);
        throw fetchErr;
      }

    } catch (err) {
      lastErr = err;
      console.warn(`[Reef] R2 upload attempt ${attempt + 1} failed:`, err.message);
    }
  }

  throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${lastErr?.message}`);
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
  // Use getSession() — reads locally cached token instantly, no network round-trip
  const { data: { session }, error: authErr } = await supabase.auth.getSession();
  const user = session?.user;
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
