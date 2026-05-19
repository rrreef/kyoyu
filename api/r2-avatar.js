// api/r2-avatar.js — Vercel serverless function
// Generates a presigned PUT URL so the browser can upload an avatar
// directly to R2 at a stable path (avatars/{userId}/avatar.jpg)

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
const MAX_SIZE_BYTES  = 10 * 1024 * 1024; // 10 MB — more than enough for a JPEG avatar

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, fileSize } = req.body ?? {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  if (fileSize && fileSize > MAX_SIZE_BYTES) {
    return res.status(413).json({ error: 'File exceeds 10 MB limit' });
  }

  // Stable key — always replaces the same file for this user
  const key = `avatars/${userId}/avatar.jpg`;

  const command = new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET_NAME,
    Key:         key,
    ContentType: 'image/jpeg',
  });

  try {
    // URL valid for 1 hour — plenty of time for the upload
    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    const publicUrl    = `${process.env.VITE_R2_PUBLIC_URL || 'https://audio.ree.fm'}/${key}`;
    return res.status(200).json({ presignedUrl, publicUrl, key });
  } catch (err) {
    console.error('[r2-avatar] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
