from dataclasses import replace
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

import moyun_backend.main as main

VIEWER = "804681154266398760"


@pytest.fixture
def settings(tmp_path):
    return main.Settings(
        client_id="test", client_secret="test", guild_id="guild",
        participant_role_id="creator", redirect_uri="https://example.test/guyun/auth/callback",
        session_secret="test-only-secret", session_https_only=False,
        database_path=tmp_path / "test.sqlite3", registration_start_at=None,
        registration_end_at=None, public_base_path="/guyun",
        admin_user_ids=frozenset({"original-admin"}),
        admin_role_ids=frozenset({"admin-role"}), admin_viewer_user_ids=frozenset({VIEWER}),
    )


def login(client, monkeypatch, user_id=VIEWER, roles=(), destination="admin"):
    async def exchange(_settings, _code):
        return {"user": {"id": user_id, "username": "test-user"}, "member": {"roles": list(roles)}}

    monkeypatch.setattr(main, "exchange_discord_code", exchange)
    response = client.get(f"/auth/login?next={destination}", follow_redirects=False)
    state = parse_qs(urlparse(response.headers["location"]).query)["state"][0]
    return client.get(f"/auth/callback?code=test&state={state}", follow_redirects=False)


def test_config_parses_exact_viewer_ids(monkeypatch):
    monkeypatch.setenv("DISCORD_ADMIN_VIEWER_USER_IDS", f" {VIEWER}, ,another-viewer,{VIEWER} ")
    monkeypatch.setenv("DISCORD_ADMIN_USER_IDS", "original-admin")
    configured = main.load_settings()
    assert configured.admin_viewer_user_ids == frozenset({VIEWER, "another-viewer"})
    assert configured.admin_user_ids == frozenset({"original-admin"})


def test_viewer_can_read_without_creator_role_but_cannot_write(settings, monkeypatch):
    with TestClient(main.create_app(settings)) as client:
        response = login(client, monkeypatch)
        assert response.status_code == 303
        assert response.headers["location"] == "/guyun/admin"
        dashboard = client.get("/admin")
        assert dashboard.status_code == 200
        assert "唯讀瀏覽權限" in dashboard.text
        assert "最新投稿" in dashboard.text and "即時有效票數" in dashboard.text
        assert "/admin/test-upload" not in dashboard.text
        upload = client.post("/admin/test-upload", data={"work_title": "forbidden"},
                             files={"audio_file": ("test.mp3", b"audio", "audio/mpeg")})
        assert upload.status_code == 403
        assert client.get("/register").status_code == 403
        assert client.post("/register", data={"work_title": "forbidden"}).status_code == 403
        with main.open_database(settings.database_path) as connection:
            assert connection.execute("SELECT COUNT(*) FROM registrations").fetchone()[0] == 0
        assert not (settings.database_path.parent / "uploads").exists()


def test_viewer_does_not_bypass_creator_role_during_registration_login(settings, monkeypatch):
    with TestClient(main.create_app(settings)) as client:
        assert login(client, monkeypatch, destination="register").status_code == 403


def test_viewer_with_creator_role_can_use_own_registration(settings, monkeypatch):
    with TestClient(main.create_app(settings)) as client:
        assert login(client, monkeypatch, roles=("creator",)).status_code == 303
        assert client.get("/register").status_code == 200
        assert client.post("/admin/test-upload").status_code == 403


@pytest.mark.parametrize("user_id,roles", [("original-admin", ()), ("role-admin", ("admin-role",))])
def test_existing_admin_management_is_preserved(settings, monkeypatch, user_id, roles):
    with TestClient(main.create_app(settings)) as client:
        assert login(client, monkeypatch, user_id=user_id, roles=roles).status_code == 303
        dashboard = client.get("/admin")
        assert dashboard.status_code == 200 and "/admin/test-upload" in dashboard.text
        token = dashboard.text.split('name="csrf_token" value="')[1].split('"')[0]
        upload = client.post("/admin/test-upload", data={"csrf_token": token, "work_title": "test", "description": "test"},
                             files={"audio_file": ("test.mp3", b"audio", "audio/mpeg")}, follow_redirects=False)
        assert upload.status_code == 303 and "test_uploaded=1" in upload.headers["location"]


def test_ordinary_creator_and_anonymous_user_cannot_read_admin(settings, monkeypatch):
    with TestClient(main.create_app(settings)) as client:
        assert client.get("/admin", follow_redirects=False).status_code == 303
        assert login(client, monkeypatch, user_id="ordinary", roles=("creator",)).status_code == 403
        assert client.get("/admin").status_code == 403
        assert client.post("/admin/test-upload").status_code == 403


def test_viewer_still_requires_verified_guild_membership(settings, monkeypatch):
    async def exchange(_settings, _code):
        raise httpx.HTTPStatusError("not a guild member", request=httpx.Request("GET", "https://discord.com"),
                                    response=httpx.Response(404))

    monkeypatch.setattr(main, "exchange_discord_code", exchange)
    with TestClient(main.create_app(settings)) as client:
        response = client.get("/auth/login?next=admin", follow_redirects=False)
        state = parse_qs(urlparse(response.headers["location"]).query)["state"][0]
        assert client.get(f"/auth/callback?code=test&state={state}").status_code == 502
        assert client.get("/admin", follow_redirects=False).status_code == 303


def test_removing_viewer_revokes_existing_session(settings, monkeypatch):
    with TestClient(main.create_app(settings)) as client:
        login(client, monkeypatch)
        cookies = dict(client.cookies)
    with TestClient(main.create_app(replace(settings, admin_viewer_user_ids=frozenset()))) as client:
        client.cookies.update(cookies)
        assert client.get("/admin").status_code == 403


def test_exact_id_match_only(settings):
    assert main.can_view_admin({"id": VIEWER}, settings)
    assert not main.is_admin_user({"id": VIEWER}, settings)
    assert not main.can_view_admin({"id": VIEWER + "1"}, settings)
    assert not main.can_view_admin(None, settings)
