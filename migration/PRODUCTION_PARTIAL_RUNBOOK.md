# Production-partial preparation (never run during review)

This procedure is intentionally inert documentation. It applies only to the 14 entries in `production-partial-manifest.json`, defaults to planning, and must not be used for the six missing or two locally bundled/non-public files.

## Mandatory stop gates

An operator must supply exact, owner-confirmed Worker, D1 database, and R2 bucket names and IDs. Refuse aliases, placeholders, pre-existing generic `zoeg-*` resources, ambiguous ownership, or any D1/R2 whose emptiness is not proven immediately before the operation. The apply invocation must include the literal flag `--confirm-production-partial=guyun-old-public-14-2026-08-30`; absence or mismatch means dry-run only.

Before mutation, record: `wrangler d1 export <EXACT_DB_NAME> --remote --output <timestamp>-empty.sql`, its SHA-256 and evidence that all application-table counts are zero; `wrangler r2 object list <EXACT_BUCKET_NAME>` output proving zero objects; resource IDs/names, account, operator, UTC time and ownership approval. Abort if either resource is nonempty or the export/list cannot be completed unambiguously.

## Ordered procedure

1. Run `python tools/prepare_partial_seed.py --media-root media/submissions` (dry-run default). It must report exactly 14 verified files and no mismatch. Never copy audio into `dist`.
2. Create/confirm resources outside this review only after ownership approval. Capture the empty D1 export and empty R2 list baselines above before any migration/upload.
3. Apply all migrations in filename order to the exact database. Verify `PRAGMA foreign_key_check` is empty and `published_works` is empty.
4. Re-run the verifier with exact resource names plus the literal confirmation flag. Upload each verified byte stream to `published/guyun-old-public-14-2026-08-30/<filename>` using binding/CLI private-bucket access, `Content-Type: audio/mpeg`, and custom metadata containing the manifest SHA-256 and manifest ID. Do not enable an R2 public domain.
5. Insert one `published_works` row per manifest entry in a transaction/batch, preserving the recorded `displayOrder`; set `audio_object_key` to the key above. Never create `users` or `registrations` rows for these anonymous works.
6. Reconcile exactly: D1 published rows=14; R2 objects=14; total bytes=94,068,290; every size/SHA-256 matches; display-order sequence equals the manifest; zero D1-to-R2 and R2-to-D1 orphans; public JSON contains only `publicId` and capability `listenUrl`; Range/HEAD/ETag checks pass.
7. Record the manifest file SHA-256, empty baselines, migration output, upload receipts, inserted-row batch, final counts/hashes/orphan queries and operator approval. Any mismatch is a hard stop; do not delete or overwrite to “repair” production automatically.

Rollback is not automatic. Preserve evidence and stop traffic/change work; an authorized operator decides whether newly created, uniquely owned resources may be discarded.
