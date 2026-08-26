# 古韻新生：2026-08-27 12:00 單次開賽公告

Scope: one message, posted once, into one existing channel, mentioning one existing role. No website, bot, role, permission or contest data is changed.

- Guild: `977834861761015808`
- Channel: `1404736020834156584`
- Mentioned role: `977847655759765514` (`❇️｜AI創作者`); **never granted, only mentioned**.
- Scheduled: 2026-08-27 12:00 Asia/Taipei = `2026-08-27T04:00:00Z`, window closes 04:15Z.
- Nonce: `guyun-20260827-noon-ai`; receipt: `/data/guyun-announcement-20260827-noon.json` (in the bot container).

The message body carries only the role mention, two lines of text, and the existing 立即報名 / 公開聆聽 links. `allowed_mentions` restricts notification to that single role: no `@everyone`, no user pings.

## Files

| File | Role |
| --- | --- |
| `send.py` | The announcement. Preview by default; `--send` publishes inside the window only. |
| `lookup.py` | Read-only role/permission lookup used while choosing the recipient role. |
| `guyun-promotion-20260827-noon.service` | Oneshot unit; runs `send.py --send` in the bot container. |
| `guyun-promotion-20260827-noon.timer` | Fires once at `2026-08-27 04:00:00 UTC`, `Persistent=true`. |
| `deploy.py` | Host-side install. Stages the scripts, previews, installs and enables the timer. |
| `verify.py` | Read-only status check; safe to run before or after noon. |
| `test_dm.py` | One labelled test DM of the real layout, to Kris only. Preview by default. |
| `test_send.py` | 32 offline tests. No Discord, no network. |

`lookup.py` was renamed from `inspect.py`: the service runs `python /data/…/send.py`, which puts this directory first on `sys.path`, so a module named `inspect` shadows the standard library and fires its Discord calls on import.

## Safety properties

Exit codes drive systemd: **75** = retryable (before the window, transient transport or storage error), **78** = terminal, and `RestartPreventExitStatus=78` stops the retry loop. `Restart=on-failure` with `RestartSec=60` retries within the 15-minute window; `Type=oneshot` accepts `on-failure` (systemd rejects only `always` and `on-success`).

Nothing is posted unless all of these hold: the clock is inside the window both before *and* after preflight; the guild, channel type and bot identity match; the role still exists under the exact expected name; the bot effectively holds view/send/history, plus mention rights if the role is not mentionable; `/guyun/health` still reports `registrationOpen: true`; and no receipt file exists yet.

The receipt is claimed with `O_EXCL` **before** the POST, and the returned message ID is written **before** verification, so a lost verification GET can never produce a second message. A run that finds an existing receipt only ever reconciles by GET — it never re-POSTs.

## Verification

- `test_send.py`: 32 tests, all passing, entirely offline. `DISCORD_BOT_TOKEN` is left unset in the fixture so any unmocked call fails loudly instead of reaching Discord; every test asserts how many POSTs were attempted. Coverage: mention scoping and link targets, the timing window (including re-checking it after a slow preflight), preview-never-posts, send-exactly-once, each no-duplicate path, every preflight refusal, the channel-overwrite permission maths, `verify()` rejecting tampered messages, and the exit-code mapping.
- `python -m unittest test_send` from this directory. No Discord credentials or network access are needed or used.
- **Deployed and verified on 2026-08-26 (host 161.33.185.80, systemd 245, host timezone `Etc/UTC`).** Staged at `/home/ubuntu/ai-song-contest/.stage-promotion-20260827-noon`; every file hashed identical to this directory on both the host and inside the container. `systemd-analyze verify` returned 0 on both units before installation. The timer is `enabled` and `active`, next elapse `Thu 2026-08-27 04:00:00 UTC`. `systemd-analyze calendar` confirmed systemd 245 parses the `UTC` suffix in `OnCalendar=` correctly.
- **Test DM delivered and verified on 2026-08-26** (`1542187290565021756`, DM channel `1530871462859247687`). `test_dm.py` lives in `/data/testdm-20260826/`, deliberately outside the scheduled job's directory, and imports the *deployed* `send.py` so the layout under test is the artifact that ships. Delivered `mention_roles` was empty and the announcement channel was not touched; `verify.py` afterwards confirmed the timer still `enabled`/`active` with the same next elapse and `not_sent`.
- The first attempt was rejected with `400 / 50035 NONCE_TYPE_TOO_LONG` — **a Discord nonce must be 25 characters or fewer**. No message was created; the pre-POST receipt claim held, and the stale pending receipt was cleared only after re-reading the DM channel and confirming nothing had been delivered. The production nonce `guyun-20260827-noon-ai` is 22 characters and was verified against the deployed module; `test_send.py` now pins this limit so it cannot regress into the noon send.
- The read-only preview ran inside the bot container and passed the full preflight: role `977847655759765514` still named `❇️｜AI創作者`, bot permissions sufficient, and `/guyun/health` reporting `registrationOpen: true` (reachable from the container). **Nothing has been sent** — `verify.py` reports `not_sent` and no receipt exists. The real Discord message has not been posted, and no member interaction was impersonated.

## Deployment

Already run on 2026-08-26 from `/home/ubuntu/ai-song-contest/.stage-promotion-20260827-noon`; it refuses a second run, so re-running is safe but will abort. Run `deploy.py` on the host as a user with passwordless sudo, before 04:00 UTC. It refuses to run twice, refuses if a receipt already exists, copies `send.py`/`lookup.py` into the container at `/data/scheduled-promotion-20260827-noon/`, checks the copies hash-identical, runs a **read-only preview** (no `--send`, so it cannot post), then installs both units, runs `systemd-analyze verify`, enables the timer, and prints the next elapse time. Check status any time with `verify.py`.

## Cancellation and rollback

To cancel before noon: `sudo systemctl disable --now guyun-promotion-20260827-noon.timer`, then remove both unit files from `/etc/systemd/system` and `systemctl daemon-reload`. Nothing else needs undoing — nothing outside these units and the staged scripts was touched.

After the message is sent, deleting it is a manual Discord action and is deliberately not scripted. Retain the receipt for audit.

## Known limits

- **A lost POST response needs a human.** Discord does not echo `nonce` back on `GET`, so the pending-receipt reconciliation scan cannot match a message whose POST response was lost in transit. That path returns 78 and asks for manual review; it never re-POSTs, so the worst case is a missed announcement, never a duplicate. `test_send.py` pins both outcomes.
- **A stale receipt temp file blocks writes.** `save_receipt` creates `…json.new` with `O_EXCL`. A crash between that create and the `os.replace` leaves the temp file behind, and later receipt writes fail with exit 75. Recovery: confirm the channel state in Discord first, then delete the stale `.json.new`.
- **A container that is down at noon retries indefinitely.** `docker exec` exits 1 when `ai-song-contest` is not running, which is neither 75 nor 78, and `StartLimitIntervalSec=0` disables systemd's rate limiting. The retry loop ends as soon as the container returns and the script reports 78 past expiry, but until then it retries every 60 s. Left as-is deliberately: bounding it risks throttling legitimate retries inside the 15-minute window.
- The preview prints the role name, which is non-ASCII; `deploy.py` passes `PYTHONIOENCODING=utf-8` so it cannot fail on a non-UTF-8 console.
