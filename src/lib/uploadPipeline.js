import { supabaseUrl, supabaseAnon } from './supabase';
import { parseBlob } from 'music-metadata-browser';

const R2_PUBLIC = import.meta.env.VITE_R2_PUBLIC_URL || 'https://audio.ree.fm';

/* ─── Lazy-loaded ffmpeg WASM for browser-side transcoding ────────────── */
let _ffmpeg = null;
async function getFFmpeg() {
  if (_ffmpeg && _ffmpeg.loaded) return _ffmpeg;
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');
  const ff = new FFmpeg();
  // Load WASM from CDN (cached after first load)
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
  await ff.load({
    coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
    wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  _ffmpeg = ff;
  return ff;
}

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

      // 2. Simulated progress — scales with file size (assume ~5 MB/s realistic upload)
      const estimatedMs = Math.max(15_000, (file.size / (5 * 1024 * 1024)) * 1000);
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
            setTimeout(() => rej(new Error('Upload timed out (30 min)')), 30 * 60_000)
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

/* ─── Browser-side transcoding: AIFF/WAV → AAC M4A ──────────────────── */

const TRANSCODE_FORMATS = new Set(['AIFF', 'AIF', 'WAV']);

/**
 * Transcodes an audio File (AIFF/WAV) → AAC 256k M4A using ffmpeg WASM.
 * Returns a File object with the .m4a extension, or null on failure.
 */
async function transcodeToAAC(file, onProgress) {
  try {
    onProgress?.('loading');
    const ff = await getFFmpeg();
    const { fetchFile } = await import('@ffmpeg/util');

    const inputName  = 'input' + (file.name.match(/\.[^.]+$/)?.[0] || '.aiff');
    const outputName = 'output.m4a';

    onProgress?.('transcoding');
    await ff.writeFile(inputName, await fetchFile(file));
    await ff.exec([
      '-i', inputName,
      '-c:a', 'aac',
      '-b:a', '256k',
      '-movflags', '+faststart',
      '-y', outputName,
    ]);

    const data = await ff.readFile(outputName);
    // Clean up WASM filesystem
    try { await ff.deleteFile(inputName); } catch {}
    try { await ff.deleteFile(outputName); } catch {}

    const m4aBlob = new Blob([data.buffer], { type: 'audio/mp4' });
    const m4aName = file.name.replace(/\.[^.]+$/, '.m4a');
    onProgress?.('done');
    return new File([m4aBlob], m4aName, { type: 'audio/mp4' });
  } catch (e) {
    console.warn('[KYOYU] Transcode failed (non-fatal):', e.message);
    onProgress?.('error');
    return null;
  }
}

/**
 * Uploads a transcoded streaming copy to R2 under the streaming/ prefix.
 * storageKey = original key, e.g. "userId/timestamp-Artist_-_Title.aiff"
 * streamingFile = the transcoded .m4a File
 */
async function uploadStreamingCopy(streamingFile, storageKey, userId, onProgress) {
  const streamingKey = 'streaming/' + storageKey.replace(/\.[^.]+$/, '.m4a');
  try {
    // Presign for the streaming key
    const presignRes = await fetch('/api/r2-presign', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        filename:    streamingKey.split('/').pop(),
        contentType: 'audio/mp4',
        fileSize:    streamingFile.size,
        userId,
        customKey:   streamingKey,
      }),
    });
    if (!presignRes.ok) throw new Error(`Presign failed: ${presignRes.status}`);
    const { presignedUrl } = await presignRes.json();

    const uploadRes = await fetch(presignedUrl, {
      method:  'PUT',
      body:    streamingFile,
      headers: { 'Content-Type': 'audio/mp4' },
    });
    if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);

    console.log('[KYOYU] Streaming copy uploaded:', streamingKey);
    onProgress?.(100);
    return streamingKey;
  } catch (e) {
    console.warn('[KYOYU] Streaming upload failed (non-fatal):', e.message);
    return null;
  }
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

  // ── Shared album: propagate the first non-empty album name to all tracks ──
  // This ensures multi-file uploads always group into one album on the Releases page
  // even if the user only filled the album field for one track.
  // Share the first filled artist across all tracks (can still be overridden per-track).
  const sharedArtist = trackMetas.find(m => m.artist?.trim())?.artist?.trim() || null;
  const sharedAlbum  = trackMetas.find(m => m.album?.trim())?.album?.trim()  || null;

  for (let i = 0; i < audioFiles.length; i++) {
    const { file } = audioFiles[i];
    const meta = trackMetas[i] || {};

    // ── 0. Parse duration from audio file ────────────────────────────
    let durationString = null;
    let durationSeconds = null;
    if (meta.duration) {
      durationString = meta.duration;
    } else {
      try {
        const metadata = await parseBlob(file);
        const durationSecs = metadata.format.duration || 0;
        durationSeconds = Math.round(durationSecs);
        const mins = Math.floor(durationSecs / 60);
        const secs = Math.floor(durationSecs % 60);
        durationString = `${mins}:${secs.toString().padStart(2, '0')}`;
        console.log('[KYOYU] Parsed duration:', durationString);
      } catch (e) {
        console.warn('[KYOYU] Could not parse duration:', e.message);
      }
    }

    // ── 1. Upload audio to R2 ──────────────────────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'audio' });
    console.log('[KYOYU] Uploading audio:', file?.name, file?.size, 'bytes');

    const audioKey = await uploadToR2(file, user.id, (pct) =>
      onProgress?.({ track: i, total: audioFiles.length, phase: 'audio', pct })
    );

    // ── 1b. Transcode AIFF/WAV → AAC M4A (browser-side ffmpeg WASM) ──
    const fmt = file.name.split('.').pop().toUpperCase();
    let streamingKey = null;
    if (TRANSCODE_FORMATS.has(fmt)) {
      onProgress?.({ track: i, total: audioFiles.length, phase: 'transcoding' });
      console.log('[KYOYU] Transcoding to AAC:', file.name);
      const m4aFile = await transcodeToAAC(file, (status) => {
        onProgress?.({ track: i, total: audioFiles.length, phase: 'transcoding', status });
      });
      if (m4aFile) {
        onProgress?.({ track: i, total: audioFiles.length, phase: 'uploading-stream' });
        streamingKey = await uploadStreamingCopy(m4aFile, audioKey, user.id, (pct) => {
          onProgress?.({ track: i, total: audioFiles.length, phase: 'uploading-stream', pct });
        });
      }
    }

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
      artist:      meta.artist?.trim() || sharedArtist || null,
      album:       meta.album?.trim()  || sharedAlbum || null,
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
      publish_at:  meta.publishAt     || null,
      duration:    durationString,
      duration_seconds: durationSeconds,
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

  const headers = {
    'Authorization': `Bearer ${token}`,
    'apikey':        supabaseAnon,
    'Accept':        'application/json',
    'Range':         '0-9999',
  };

  // Fetch tracks AND creator profile in parallel
  const [tracksRes, profileRes] = await Promise.all([
    Promise.race([
      fetch(`${supabaseUrl}/rest/v1/tracks?creator_id=eq.${user.id}&order=created_at.desc`, { headers }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Fetch tracks timed out')), 15_000)),
    ]),
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=artist_name,display_name`, { headers })
      .catch(() => null),
  ]);

  if (!tracksRes.ok) {
    const body = await tracksRes.json().catch(() => ({}));
    throw new Error(body.message || `Failed to load tracks (${tracksRes.status})`);
  }

  const tracks = await tracksRes.json();

  // Resolve the creator's default artist name from profile
  let creatorArtist = user.user_metadata?.artist_name || user.user_metadata?.display_name || null;
  if (profileRes?.ok) {
    const [profile] = await profileRes.json().catch(() => []);
    creatorArtist = profile?.artist_name || profile?.display_name || creatorArtist;
  }

  // ── Step 1: album-peer inheritance ──────────────────────────────────────────
  // If at least one track in an album has an artist, share it across all tracks
  const albumArtist = {};
  for (const t of tracks) {
    if (t.album?.trim() && t.artist) {
      albumArtist[t.album.trim()] = albumArtist[t.album.trim()] || t.artist;
    }
  }

  // ── Step 2: apply fallbacks ──────────────────────────────────────────────────
  for (const t of tracks) {
    if (!t.artist) {
      // First try: peer from same album
      if (t.album?.trim() && albumArtist[t.album.trim()]) {
        t.artist = albumArtist[t.album.trim()];
      // Second try: creator's own artist name (solo artist / self-releasing label)
      } else if (creatorArtist) {
        t.artist = creatorArtist;
      }
    }
  }

  return tracks.map(t => ({
    ...t,
    artworkUrl: t.artwork_url
      || (t.artwork_key ? `${supabaseUrl}/storage/v1/object/public/artwork/${t.artwork_key}` : null),
  }));
}

/** Stub — imported by UserUploads.jsx but not actively used */
export async function getSignedUrl(key) {
  if (!key) return null;
  return r2Url(key);
}

/**
 * Fetches all distinct artist names for the current creator.
 * Uses the same manual-auth pattern as fetchMyTracks so RLS works correctly.
 */
export async function fetchAllArtists() {
  const { user, token } = getLocalSession();
  // No server-side artist filter — fetch all artist values and dedupe in JS
  // (avoids PostgREST 400 errors from "not.is.null" syntax differences)
  const res = await fetch(
    `${supabaseUrl}/rest/v1/tracks?select=artist&creator_id=eq.${user.id}&order=created_at.desc`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey':        supabaseAnon,
        'Accept':        'application/json',
        'Range':         '0-9999',
      },
    }
  );
  console.log('[KYOYU] fetchAllArtists status:', res.status);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn('[KYOYU] fetchAllArtists failed:', err);
    return [];
  }
  const rows = await res.json();
  console.log('[KYOYU] fetchAllArtists rows returned:', rows.length);
  const names = [...new Set(
    rows.map(r => r.artist).filter(n => n && n.trim() && n !== '—')
  )].sort((a, b) => a.localeCompare(b));
  console.log('[KYOYU] fetchAllArtists unique artists:', names);
  return names;
}

/**
 * Fetches all public releases directly from Supabase REST API.
 * Uses the anon key — works because of the RLS policy:
 *   "Public tracks readable by everyone" (visibility = 'public')
 *
 * Actual tracks table columns (verified):
 *   id, creator_id, title, artist, album, genre, year, duration, format,
 *   tags, visibility, status, storage_key, artwork_key, artwork_url,
 *   created_at, published_at, label, publish_at
 *
 * Audio lives on R2 at: ${R2_PUBLIC}/${storage_key}
 */
export async function fetchPublicTracks(query = '') {
  try {
    let qs = 'visibility=eq.public&order=created_at.desc&limit=200';

    if (query) {
      const q = encodeURIComponent(`%${query}%`);
      qs += `&or=(title.ilike.${q},artist.ilike.${q},album.ilike.${q},label.ilike.${q},genre.ilike.${q})`;
    }

    // select=* — safe against any future schema changes, avoids 400 on unknown columns
    const url = `${supabaseUrl}/rest/v1/tracks?${qs}&select=*`;

    const res = await fetch(url, {
      headers: {
        'apikey': supabaseAnon,
        'Accept': 'application/json',
        'Range':  '0-199',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[fetchPublicTracks] error:', err);
      return [];
    }

    const tracks = await res.json();
    if (!Array.isArray(tracks)) {
      console.warn('[fetchPublicTracks] unexpected response:', tracks);
      return [];
    }

    return tracks.map(t => ({
      id:       t.id,
      title:    t.title   || 'Untitled',
      artist:   t.artist  || 'Unknown Artist',
      artistId: t.creator_id,
      album:    t.album   || t.title || '',
      label:    t.label   || '',
      genre:    t.genre   || '',
      year:     t.year    || new Date().getFullYear(),
      // Artwork: stored either as full URL or key in Supabase storage
      cover:
        t.artwork_url ||
        (t.artwork_key
          ? `${supabaseUrl}/storage/v1/object/public/artwork/${t.artwork_key}`
          : null),
      // Audio: prefer streaming AAC copy for AIFF/WAV (browsers can't stream those)
      // Convention: streaming/{original_key_without_ext}.m4a
      audioUrl: (() => {
        if (!t.storage_key) return null;
        const fmt = (t.format || '').toUpperCase();
        if (fmt === 'AIFF' || fmt === 'AIF' || fmt === 'WAV') {
          const base = t.storage_key.replace(/\.[^.]+$/, '');
          return `${R2_PUBLIC}/streaming/${base}.m4a`;
        }
        return `${R2_PUBLIC}/${t.storage_key}`;
      })(),
      // Keep original URL for DJ downloads
      downloadUrl: t.storage_key ? `${R2_PUBLIC}/${t.storage_key}` : null,
      storageKey: t.storage_key || '',
      duration: t.duration || null,
      createdAt: t.created_at,
    }));
  } catch (e) {
    console.warn('[fetchPublicTracks]', e.message);
    return [];
  }
}
