# 後台唯讀使用者 — 2026-08-26

User-authorized ID: `804681154266398760`. Added only to `DISCORD_ADMIN_VIEWER_USER_IDS` on the registration backend. Existing admin user `404511310458388480` and admin role `977835162475843584` were retained. No Discord roles or bot settings were changed.

Deployed to `/home/ubuntu/guyun-registration`, service `registration`. `deploy.py` checks the original code/image, backs up `main.py` and `.env` under `.backup-admin-viewer-20260826` (private directory), and uses the exact prior image's dependencies. The rollback image is `guyun-registration-registration:before-admin-viewer-20260826`. No database or upload files were modified by the deployment scripts.

Verification: 21 backend tests passed, including OAuth viewer access, 403 for writes, participant-role requirements, existing administrator uploads, revocation and unauthorized users. On-host verification confirmed the deployed configuration and permission predicates; public health returned 200 and unauthenticated `/guyun/admin` redirected to Discord login. Deployed source SHA256: `5b7b250366fe7939d5692beb6ada1c1a0a6d5c4cd44ee551fad6aa8b924faf63`. The user's actual Discord login was not impersonated.

To revoke access, remove only this ID from `DISCORD_ADMIN_VIEWER_USER_IDS` and recreate the registration service with the existing Compose files. Existing admin permissions are independent. To roll back code, review subsequent changes before restoring the backed-up source/config and prior image; retain all data and uploads.
