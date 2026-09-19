-- ============================================================
-- REEF — Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Profiles (extends auth.users) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT,
  role         TEXT NOT NULL DEFAULT 'listener' CHECK (role IN ('creator', 'listener')),
  artist_name  TEXT,
  display_name TEXT,
  avatar_url   TEXT,   -- public Supabase Storage URL for profile picture
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tracks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  artist       TEXT,
  album        TEXT,
  genre        TEXT,
  year         INT,
  duration     TEXT,
  format       TEXT,
  tags         TEXT[],
  visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  status       TEXT NOT NULL DEFAULT 'pending'  CHECK (status   IN ('pending', 'live', 'rejected')),
  storage_key  TEXT,   -- R2 audio file key (never sent to frontend)
  artwork_key  TEXT,   -- R2 artwork key   (never sent to frontend)
  artwork_url  TEXT,   -- presigned or CDN url (short-lived)
  is_featured    BOOLEAN DEFAULT false,
  featured_order INTEGER DEFAULT 0,
  featured_type  TEXT DEFAULT 'release',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- ── Track Credits ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.track_credits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id   UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  role       TEXT,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Track Stats (daily aggregates) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.track_stats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id   UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  streams    INT  NOT NULL DEFAULT 0,
  downloads  INT  NOT NULL DEFAULT 0,
  revenue    NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (track_id, date)
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_stats   ENABLE ROW LEVEL SECURITY;

-- Profiles: each user can update their own row; all profiles readable for comment joins
CREATE POLICY "users_own_profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);

CREATE POLICY "profiles_public_read"
  ON public.profiles FOR SELECT
  USING (true);

-- Tracks: creators manage their own; listeners see public+live only
CREATE POLICY "creator_own_tracks"
  ON public.tracks FOR ALL
  USING (auth.uid() = creator_id);

CREATE POLICY "listeners_see_public"
  ON public.tracks FOR SELECT
  USING (visibility = 'public' AND status = 'live');

-- Credits: readable by anyone for public tracks; writeable only by track owner
CREATE POLICY "creator_manage_credits"
  ON public.track_credits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks
      WHERE tracks.id = track_credits.track_id
        AND tracks.creator_id = auth.uid()
    )
  );

CREATE POLICY "credits_public_readable"
  ON public.track_credits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks
      WHERE tracks.id = track_credits.track_id
        AND tracks.visibility = 'public'
        AND tracks.status = 'live'
    )
  );

-- Stats: only the track owner can read
CREATE POLICY "creator_see_stats"
  ON public.track_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks
      WHERE tracks.id = track_stats.track_id
        AND tracks.creator_id = auth.uid()
    )
  );

-- ============================================================
-- Trigger: auto-create profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, artist_name, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'listener'),
    NEW.raw_user_meta_data->>'artist_name',
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Comments ────────────────────────────────────────────────
-- Track comments — any authenticated user can comment on any track.
-- track_id is TEXT to support external provider IDs (yt-xxx, sc-xxx, bc-xxx).
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  parent_id   UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_track ON public.comments(track_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON public.comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);

-- RLS: anyone can read, authenticated users can insert/delete their own
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY comments_select ON public.comments FOR SELECT USING (true);
CREATE POLICY comments_insert ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY comments_delete ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- Comment likes — one like per user per comment
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes(comment_id);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY comment_likes_select ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY comment_likes_insert ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY comment_likes_delete ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);

-- ── Track Info Cache ────────────────────────────────────────
-- Caches aggregated track/album/artist info from Discogs + MusicBrainz.
-- Refreshed every 30 days by the /api/track-info endpoint.
CREATE TABLE IF NOT EXISTS public.track_info_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key  TEXT NOT NULL UNIQUE,
  title       TEXT,
  artist      TEXT,
  album       TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_track_info_lookup ON public.track_info_cache(lookup_key);

ALTER TABLE public.track_info_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY track_info_cache_select ON public.track_info_cache FOR SELECT USING (true);
CREATE POLICY track_info_cache_insert ON public.track_info_cache FOR INSERT WITH CHECK (true);
CREATE POLICY track_info_cache_update ON public.track_info_cache FOR UPDATE USING (true);

-- ── Info Reports ────────────────────────────────────────────
-- Users can report mistakes in the info section for admin review.
CREATE TABLE IF NOT EXISTS public.info_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key  TEXT NOT NULL,
  track_id    TEXT NOT NULL,
  title       TEXT,
  artist      TEXT,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.info_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY info_reports_select ON public.info_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY info_reports_insert ON public.info_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
