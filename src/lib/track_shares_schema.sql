-- ============================================================
-- Track Sharing — run in Supabase SQL Editor
-- ============================================================

-- 1. Shared tracks table
CREATE TABLE IF NOT EXISTS public.track_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id     UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  shared_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(track_id, shared_with)
);

ALTER TABLE public.track_shares ENABLE ROW LEVEL SECURITY;

-- Sharer can manage their shares
CREATE POLICY "own_shares_rw" ON public.track_shares FOR ALL
  USING (shared_by = auth.uid());

-- Recipient can see shares addressed to them
CREATE POLICY "received_shares_r" ON public.track_shares FOR SELECT
  USING (shared_with = auth.uid());

-- Shared tracks are visible to recipients
CREATE POLICY "shared_tracks_readable" ON public.tracks FOR SELECT
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.track_shares
      WHERE track_id = tracks.id AND shared_with = auth.uid()
    )
  );

-- 2. Allow any authenticated user to upload private tracks
--    (not just creator-role accounts)
DROP POLICY IF EXISTS "creator_own_tracks" ON public.tracks;
CREATE POLICY "owner_own_tracks" ON public.tracks FOR ALL
  USING (auth.uid() = creator_id);

-- 3. Supabase Storage: allow any authenticated user to upload audio/artwork
INSERT INTO storage.buckets (id, name, public) VALUES ('audio',   'audio',   false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('artwork', 'artwork', true)  ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "auth_upload_audio"   ON storage.objects;
DROP POLICY IF EXISTS "auth_read_audio"     ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_artwork" ON storage.objects;
DROP POLICY IF EXISTS "auth_read_artwork"   ON storage.objects;

CREATE POLICY "auth_upload_audio"   ON storage.objects FOR INSERT WITH CHECK (bucket_id='audio'   AND auth.role()='authenticated');
CREATE POLICY "auth_read_audio"     ON storage.objects FOR SELECT USING  (bucket_id='audio'   AND auth.role()='authenticated');
CREATE POLICY "auth_upload_artwork" ON storage.objects FOR INSERT WITH CHECK (bucket_id='artwork' AND auth.role()='authenticated');
CREATE POLICY "auth_read_artwork"   ON storage.objects FOR SELECT USING  (bucket_id='artwork');
