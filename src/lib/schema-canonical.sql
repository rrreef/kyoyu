-- Enable trigram for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Canonical Artists
CREATE TABLE IF NOT EXISTS canonical_artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  real_name TEXT,
  profile_text TEXT,
  native_available BOOLEAN DEFAULT false,
  discogs_id BIGINT UNIQUE,
  metadata_confidence FLOAT DEFAULT 0.5,
  merge_status TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artists_slug ON canonical_artists(slug);
CREATE INDEX IF NOT EXISTS idx_artists_discogs ON canonical_artists(discogs_id);
CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON canonical_artists USING gin(name gin_trgm_ops);

-- Canonical Labels
CREATE TABLE IF NOT EXISTS canonical_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  profile_text TEXT,
  contact_info TEXT,
  native_available BOOLEAN DEFAULT false,
  discogs_id BIGINT UNIQUE,
  metadata_confidence FLOAT DEFAULT 0.5,
  merge_status TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_labels_slug ON canonical_labels(slug);
CREATE INDEX IF NOT EXISTS idx_labels_discogs ON canonical_labels(discogs_id);
CREATE INDEX IF NOT EXISTS idx_labels_name_trgm ON canonical_labels USING gin(name gin_trgm_ops);

-- Canonical Releases
CREATE TABLE IF NOT EXISTS canonical_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  artist_id UUID REFERENCES canonical_artists(id),
  label_id UUID REFERENCES canonical_labels(id),
  native_available BOOLEAN DEFAULT false,
  discogs_id BIGINT UNIQUE,
  discogs_master_id BIGINT,
  release_date TEXT,
  country TEXT,
  format TEXT,
  catalog_number TEXT,
  barcode TEXT,
  genres TEXT[],
  styles TEXT[],
  notes TEXT,
  metadata_confidence FLOAT DEFAULT 0.5,
  merge_status TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_releases_slug ON canonical_releases(slug);
CREATE INDEX IF NOT EXISTS idx_releases_discogs ON canonical_releases(discogs_id);
CREATE INDEX IF NOT EXISTS idx_releases_artist ON canonical_releases(artist_id);
CREATE INDEX IF NOT EXISTS idx_releases_label ON canonical_releases(label_id);
CREATE INDEX IF NOT EXISTS idx_releases_title_trgm ON canonical_releases USING gin(title gin_trgm_ops);

-- Canonical Tracks (tracklist entries from releases)
CREATE TABLE IF NOT EXISTS canonical_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  position TEXT,
  duration TEXT,
  release_id UUID REFERENCES canonical_releases(id) ON DELETE CASCADE,
  artist_id UUID REFERENCES canonical_artists(id),
  native_track_id UUID REFERENCES tracks(id),
  native_available BOOLEAN DEFAULT false,
  discogs_release_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ctracks_release ON canonical_tracks(release_id);
CREATE INDEX IF NOT EXISTS idx_ctracks_native ON canonical_tracks(native_track_id);
CREATE INDEX IF NOT EXISTS idx_ctracks_title_trgm ON canonical_tracks USING gin(title gin_trgm_ops);

-- External Links (Spotify, YouTube, Bandcamp, etc.)
CREATE TABLE IF NOT EXISTS external_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_extlinks_entity ON external_links(entity_type, entity_id);

-- Release Credits
CREATE TABLE IF NOT EXISTS release_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID REFERENCES canonical_releases(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  role TEXT NOT NULL,
  artist_id UUID REFERENCES canonical_artists(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credits_release ON release_credits(release_id);

-- Source Records (tracks provenance/raw data)
CREATE TABLE IF NOT EXISTS source_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  raw_data JSONB,
  UNIQUE(entity_type, source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_source_entity ON source_records(entity_type, entity_id);

-- Link existing tracks table to canonical entities
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS canonical_artist_id UUID REFERENCES canonical_artists(id);
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS canonical_release_id UUID REFERENCES canonical_releases(id);
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS canonical_label_id UUID REFERENCES canonical_labels(id);

-- RLS policies for new tables (allow public read, authenticated write)
ALTER TABLE canonical_artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read canonical_artists" ON canonical_artists FOR SELECT USING (true);
CREATE POLICY "Service write canonical_artists" ON canonical_artists FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE canonical_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read canonical_labels" ON canonical_labels FOR SELECT USING (true);
CREATE POLICY "Service write canonical_labels" ON canonical_labels FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE canonical_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read canonical_releases" ON canonical_releases FOR SELECT USING (true);
CREATE POLICY "Service write canonical_releases" ON canonical_releases FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE canonical_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read canonical_tracks" ON canonical_tracks FOR SELECT USING (true);
CREATE POLICY "Service write canonical_tracks" ON canonical_tracks FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE external_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read external_links" ON external_links FOR SELECT USING (true);
CREATE POLICY "Service write external_links" ON external_links FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE release_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read release_credits" ON release_credits FOR SELECT USING (true);
CREATE POLICY "Service write release_credits" ON release_credits FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE source_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read source_records" ON source_records FOR SELECT USING (true);
CREATE POLICY "Service write source_records" ON source_records FOR ALL USING (auth.role() = 'service_role');
