# 展間返回、寵物與規則入口修復 — 2026-08-27

Root causes verified in the live Browser and host filesystem:

- `mingyun-integration.js`, `mingyun-integration.css`, and the complete `vendor/mingyun/` package were absent from the live static site. Pet animations ran, but no creative task could be generated.
- The homepage “查看規則” button had no navigation binding.
- The public gallery had no return navigation.

Changes: publish the existing 18-module MingYun package with its license and integration styles; keep pet generation messages from being overwritten by decorative video playback; bind the rules button to the `info` view and `format` tab; add a 44px-minimum-height “回到上一頁” link at the top of both populated and empty galleries. It uses history only for same-site referrers with a previous entry; direct/external visits and no-JS use `/#works`.

Deployment used the prior backend image's exact dependencies, adding only `main.py` and `gallery-navigation.js`. Existing static HTML/JS and backend source were checked against hashes and backed up to `/home/ubuntu/ai-song-contest/.backup-ui-repair-20260827`. Prior backend image: `guyun-registration-registration:before-ui-repair-20260827`. No environment settings, database entries, audio files, artwork, bot or timer were changed.

Verification:

- 14 Node tests passed (back-link cases, rule binding, all transitive pet imports, three engine abilities, preserved voting-placeholder removal).
- 22 backend tests passed with fresh isolated temporary data (the old default test temp folder had an ACL issue).
- Live Browser desktop and 390×844 mobile: all three pets generated results; blind box choice and ensemble worked; no horizontal overflow; rules opened the correct tab even after a prior FAQ selection; returning from the gallery restored the originating works page; direct gallery visits fell back safely to the website. No browser console errors were observed.
- Backend health returned 200 with registration still open; deployed hashes matched local files.

The original site code can be recovered from the backup after reviewing any subsequent edits. The newly published pet assets can remain in place if code is rolled back. Do not delete contest data or overwrite later unrelated updates.
