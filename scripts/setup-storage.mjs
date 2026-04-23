// scripts/setup-storage.mjs
// Run once: node scripts/setup-storage.mjs
// Creates Supabase Storage buckets with large file limits and private access

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mbcwqglsovpvdrycenzx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY3dxZ2xzb3ZwdmRyeWNlbnp4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE3NTI4MSwiZXhwIjoyMDkxNzUxMjgxfQ.s7AAAkP70EDb4vLa7g8nwV-vxyDI2EtxScYk1sEtTdM',
  { auth: { persistSession: false } }
);

async function setup() {
  console.log('Setting up Supabase Storage buckets...\n');

  // Audio bucket — no size limit via API (configure via Supabase dashboard if needed)
  const { error: e1 } = await supabase.storage.createBucket('audio', {
    public: false,
    allowedMimeTypes: ['audio/wav','audio/x-wav','audio/aiff','audio/x-aiff','audio/mpeg','audio/flac','audio/x-flac','application/octet-stream'],
  });
  console.log('audio bucket:', e1 ? `⚠️  ${e1.message}` : '✓ created');

  // Artwork bucket — 50 MB max per file
  const { error: e2 } = await supabase.storage.createBucket('artwork', {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg','image/png','image/webp','image/tiff'],
  });
  console.log('artwork bucket:', e2 ? `⚠️  ${e2.message}` : '✓ created');

  console.log('\nDone. Run the storage policies SQL in Supabase next.');
}

setup().catch(console.error);
