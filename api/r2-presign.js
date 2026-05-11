// api/r2-presign.js — Vercel serverless function
// Generates a presigned PUT URL so the browser can upload directly to R2
// R2 credentials stay server-side; never exposed to the client

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_ORIGINS = ['https://ree.fm', 'https://www.ree.fm'];
const MAX_SIZE_BYTES  = 5 * 1024 * 1024 * 1024; // 5 GB — R2 limit

export default async function handler(req, res) {
  // CORS preflight
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { filename, contentType, fileSize, userId } = req.body ?? {};

  if (!filename || !contentType || !userId) {
    return res.status(400).json({ error: 'Missing: filename, contentType, userId' });
  }

  if (fileSize && fileSize > MAX_SIZE_BYTES) {
    return res.status(413).json({ error: 'File exceeds 5 GB limit' });
  }

  // Normalise content type for browsers that report empty type for AIFF
  const mime = contentType || guessMime(filename);

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key      = `${userId}/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET_NAME,
    Key:         key,
    ContentType: mime,
  });

  try {
    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    const publicUrl    = `${process.env.VITE_R2_PUBLIC_URL || 'https://audio.ree.fm'}/${key}`;
    return res.status(200).json({ presignedUrl, key, publicUrl });
  } catch (err) {
    console.error('[r2-presign] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function guessMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    wav:  'audio/wav',
    aif:  'audio/aiff',
    aiff: 'audio/aiff',
    mp3:  'audio/mpeg',
    flac: 'audio/flac',
    m4a:  'audio/mp4',
    ogg:  'audio/ogg',
  };
  return map[ext] || 'application/octet-stream';
}
