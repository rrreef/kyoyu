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
 * Uses fetch() + Promise.race timeouts (AbortController is unreliable in WKWebView).
 */
async function uploadToR2(file, userId, onProgress) {
  const MAX_RETRIES = 2;
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000));
      console.log(`[Reef] R2 upload retry ${attempt}`);
    }

    try {
      // 1. Presign — 12 s race timeout (setTimeout always fires in WebView)
      const presignRace = Promise.race([
        fetch('/api/r2-presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename:    file.name,
            contentType: file.type || guessMime(file.name),
            fileSize:    file.size,
            userId,
          }),
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Step 1 failed: Presign timed out after 3 s — check Vercel function logs')), 3_000)
        ),
      ]);

      const presignRes = await presignRace;
      if (!presignRes.ok) {
        const body = await presignRes.json().catch(() => ({}));
        throw new Error(body.error || `Presign failed (${presignRes.status})`);
      }
      const { presignedUrl, key } = await presignRes.json();

      // 2. Simulate progress animation while upload is in flight
      let simPct = 0;
      const estimatedMs = Math.max(10_000, (file.size / (200 * 1024)) * 1000);
      const ticksTotal  = estimatedMs / 800;
      let tick = 0;
      const simTimer = setInterval(() => {
        tick++;
        simPct = Math.min(88, Math.round(88 * (1 - Math.pow(1 - tick / ticksTotal, 2))));
        onProgress?.(simPct);
      }, 800);

      // 3. Upload PUT — 3-minute race timeout
      let simDone = false;
      const uploadRace = Promise.race([
        fetch(presignedUrl, {
          method:  'PUT',
          body:    file,
          headers: { 'Content-Type': file.type || guessMime(file.name) },
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Upload timed out (3 min) — file too large or connection lost')), 3 * 60_000)
        ),
      ]);

      let uploadRes;
      try {
        uploadRes = await uploadRace;
        simDone = true;
      } finally {
        clearInterval(simTimer);
      }

      if (!uploadRes.ok) {
        throw new Error(`R2 rejected upload: ${uploadRes.status} ${uploadRes.statusText}`);
      }

      onProgress?.(100);
      return key;

    } catch (err) {
      lastErr = err;
      console.warn(`[Reef] attempt ${attempt + 1} failed:`, err.message);
    }
  }

  throw new Error(`Upload failed: ${lastErr?.message}`);
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
  console.log('[KYOYU] uploadRelease called, files:', audioFiles.length);
  // ── Auth check ──────────────────────────────────────────────
  // getSession() can hang if the JWT needs a network refresh.
  // Race it against a 5s timeout, then fall back to raw localStorage.
  let user = null;
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('session_timeout')), 5_000)),
    ]);
    user = result?.data?.session?.user ?? null;
  } catch {
    // Timeout or error — try reading raw session from localStorage
    try {
      const raw = Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } })
        .find(v => v?.user);
      user = raw?.user ?? null;
      console.log('[KYOYU] Auth via localStorage fallback:', user ? 'OK' : 'FAIL');
    } catch { /* ignore */ }
  }
  console.log('[KYOYU] Auth:', user ? `OK (${user.id})` : 'FAIL');
  if (!user) {
    throw new Error('You are not logged in. Please sign in to your creator account before uploading.');
  }

  const results = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const { file } = audioFiles[i];
    const meta = trackMetas[i] || {};

    // ── 1. Upload audio to R2 ────────────────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'audio' });
    console.log('[KYOYU] Starting R2 upload for:', file?.name, file?.size, 'bytes');

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
