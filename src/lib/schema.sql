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

-- Profiles: each user owns their own row
CREATE POLICY "users_own_profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);

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
