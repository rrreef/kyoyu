-- ============================================================
-- KYOYU Admin Schema additions
-- Run once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Allow 'admin' role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('creator', 'listener', 'admin'));

-- 2. Banned column (soft-block a user)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;

-- 3. Helper function — is the calling user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND role = 'admin'
) $$;

-- 4. Admin bypass policies (admins can read/write everything)
DROP POLICY IF EXISTS "admin_all_profiles"    ON public.profiles;
DROP POLICY IF EXISTS "admin_all_tracks"      ON public.tracks;
DROP POLICY IF EXISTS "admin_all_credits"     ON public.track_credits;
DROP POLICY IF EXISTS "admin_all_stats"       ON public.track_stats;

CREATE POLICY "admin_all_profiles"
  ON public.profiles FOR ALL
  USING (public.is_admin());

CREATE POLICY "admin_all_tracks"
  ON public.tracks FOR ALL
  USING (public.is_admin());

CREATE POLICY "admin_all_credits"
  ON public.track_credits FOR ALL
  USING (public.is_admin());

CREATE POLICY "admin_all_stats"
  ON public.track_stats FOR ALL
  USING (public.is_admin());

-- 5. Prevent banned users from logging in via RLS
--    (banned = true => their own-profile policy blocks them)
DROP POLICY IF EXISTS "banned_block" ON public.profiles;
CREATE POLICY "banned_block"
  ON public.profiles FOR SELECT
  USING (NOT banned OR public.is_admin());

-- ============================================================
-- HOW TO MAKE YOURSELF ADMIN:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
-- ============================================================
