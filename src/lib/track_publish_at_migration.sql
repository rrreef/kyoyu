-- ============================================================
-- Migration: add publish_at column to tracks table
-- Run once in Supabase SQL Editor, then uncomment publish_at
-- in uploadPipeline.js and Releases.jsx saveEdit()
-- ============================================================

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ DEFAULT NULL;

-- Optional: index for efficient scheduling queries
CREATE INDEX IF NOT EXISTS tracks_publish_at_idx ON public.tracks (publish_at)
  WHERE publish_at IS NOT NULL;
