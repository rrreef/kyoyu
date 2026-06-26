#!/usr/bin/env node
/**
 * backfill-streaming.js
 * 
 * One-time script to:
 * 1. Download all AIFF/WAV tracks from R2
 * 2. Transcode to AAC 256k (.m4a) for streaming
 * 3. Upload the streaming copy to R2 at streaming/{original_key}.m4a
 * 4. Extract duration and update the tracks table in Supabase
 * 
 * Usage: node scripts/backfill-streaming.js
 * Requires: ffmpeg in PATH or adjacent to this script
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream, createReadStream, mkdirSync, existsSync, unlinkSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────
const R2_ENDPOINT       = 'https://8f34c903530a40127527cdc2e2742a04.r2.cloudflarestorage.com';
const R2_ACCESS_KEY_ID  = 'd4443c922ad6378e595997edfa8c81d6';
const R2_SECRET_KEY     = '222e306c0e87c69515be98a870507aeb8e289e62bff90bd46100513f7aa5b614';
const R2_BUCKET         = 'reef';
const R2_PUBLIC_URL     = 'https://audio.ree.fm';

const SUPABASE_URL      = 'https://mbcwqglsovpvdrycenzx.supabase.co';
const SUPABASE_ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY3dxZ2xzb3ZwdmRyeWNlbnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzUyODEsImV4cCI6MjA5MTc1MTI4MX0.idAoi6w3zL9jxI9ojcOH6uSrsNR_TGYabbU1xvwZLgk';
const SUPABASE_SERVICE  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY3dxZ2xzb3ZwdmRyeWNlbnp4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE3NTI4MSwiZXhwIjoyMDkxNzUxMjgxfQ.s7AAAkP70EDb4vLa7g8nwV-vxyDI2EtxScYk1sEtTdM';

const FFMPEG = existsSync(join(__dirname, '..', 'ffmpeg')) 
  ? join(__dirname, '..', 'ffmpeg')
  : 'ffmpeg';

const TMP_DIR = join(__dirname, '..', '.tmp-transcode');
mkdirSync(TMP_DIR, { recursive: true });

// ── R2 Client ───────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_KEY },
});

// ── Helpers ─────────────────────────────────────────────────────────

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_SERVICE,
      'Authorization': `Bearer ${SUPABASE_SERVICE}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} — ${err}`);
  }
  const text = await res.text();
  if (!text) return null; // 204 No Content from PATCH with return=minimal
  try { return JSON.parse(text); } catch { return text; }
}

function getStreamingKey(originalKey) {
  // streaming/userId/timestamp-filename.m4a
  const base = originalKey.replace(/\.[^.]+$/, '');
  return `streaming/${base}.m4a`;
}

async function downloadFromR2(key, destPath) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  const resp = await r2.send(cmd);
  await pipeline(resp.Body, createWriteStream(destPath));
}

async function uploadToR2(key, filePath, contentType) {
  const body = createReadStream(filePath);
  const size = statSync(filePath).size;
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await r2.send(cmd);
  return size;
}

function transcodeToAAC(inputPath, outputPath) {
  // AAC 256k in M4A container — universal browser support, high quality
  // -vn strips embedded artwork/video streams that cause M4A muxing to fail
  const cmd = `"${FFMPEG}" -y -i "${inputPath}" -vn -c:a aac -b:a 256k -movflags +faststart "${outputPath}" 2>&1`;
  try {
    const output = execSync(cmd, { timeout: 300_000 }).toString(); // 5 min timeout
    return true;
  } catch (e) {
    console.error('  ❌ FFmpeg failed:', e.stderr?.toString()?.split('\n').slice(-3).join('\n') || e.message);
    return false;
  }
}

function getDuration(filePath) {
  // Use ffprobe to get duration in seconds
  const ffprobe = FFMPEG.replace('ffmpeg', 'ffprobe');
  const probeBin = existsSync(ffprobe) ? ffprobe : 'ffprobe';
  try {
    const output = execSync(
      `"${probeBin}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}" 2>/dev/null || "${FFMPEG}" -i "${filePath}" 2>&1 | grep Duration`,
      { timeout: 30_000 }
    ).toString().trim();
    
    // Parse duration
    if (output.match(/^\d+(\.\d+)?$/)) {
      return parseFloat(output);
    }
    // Parse "Duration: HH:MM:SS.xx" from ffmpeg output
    const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
    }
  } catch (e) {}
  return 0;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('🎵 KYOYU Backfill: Transcode AIFF/WAV → AAC 256k');
  console.log('━'.repeat(60));

  // 1. Get all tracks from Supabase that need transcoding
  const tracks = await supabaseQuery(
    'tracks?select=id,title,artist,storage_key,duration,format&order=created_at.desc&limit=500'
  );

  console.log(`\n📋 Found ${tracks.length} tracks in database\n`);

  const needsTranscode = tracks.filter(t => {
    const fmt = (t.format || '').toUpperCase();
    return t.storage_key && (fmt === 'AIFF' || fmt === 'WAV' || fmt === 'AIF');
  });

  const needsDuration = tracks.filter(t => !t.duration);

  console.log(`  🔄 Need transcoding: ${needsTranscode.length}`);
  console.log(`  ⏱  Need duration:    ${needsDuration.length}`);
  console.log();

  let success = 0, failed = 0;

  for (let i = 0; i < needsTranscode.length; i++) {
    const track = needsTranscode[i];
    const num = `[${i + 1}/${needsTranscode.length}]`;
    console.log(`${num} ${track.title} — ${track.artist || 'Unknown'}`);
    console.log(`     Format: ${track.format} | Key: ${track.storage_key}`);

    const inputPath  = join(TMP_DIR, `input_${i}.${(track.format || 'aiff').toLowerCase()}`);
    const outputPath = join(TMP_DIR, `output_${i}.m4a`);
    const streamKey  = getStreamingKey(track.storage_key);

    try {
      // Check if streaming copy already exists (from previous run)
      const cdnCheck = await fetch(`https://audio.ree.fm/${streamKey}`, { method: 'HEAD' }).catch(() => null);
      if (cdnCheck?.ok && track.duration) {
        console.log('     ⏭  Already transcoded + has duration, skipping');
        success++;
        continue;
      }
      const alreadyUploaded = cdnCheck?.ok;

      // Download
      console.log('     ⬇️  Downloading from R2...');
      await downloadFromR2(track.storage_key, inputPath);
      const inputSize = statSync(inputPath).size;
      console.log(`     📦 Downloaded: ${(inputSize / 1024 / 1024).toFixed(1)} MB`);

      // Get duration from original
      const durationSecs = getDuration(inputPath);
      const durationStr  = durationSecs > 0 ? formatDuration(durationSecs) : null;
      console.log(`     ⏱  Duration: ${durationStr || 'unknown'} (${durationSecs.toFixed(1)}s)`);

      if (!alreadyUploaded) {
        // Transcode
        console.log('     🔄 Transcoding to AAC 256k...');
        const ok = transcodeToAAC(inputPath, outputPath);
        if (!ok) {
          console.log('     ❌ Transcode failed, skipping');
          failed++;
          continue;
        }
        const outputSize = statSync(outputPath).size;
        const ratio = ((1 - outputSize / inputSize) * 100).toFixed(0);
        console.log(`     ✅ Transcoded: ${(outputSize / 1024 / 1024).toFixed(1)} MB (${ratio}% smaller)`);

        // Upload streaming copy
        console.log(`     ⬆️  Uploading streaming copy: ${streamKey}`);
        await uploadToR2(streamKey, outputPath, 'audio/mp4');
        console.log(`     ✅ Uploaded to R2`);
      } else {
        console.log('     ⏭  Streaming copy already in R2, just updating duration');
      }

      // Update database — only duration (streaming_key column doesn't exist yet)
      const updates = {};
      if (durationStr) updates.duration = durationStr;

      if (Object.keys(updates).length > 0) {
        await supabaseQuery(`tracks?id=eq.${track.id}`, {
          method: 'PATCH',
          body: updates,
          prefer: 'return=minimal',
        });
      }
      console.log(`     ✅ Database updated (duration: ${durationStr})\n`);
      success++;

    } catch (e) {
      console.error(`     ❌ Error: ${e.message}\n`);
      failed++;
    } finally {
      // Cleanup temp files
      try { unlinkSync(inputPath); } catch {}
      try { unlinkSync(outputPath); } catch {}
    }
  }

  // Handle tracks that only need duration (already MP3/small format)
  const onlyDuration = needsDuration.filter(
    t => !needsTranscode.find(nt => nt.id === t.id) && t.storage_key
  );

  if (onlyDuration.length > 0) {
    console.log(`\n⏱  Fetching duration for ${onlyDuration.length} additional tracks...\n`);
    for (const track of onlyDuration) {
      try {
        const inputPath = join(TMP_DIR, `dur_${track.id}.${(track.format || 'mp3').toLowerCase()}`);
        await downloadFromR2(track.storage_key, inputPath);
        const durationSecs = getDuration(inputPath);
        if (durationSecs > 0) {
          const durationStr = formatDuration(durationSecs);
          await supabaseQuery(`tracks?id=eq.${track.id}`, {
            method: 'PATCH',
            body: { duration: durationStr },
            prefer: 'return=minimal',
          });
          console.log(`  ✅ ${track.title}: ${durationStr}`);
        }
        try { unlinkSync(inputPath); } catch {}
      } catch (e) {
        console.error(`  ❌ ${track.title}: ${e.message}`);
      }
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log(`🎵 Backfill complete: ${success} transcoded, ${failed} failed`);
  console.log('━'.repeat(60));

  // Cleanup
  try { unlinkSync(TMP_DIR); } catch {}
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
