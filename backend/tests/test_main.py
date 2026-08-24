from datetime import UTC, datetime

from fastapi.testclient import TestClient

from moyun_backend.main import Settings, create_app, registration_state


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
