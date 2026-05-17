import { supabaseUrl, supabaseAnon } from './supabase';

const R2_PUBLIC = import.meta.env.VITE_R2_PUBLIC_URL || 'https://audio.ree.fm';

/* ─── Auth helper (NO Supabase JS client — reads JWT from localStorage) ── */

/**
 * Reads the raw Supabase session from localStorage.
 * Decodes the JWT locally — zero network calls, zero hanging.
 * Returns { user, token } or throws a user-friendly error.
 */
function getLocalSession() {
  // Find the sb-*-auth-token key
  const key = Object.keys(localStorage)
    .find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  if (!key) throw new Error('No session found — please sign in before uploading.');

  let raw;
  try { raw = JSON.parse(localStorage.getItem(key)); } catch {
    throw new Error('Session data is corrupted — please sign out and sign back in.');
  }

  const token = raw?.access_token;
  if (!token) throw new Error('No access token found — please sign in before uploading.');

  // Decode JWT payload (base64url, no network)
  let payload;
  try {
    payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    throw new Error('Session token is malformed — please sign out and sign back in.');
  }

  const isExpired = (payload.exp ?? 0) * 1000 < Date.now();
  if (isExpired) {
    throw new Error('Your session has expired — please sign out and sign back in, then try again.');
  }

  const user = raw.user ?? { id: payload.sub, email: payload.email };
  console.log('[KYOYU] Auth from localStorage:', user?.id);
  return { user, token };
}

/* ─── Supabase REST helpers (direct fetch, no JS client middleware) ────── */

/**
 * Direct POST/PATCH to Supabase REST API — no auth middleware, no hanging.
 */
async function sbPost(path, body, token, { prefer = 'return=representation', method = 'POST' } = {}) {
  const res = await Promise.race([
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey':        supabaseAnon,
        'Prefer':        prefer,
      },
      body: JSON.stringify(body),
    }),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`Supabase REST ${path} timed out`)), 30_000)
    ),
  ]);

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const msg = (typeof data === 'object' ? (data.message || data.error || data.msg) : data) || res.statusText;
    throw new Error(msg);
  }
  return data;
}

/**
 * Direct file upload to Supabase Storage — no JS client, no hanging.
 */
async function sbStorageUpload(bucket, path, file, token) {
  const res = await Promise.race([
    fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey':        supabaseAnon,
        'Content-Type':  file.type || 'application/octet-stream',
        'x-upsert':      'false',
      },
      body: file,
    }),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('Artwork upload timed out')), 60_000)
    ),
  ]);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Artwork upload failed: ${body.message || res.status}`);
  }
}

/* ─── R2 upload ──────────────────────────────────────────────────────── */

function guessMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = { wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff',
                mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4' };
  return map[ext] || 'application/octet-stream';
}

async function uploadToR2(file, userId, onProgress) {
  const MAX_RETRIES = 2;
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000));
      console.log(`[KYOYU] R2 retry ${attempt}`);
    }

    try {
      // 1. Presign
      const presignRes = await Promise.race([
        fetch('/api/r2-presign', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            filename:    file.name,
            contentType: file.type || guessMime(file.name),
            fileSize:    file.size,
            userId,
          }),
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Presign timed out — Vercel function unresponsive')), 15_000)
        ),
      ]);

      if (!presignRes.ok) {
        const b = await presignRes.json().catch(() => ({}));
        throw new Error(b.error || `Presign failed (${presignRes.status})`);
      }
      const { presignedUrl, key } = await presignRes.json();

      // 2. Simulated progress
      const estimatedMs = Math.max(10_000, (file.size / (200 * 1024)) * 1000);
      const ticksTotal  = estimatedMs / 800;
      let tick = 0;
      const simTimer = setInterval(() => {
        tick++;
        const pct = Math.min(88, Math.round(88 * (1 - Math.pow(1 - tick / ticksTotal, 2))));
        onProgress?.(pct);
      }, 800);

      // 3. PUT to R2
      let uploadRes;
      try {
        uploadRes = await Promise.race([
          fetch(presignedUrl, {
            method:  'PUT',
            body:    file,
            headers: { 'Content-Type': file.type || guessMime(file.name) },
          }),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('Upload timed out (3 min)')), 3 * 60_000)
          ),
        ]);
      } finally {
        clearInterval(simTimer);
      }

      if (!uploadRes.ok) throw new Error(`R2 rejected: ${uploadRes.status}`);
      onProgress?.(100);
      return key;

    } catch (err) {
      lastErr = err;
      console.warn(`[KYOYU] R2 attempt ${attempt + 1} failed:`, err.message);
    }
  }
  throw new Error(`Audio upload failed: ${lastErr?.message}`);
}

/* ─── Public helpers ─────────────────────────────────────────────────── */

export function r2Url(key) {
  if (!key) return null;
  if (key.startsWith('http')) return key;
  return `${R2_PUBLIC}/${key}`;
}

/* ─── Main pipeline ──────────────────────────────────────────────────── */

/**
 * Uploads a full release. All Supabase operations use direct REST fetch —
 * no JS client auth middleware, no dependency on the Supabase auth server.
 */
export async function uploadRelease({ audioFiles, trackMetas, globalForm, onProgress }) {
  console.log('[KYOYU] uploadRelease called, files:', audioFiles.length);

  // ── Auth: read JWT from localStorage — zero network calls ──────────
  const { user, token } = getLocalSession();
  console.log('[KYOYU] Auth OK:', user.id);

  // ── Ensure profile exists (FK: tracks.creator_id → profiles.id) ────
  // Upsert so even accounts created before the trigger work.
  try {
    await sbPost('profiles?on_conflict=id', {
      id:           user.id,
      email:        user.email ?? '',
      role:         'creator',
      display_name: user.user_metadata?.display_name || (user.email ?? '').split('@')[0] || '',
      artist_name:  user.user_metadata?.artist_name  || '',
    }, token, { prefer: 'resolution=merge-duplicates,return=minimal' });
    console.log('[KYOYU] Profile upsert OK');
  } catch (e) {
    console.warn('[KYOYU] Profile upsert (non-fatal):', e.message);
  }

  const results = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const { file } = audioFiles[i];
    const meta = trackMetas[i] || {};

    // ── 1. Upload audio to R2 ──────────────────────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'audio' });
    console.log('[KYOYU] Uploading audio:', file?.name, file?.size, 'bytes');

    const audioKey = await uploadToR2(file, user.id, (pct) =>
      onProgress?.({ track: i, total: audioFiles.length, phase: 'audio', pct })
    );

    // ── 2. Upload artwork to Supabase Storage ──────────────────────
    let artworkKey = null;
    let artworkUrl = null;

    // Resolve artwork: explicit file upload OR blob: URL from embedded audio tags
    let artworkFile = meta.artwork ?? null;
    if (!artworkFile && meta.artworkUrl?.startsWith('blob:')) {
      try {
        const blobRes  = await fetch(meta.artworkUrl);
        const blob     = await blobRes.blob();
        artworkFile    = new File([blob], 'artwork.jpg', { type: blob.type || 'image/jpeg' });
        console.log('[KYOYU] Artwork resolved from embedded tag blob');
      } catch (e) {
        console.warn('[KYOYU] Could not resolve blob artwork:', e.message);
      }
    }

    if (artworkFile) {
      onProgress?.({ track: i, total: audioFiles.length, phase: 'artwork' });
      const ext  = (artworkFile.name?.split('.').pop() || 'jpg').toLowerCase();
      artworkKey = `${user.id}/${Date.now()}-artwork.${ext}`;
      await sbStorageUpload('artwork', artworkKey, artworkFile, token);

      // Generate a signed URL (1-year TTL) for display
      try {
        const signRes = await fetch(
          `${supabaseUrl}/storage/v1/object/sign/artwork/${artworkKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${token}`,
              'apikey':        supabaseAnon,
            },
            body: JSON.stringify({ expiresIn: 365 * 24 * 3600 }),
          }
        );
        if (signRes.ok) {
          const { signedURL } = await signRes.json();
          artworkUrl = signedURL
            ? `${supabaseUrl}/storage/v1${signedURL}`
            : `${supabaseUrl}/storage/v1/object/public/artwork/${artworkKey}`;
        }
      } catch (e) {
        // Fallback to public URL (works if bucket is set to public)
        artworkUrl = `${supabaseUrl}/storage/v1/object/public/artwork/${artworkKey}`;
        console.warn('[KYOYU] Signed URL failed, using public URL fallback');
      }
    }

    // ── 3. Save track metadata ─────────────────────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'saving' });
    console.log('[KYOYU] Saving track metadata...');

    const [track] = await sbPost('tracks', {
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
      storage_key: audioKey,
      artwork_key: artworkKey,
      artwork_url: artworkUrl,
      label:       meta.label?.trim() || null,
      // publish_at:  meta.publishAt || null,  // uncomment after: ALTER TABLE tracks ADD COLUMN publish_at TIMESTAMPTZ;
    }, token);

    console.log('[KYOYU] Track saved:', track?.id);

    // ── 4. Save credits ────────────────────────────────────────────
    if (meta.credits?.length && track?.id) {
      const rows = meta.credits
        .filter(c => c.name?.trim())
        .map(c => ({ track_id: track.id, role: c.role?.trim() || null, name: c.name.trim() }));
      if (rows.length) {
        try {
          await sbPost('track_credits', rows, token, { prefer: 'return=minimal' });
        } catch (e) {
          console.warn('[KYOYU] Credits insert (non-fatal):', e.message);
        }
      }
    }

    results.push(track);
  }

  return results;
}

/* ─── fetchMyTracks — used by Releases.jsx ───────────────────────────── */

/**
 * Fetches the current user's tracks directly from Supabase REST API.
 * Zero Supabase JS client auth middleware — same approach as uploadRelease.
 */
export async function fetchMyTracks() {
  const { user, token } = getLocalSession();

  const res = await Promise.race([
    fetch(
      `${supabaseUrl}/rest/v1/tracks?creator_id=eq.${user.id}&order=created_at.desc`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey':        supabaseAnon,
          'Accept':        'application/json',
        },
      }
    ),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Fetch tracks timed out')), 15_000)),
  ]);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Failed to load tracks (${res.status})`);
  }

  const tracks = await res.json();

  // Map DB columns → UI-expected shape
  return tracks.map(t => ({
    ...t,
    // artwork_url is saved at upload time (signed URL or public URL)
    // Fallback: construct public URL from artwork_key if artwork_url missing
    artworkUrl: t.artwork_url
      || (t.artwork_key ? `${supabaseUrl}/storage/v1/object/public/artwork/${t.artwork_key}` : null),
  }));
}

/** Stub — imported by UserUploads.jsx but not actively used */
export async function getSignedUrl(key) {
  if (!key) return null;
  return r2Url(key);
}
