"""Read-only verification against the deployed permission settings."""
import json
import urllib.request

from moyun_backend.main import can_register, can_view_admin, is_admin_user, load_settings

settings = load_settings()
viewer = {"id": "804681154266398760", "role_ids": ""}
assert viewer["id"] in settings.admin_viewer_user_ids
assert can_view_admin(viewer, settings)
assert not is_admin_user(viewer, settings)
assert not can_register(viewer, settings)
assert settings.admin_user_ids == frozenset({"404511310458388480"})
assert settings.admin_role_ids == frozenset({"977835162475843584"})
assert is_admin_user({"id": "404511310458388480"}, settings)
assert is_admin_user({"id": "role-admin", "role_ids": "977835162475843584"}, settings)
assert not can_view_admin({"id": "unapproved"}, settings)
with urllib.request.urlopen("http://127.0.0.1:8010/health", timeout=10) as response:
    health = json.load(response)
assert health["discordConfigured"] is True and health["registrationOpen"] is True
print(json.dumps({"viewer_id": viewer["id"], "can_view_admin": True,
                  "can_manage_admin": False, "original_admins_preserved": True,
                  "service": health["service"], "health": "ok"}))
