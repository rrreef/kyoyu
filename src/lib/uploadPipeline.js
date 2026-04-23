import { supabase } from './supabase';

/* ─── Timeout helper ─────────────────────────────────────────
   Races any promise against a 4-minute ceiling so a hung upload
   never freezes the UI indefinitely.
─────────────────────────────────────────────────────────────── */
function withTimeout(promise, ms = 4 * 60 * 1000, label = 'Request') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(
        `${label} timed out — check your internet connection and that ` +
        `storage bucket policies have been applied in Supabase.`
      )),
      ms
    );
    promise
      .then(v => { clearTimeout(timer); resolve(v); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Uploads a full release (multiple tracks) to Supabase Storage + saves metadata to DB.
 * @param {object} opts
 * @param {Array}  opts.audioFiles   - [{ file, id }]
 * @param {Array}  opts.trackMetas   - one metadata object per audioFile
 * @param {object} opts.globalForm   - pricing / contract settings
 * @param {function} opts.onProgress - ({ track, total, phase }) callback
 * @returns {Promise<Array>} array of inserted track rows
 */
export async function uploadRelease({ audioFiles, trackMetas, globalForm, onProgress }) {
  // ── Auth check ──────────────────────────────────────────────
  const { data: { user }, error: authErr } = await withTimeout(
    supabase.auth.getUser(), 15_000, 'Auth check'
  );
  if (authErr || !user) {
    throw new Error(
      'You are not logged in. Please sign in to your creator account before uploading.'
    );
  }

  // ── File size guard (Supabase free tier = 50 MB per file) ──
  const MAX_MB = 50;
  const MAX_BYTES = MAX_MB * 1024 * 1024;
  for (const { file } of audioFiles) {
    if (file.size > MAX_BYTES) {
      throw new Error(
        `"${file.name}" is ${Math.round(file.size / 1024 / 1024)} MB — ` +
        `Supabase Storage limits uploads to ${MAX_MB} MB per file on the free plan. ` +
        `Upgrade to the Pro plan or compress the file before uploading.`
      );
    }
  }

  const results = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const { file } = audioFiles[i];
    const meta = trackMetas[i] || {};

    // ── 1. Upload audio ──────────────────────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'audio' });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const audioKey = `${user.id}/${Date.now()}-${safeName}`;

    console.log('[Reef] Uploading audio:', audioKey, Math.round(file.size / 1024 / 1024) + ' MB');

    const audioUpload = supabase.storage
      .from('audio')
      .upload(audioKey, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    const { error: audioErr } = await withTimeout(audioUpload, 4 * 60 * 1000, 'Audio upload');

    if (audioErr) {
      console.error('[Reef] Audio upload error:', audioErr);
      const hint = audioErr.message?.toLowerCase().includes('security')
        ? ' (Storage policies may not be applied — run the storage SQL in Supabase.)'
        : '';
      throw new Error(`Audio upload failed: ${audioErr.message}${hint}`);
    }

    // ── 2. Upload artwork ────────────────────────────────────
    let artworkKey = null;
    if (meta.artwork) {
      onProgress?.({ track: i, total: audioFiles.length, phase: 'artwork' });
      const ext = (meta.artwork.name?.split('.').pop() || 'jpg').toLowerCase();
      artworkKey = `${user.id}/${Date.now()}-artwork.${ext}`;

      const artUpload = supabase.storage
        .from('artwork')
        .upload(artworkKey, meta.artwork, {
          contentType: meta.artwork.type || 'image/jpeg',
          upsert: false,
        });

      const { error: artErr } = await withTimeout(artUpload, 60_000, 'Artwork upload');
      if (artErr) {
        console.error('[Reef] Artwork upload error:', artErr);
        throw new Error(`Artwork upload failed: ${artErr.message}`);
      }
    }

    // ── 3. Save metadata to tracks table ────────────────────
    onProgress?.({ track: i, total: audioFiles.length, phase: 'saving' });

    const { data: track, error: dbErr } = await withTimeout(
      supabase
        .from('tracks')
        .insert({
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
        })
        .select()
        .single(),
      30_000,
      'Metadata save'
    );

    if (dbErr) {
      console.error('[Reef] DB insert error:', dbErr);
      throw new Error(`Metadata save failed: ${dbErr.message}`);
    }

    // ── 4. Save per-track credits ────────────────────────────
    if (meta.credits?.length && track?.id) {
      const rows = meta.credits
        .filter(c => c.name?.trim())
        .map(c => ({ track_id: track.id, role: c.role?.trim() || null, name: c.name.trim() }));
      if (rows.length) {
        const { error: credErr } = await supabase.from('track_credits').insert(rows);
        if (credErr) console.warn('[Reef] Credits insert error (non-fatal):', credErr);
      }
    }

    results.push(track);
  }

  return results;
}

/**
 * Fetches a signed URL for a private audio or artwork file.
 * URL expires in 1 hour.
 */
export async function getSignedUrl(bucket, key, expiresIn = 3600) {
  if (!key) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Fetches the authenticated creator's tracks from the DB,
 * enriched with a short-lived signed artwork URL.
 */
export async function fetchMyTracks() {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const enriched = await Promise.all(
    (data || []).map(async t => {
      const artworkUrl = t.artwork_key
        ? await getSignedUrl('artwork', t.artwork_key, 43200)
        : null;
      return { ...t, artworkUrl };
    })
  );
  return enriched;
}
