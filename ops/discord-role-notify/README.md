# 古韻新生：將身分組入口改為通知 Kris

Scope: update the existing 大幫手 announcement, not the registration website.

- Guild: `977834861761015808`
- Channel: `1404736020834156584`
- Existing announcement: `1542161616999555183`
- Sole notification recipient: `320407142765166602` (Kris / kris5205), verified against the existing `ROLE_REQUEST_ADMIN_IDS` setting and Discord member record.
- Music creator role: `980054891600969748`; **never granted automatically**.
- Persistent button ID: `guyun:request-music-role:kris:v1`.

`discord_bot.py` is a snapshot of the live bot with only an import and a call in `setup_hook` added. Do not copy it over a newer bot version without reviewing the diff. `guyun_role_notify.py` owns the new persistent view. Existing commands and schedulers are unchanged.

The handler verifies the exact guild, channel and message, fetches current member roles, and sends one DM to Kris with the requester's name, username and ID. A separate SQLite database at `/data/guyun-role-requests.sqlite3` atomically reserves requests and preserves the one-hour cooldown across restarts. Already-role members generate no DM; failed or uncertain delivery never returns a success message. Replies to applicants are ephemeral.

## Verification

- Deployed and verified on 2026-08-26: container healthy, Gateway reconnected, persistent handler registered for the exact message and recipient. Both deployed source hashes match this directory. A single labelled test DM was delivered and fetched back successfully (`1542164928679378975`). The existing announcement PATCH was verified with all three expected buttons; the original listening and registration links are unchanged. Real member button interaction was not impersonated.
- `test_guyun_role_notify.py`: 12 tests run inside an isolated temporary directory in the existing bot container, using its installed discord.py. All Discord calls are mocked; no real applicants are impersonated.
- `test_update_button.py`: five local pure-payload tests for correct message scope, preserving the first two links and original content, and idempotent edits.
- `scripts/update-guyun-role-button.py` defaults to a read-only preview. `--test-dm` sends one explicitly labelled functional test to Kris, guarded by a persistent receipt. `--apply` patches only the original announcement and verifies the resulting button, text and unchanged links.
- Run the update script in the bot container with `PYTHONPATH=/app`. Credentials remain in the container environment and must never be copied into this directory.

## Remote deployment and recovery

`deploy.sh` checks the original bot/config hashes, backs up the bot source under `/home/ubuntu/ai-song-contest/.backup-role-notify-20260826`, and rebuilds only Compose service `app`. It deliberately refuses a second run after the source changes. It does not change Caddy, tunnel, website, environment configuration or contest data.

The original announcement is backed up to `/data/guyun-promotion-before-role-notify-20260826.json` before the PATCH. For recovery, first compare current source/message against this deployment, then restore only the two-button-plus-role-link announcement payload from the backup and the original `discord_bot.py`, and rebuild only `app`. Retain the standalone notification module, request database and receipts for audit; none needs deletion. A rollback must not overwrite subsequent unrelated edits.
