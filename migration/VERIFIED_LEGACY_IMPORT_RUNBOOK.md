# Verified legacy import runbook

This runbook is inert until an authorized operator supplies an offline verified backup and explicit production confirmations. Never place its private SQL or rollback ledger in this repository.

1. Freeze writes. Export D1 with `wrangler d1 export <exact-name> --remote --output <private-path>` and make a versioned R2 inventory/backup. Record hashes and confirm the exact account, D1 ID/name, R2 bucket and deployed Worker version. Abort unless the supplied state is exactly the reviewed 14-work manifest.
2. Run the importer in `dry-run`, then `reconcile`. Both modes are read-only and must report 20 registrations, 14 reused objects and 6 new objects. Review the non-sensitive plan hash.
3. Use `prepare` only with `--production` and all four exact confirmation flags. Keep `--private-output` outside the checkout. Review the generated private SQL and rollback ledger on the restricted operator host.
4. Upload only the ledger's six new objects to their random private keys, with content type and SHA-256 metadata. Read each back and verify size/hash. Never overwrite or delete the 14 existing objects.
5. Apply migration `0005` first. With the reviewed Wrangler 4.127.1 version installed locally, execute the generated import as an argument vector (never a shell-joined string): `npx wrangler d1 execute <exact-name> --remote --file=<private-path>/import.sql`. The file intentionally contains no explicit transaction-control statements. In Wrangler 4.127.1, `--file` uses D1's dedicated `/import` ingestion API (`init`, upload, `ingest`, then `poll`), not the ordinary `/query` path and not `D1Database.batch()`. Wrangler states that an incomplete ingestion returns the database to its original state; this procedure additionally requires a disposable remote mid-file failure proof for the pinned version. Abort on any nonzero exit; do not retry until step 6 reconciliation proves whether the plan is already complete.
6. Reconcile 20 unique owners/public IDs/orders, 20 active owned registrations, zero active anonymous duplicates, 14 reused plus 6 new objects, no orphans, private-field absence, same-origin capabilities, Range/HEAD/ETag, and protected-route fail-closed behavior.
7. Deploy only after separate approval. Acceptance requires Worker-first headers on `/`, `/works`, `/register`, `/vote`, and `/admin`, plus the full security suite.
8. Roll back by restoring the verified D1 export and prior Worker version. Delete only the six keys listed in the private ledger after confirming they were created by this run. Never delete the original 14 objects or the legacy backup.

Provider references reviewed for this procedure:

- D1 import/export and the explicit requirement to remove `BEGIN TRANSACTION`/`COMMIT`: https://developers.cloudflare.com/d1/best-practices/import-export-data/
- Wrangler 4.127.1 source tag (commit `1224e45d9f36f8fd1e67441288b04bb79f97dedc`), including the dedicated `/import` ingestion path: https://github.com/cloudflare/workers-sdk/tree/wrangler%404.127.1/packages/wrangler/src/d1
- Wrangler `d1 execute`, migrations, and Time Travel commands: https://developers.cloudflare.com/d1/wrangler-commands/
- Migration ordering/ledger behavior: https://developers.cloudflare.com/d1/reference/migrations/
- Time Travel availability, bookmarks, retention, and destructive restore behavior: https://developers.cloudflare.com/d1/reference/time-travel/
