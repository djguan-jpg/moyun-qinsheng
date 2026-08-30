-- Forward-only support for converting anonymous legacy works to owned registrations.
ALTER TABLE registrations ADD COLUMN display_order INTEGER;
ALTER TABLE registrations ADD COLUMN preserve_audio_object INTEGER NOT NULL DEFAULT 0 CHECK(preserve_audio_object IN (0,1));
CREATE UNIQUE INDEX registrations_display_order_active
  ON registrations(display_order) WHERE published=1 AND is_test=0;
CREATE INDEX registrations_gallery_order
  ON registrations(published,is_test,audio_state,display_order,public_id);
CREATE TABLE legacy_import_runs (
  import_id TEXT PRIMARY KEY,
  source_sha256 TEXT NOT NULL UNIQUE,
  expected_state_sha256 TEXT NOT NULL,
  registration_count INTEGER NOT NULL CHECK(registration_count = 20),
  reused_object_count INTEGER NOT NULL CHECK(reused_object_count = 14),
  new_object_count INTEGER NOT NULL CHECK(new_object_count = 6),
  state TEXT NOT NULL CHECK(state IN ('prepared','applied','rolled_back')),
  applied_at TEXT,
  rolled_back_at TEXT
);
