CREATE TABLE published_works (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL UNIQUE,
  audio_object_key TEXT NOT NULL UNIQUE,
  audio_content_type TEXT NOT NULL,
  audio_size INTEGER NOT NULL CHECK(audio_size > 0),
  audio_sha256 TEXT NOT NULL CHECK(length(audio_sha256) = 64),
  owner_discord_user_id TEXT,
  ownership_status TEXT NOT NULL DEFAULT 'pending_legacy_reconciliation' CHECK(ownership_status = 'pending_legacy_reconciliation'),
  published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
  source_manifest_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX published_works_gallery ON published_works(published,display_order);
