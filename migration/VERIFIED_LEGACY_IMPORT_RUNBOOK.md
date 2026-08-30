# Verified legacy import runbook

This runbook is inert until an authorized operator supplies an offline verified backup and explicit production confirmations. Never place its private SQL or rollback ledger in this repository.

1. Freeze writes. Export D1 with `wrangler d1 export <exact-name> --remote --output <private-path>` and make a versioned R2 inventory/backup. Record hashes and confirm the exact account, D1 ID/name, R2 bucket and deployed Worker version. Abort unless the supplied state is exactly the reviewed 14-work manifest.
2. Run the importer in `dry-run`, then `reconcile`. Both modes are read-only and must report 20 registrations, 14 reused objects and 6 new objects. Review the non-sensitive plan hash.
3. Use `prepare` only with `--production` and all four exact confirmation flags. Keep `--private-output` outside the checkout. Review the generated private SQL and rollback ledger on the restricted operator host.
4. Upload only the ledger's six new objects to their random private keys, with content type and SHA-256 metadata. Read each back and verify size/hash. Never overwrite or delete the 14 existing objects.
5. Apply migration `0005` first. Execute the generated import using the supported D1 file import flow. The single transaction creates owned registrations before conditionally deactivating matching anonymous rows.
6. Reconcile 20 unique owners/public IDs/orders, 20 active owned registrations, zero active anonymous duplicates, 14 reused plus 6 new objects, no orphans, private-field absence, same-origin capabilities, Range/HEAD/ETag, and protected-route fail-closed behavior.
7. Deploy only after separate approval. Acceptance requires Worker-first headers on `/`, `/works`, `/register`, `/vote`, and `/admin`, plus the full security suite.
8. Roll back by restoring the verified D1 export and prior Worker version. Delete only the six keys listed in the private ledger after confirming they were created by this run. Never delete the original 14 objects or the legacy backup.
