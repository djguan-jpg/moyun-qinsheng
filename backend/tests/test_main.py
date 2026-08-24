from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

import moyun_backend.main as main
from moyun_backend.main import Settings, create_app, open_database, registration_state


def test_registration_waits_for_scheduled_start(tmp_path):
    settings = Settings(
        client_id="",
        client_secret="",
        guild_id="",
        participant_role_id="",
        redirect_uri="",
        session_secret="test-secret",
        session_https_only=False,
        database_path=tmp_path / "registrations.sqlite3",
        registration_start_at=datetime(2026, 8, 25, 4, 0, tzinfo=UTC),
        registration_end_at=None,
        public_base_path="",
    )

    is_open, message = registration_state(settings, datetime(2026, 8, 25, 3, 59, tzinfo=UTC))

    assert not is_open
    assert "12:00" in message


def test_registration_closes_at_scheduled_deadline(tmp_path):
    settings = Settings(
        client_id="",
        client_secret="",
        guild_id="",
        participant_role_id="",
        redirect_uri="",
        session_secret="test-secret",
        session_https_only=False,
        database_path=tmp_path / "registrations.sqlite3",
        registration_start_at=datetime(2026, 8, 25, 4, 0, tzinfo=UTC),
        registration_end_at=datetime(2026, 9, 12, 15, 59, tzinfo=UTC),
        public_base_path="",
    )

    is_open, message = registration_state(settings, datetime(2026, 9, 12, 15, 59, tzinfo=UTC))

    assert not is_open
    assert "09 月 12 日 23:59" in message


def test_health_reports_unconfigured_discord_and_initialises_database(tmp_path):
    settings = Settings(
        client_id="",
        client_secret="",
        guild_id="",
        participant_role_id="",
        redirect_uri="",
        session_secret="test-secret",
        session_https_only=False,
        database_path=tmp_path / "registrations.sqlite3",
        registration_start_at=None,
        registration_end_at=None,
        public_base_path="",
    )

    with TestClient(create_app(settings)) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "guyun-xinsheng-registration",
        "discordConfigured": False,
        "registrationOpen": True,
        "registrationStatus": "報名開放中",
    }
    assert settings.database_path.exists()


def test_discord_server_owner_can_access_admin_dashboard_without_participant_role(tmp_path, monkeypatch):
    settings = Settings(
        client_id="client-id",
        client_secret="client-secret",
        guild_id="guild-id",
        participant_role_id="participant-role",
        redirect_uri="https://example.test/auth/callback",
        session_secret="test-secret",
        session_https_only=False,
        database_path=tmp_path / "registrations.sqlite3",
        registration_start_at=None,
        registration_end_at=None,
        public_base_path="/guyun",
        admin_user_ids=frozenset({"server-owner"}),
    )

    async def fake_exchange(_settings, _code):
        return {
            "user": {"id": "server-owner", "username": "owner"},
            "member": {"roles": []},
        }

    monkeypatch.setattr(main, "exchange_discord_code", fake_exchange)
    with TestClient(create_app(settings)) as client:
        login = client.get("/auth/login?next=admin", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        callback = client.get(f"/auth/callback?code=test-code&state={state}", follow_redirects=False)
        dashboard = client.get("/admin")

    assert callback.status_code == 303
    assert callback.headers["location"] == "/guyun/admin"
    assert dashboard.status_code == 200
    assert "古韻新生・管理後台" in dashboard.text


def test_public_gallery_plays_uploaded_audio_without_exposing_discord_identity(tmp_path):
    settings = Settings(
        client_id="",
        client_secret="",
        guild_id="",
        participant_role_id="",
        redirect_uri="",
        session_secret="test-secret",
        session_https_only=False,
        database_path=tmp_path / "data" / "registrations.sqlite3",
        registration_start_at=None,
        registration_end_at=None,
        public_base_path="/guyun",
    )
    audio_path = settings.database_path.parent / "uploads" / "sample.mp3"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"fake-mp3-data")

    with TestClient(create_app(settings)) as client:
        with open_database(settings.database_path) as connection:
            connection.execute(
                """
                INSERT INTO registrations
                (discord_user_id, discord_username, display_name, work_title, category, description, contact_email,
                 audio_filename, audio_content_type, audio_size, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "1",
                    "private-username",
                    "私人顯示名稱",
                    "月下長安",
                    "古風音樂",
                    "一段公開的旋律。",
                    "creator@example.com",
                    "sample.mp3",
                    "audio/mpeg",
                    13,
                    "2026-08-25 12:00:00 CST",
                ),
            )
        gallery = client.get("/works")
        media = client.get("/media/sample.mp3")

    assert gallery.status_code == 200
    assert "月下長安" in gallery.text
    assert "/guyun/media/sample.mp3" in gallery.text
    assert "private-username" not in gallery.text
    assert "私人顯示名稱" not in gallery.text
    assert media.status_code == 200
    assert media.content == b"fake-mp3-data"
