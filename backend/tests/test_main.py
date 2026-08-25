from datetime import UTC, datetime
import re
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


def test_discord_administrator_role_can_access_admin_dashboard(tmp_path, monkeypatch):
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
        public_base_path="",
        admin_role_ids=frozenset({"administrator-role"}),
    )

    async def fake_exchange(_settings, _code):
        return {
            "user": {"id": "administrator", "username": "administrator"},
            "member": {"roles": ["administrator-role"]},
        }

    monkeypatch.setattr(main, "exchange_discord_code", fake_exchange)
    with TestClient(create_app(settings)) as client:
        login = client.get("/auth/login?next=admin", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        callback = client.get(f"/auth/callback?code=test-code&state={state}", follow_redirects=False)
        dashboard = client.get("/admin")

    assert callback.status_code == 303
    assert callback.headers["location"] == "/admin"
    assert dashboard.status_code == 200


def test_creator_can_update_existing_registration_and_optionally_replace_audio(tmp_path, monkeypatch):
    settings = Settings(
        client_id="client-id",
        client_secret="client-secret",
        guild_id="guild-id",
        participant_role_id="participant-role",
        redirect_uri="https://example.test/auth/callback",
        session_secret="test-secret",
        session_https_only=False,
        database_path=tmp_path / "data" / "registrations.sqlite3",
        registration_start_at=None,
        registration_end_at=None,
        public_base_path="/guyun",
    )

    async def fake_exchange(_settings, _code):
        return {
            "user": {"id": "creator-id", "username": "creator"},
            "member": {"roles": ["participant-role"]},
        }

    monkeypatch.setattr(main, "exchange_discord_code", fake_exchange)
    with TestClient(create_app(settings)) as client:
        login = client.get("/auth/login", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        callback = client.get(f"/auth/callback?code=test-code&state={state}", follow_redirects=False)
        old_audio = settings.database_path.parent / "uploads" / "original.mp3"
        old_audio.parent.mkdir(parents=True, exist_ok=True)
        old_audio.write_bytes(b"original-audio")
        with open_database(settings.database_path) as connection:
            connection.execute(
                """
                INSERT INTO registrations
                (discord_user_id, discord_username, display_name, work_title, category, description, contact_email,
                 audio_filename, audio_content_type, audio_size, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "creator-id",
                    "creator",
                    "創作者",
                    "原始作品",
                    "古風音樂",
                    "原始簡介。",
                    "",
                    "original.mp3",
                    "audio/mpeg",
                    len(b"original-audio"),
                    "2026-08-25 12:00:00 CST",
                ),
            )

        edit_page = client.get("/register")
        csrf = re.search(r'name="csrf_token" value="([^"]+)"', edit_page.text)[1]
        metadata_update = client.post(
            "/register",
            data={
                "csrf_token": csrf,
                "work_title": "更新後作品",
                "category": "古風音樂",
                "description": "更新後簡介。",
                "agreement": "yes",
            },
            follow_redirects=False,
        )

        assert callback.headers["location"] == "/guyun/register"
        assert edit_page.status_code == 200
        assert "修改參賽作品" in edit_page.text
        assert "value=\"原始作品\"" in edit_page.text
        assert "留空會保留目前音檔" in edit_page.text
        assert 'href="/">← 返回古韻新生網站' in edit_page.text
        assert metadata_update.status_code == 303
        assert metadata_update.headers["location"] == "/guyun/register?saved=updated"
        with open_database(settings.database_path) as connection:
            registration = connection.execute(
                "SELECT * FROM registrations WHERE discord_user_id = ?", ("creator-id",)
            ).fetchone()
            assert connection.execute("SELECT COUNT(*) FROM registrations").fetchone()[0] == 1
        assert registration["work_title"] == "更新後作品"
        assert registration["description"] == "更新後簡介。"
        assert registration["audio_filename"] == "original.mp3"
        assert registration["created_at"] == "2026-08-25 12:00:00 CST"
        assert registration["updated_at"]
        assert old_audio.read_bytes() == b"original-audio"

        refreshed_page = client.get("/register")
        refreshed_csrf = re.search(r'name="csrf_token" value="([^"]+)"', refreshed_page.text)[1]
        replacement_update = client.post(
            "/register",
            data={
                "csrf_token": refreshed_csrf,
                "work_title": "替換音檔後作品",
                "category": "古風音樂",
                "description": "替換音檔後簡介。",
                "agreement": "yes",
            },
            files={"audio_file": ("replacement.mp3", b"replacement-audio", "audio/mpeg")},
            follow_redirects=False,
        )

        assert replacement_update.status_code == 303
        assert replacement_update.headers["location"] == "/guyun/register?saved=updated"
        with open_database(settings.database_path) as connection:
            registration = connection.execute(
                "SELECT * FROM registrations WHERE discord_user_id = ?", ("creator-id",)
            ).fetchone()
        assert registration["work_title"] == "替換音檔後作品"
        assert registration["audio_filename"] != "original.mp3"
        assert not old_audio.exists()
        assert (settings.database_path.parent / "uploads" / registration["audio_filename"]).read_bytes() == b"replacement-audio"


def test_admin_dashboard_shows_discord_submitter_and_live_vote_counts(tmp_path, monkeypatch):
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
        public_base_path="",
        admin_role_ids=frozenset({"administrator-role"}),
    )

    async def fake_exchange(_settings, _code):
        return {
            "user": {"id": "administrator", "username": "administrator"},
            "member": {"roles": ["administrator-role"]},
        }

    monkeypatch.setattr(main, "exchange_discord_code", fake_exchange)
    with TestClient(create_app(settings)) as client:
        login = client.get("/auth/login?next=admin", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        client.get(f"/auth/callback?code=test-code&state={state}", follow_redirects=False)
        with open_database(settings.database_path) as connection:
            cursor = connection.execute(
                """
                INSERT INTO registrations
                (discord_user_id, discord_username, display_name, work_title, category, description, contact_email,
                 created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "creator-id",
                    "music_creator",
                    "音樂創作者",
                    "月下長安",
                    "古風音樂",
                    "測試投稿。",
                    "",
                    "2026-08-25 12:00:00 CST",
                ),
            )
            registration_id = cursor.lastrowid
            connection.executemany(
                """
                INSERT INTO votes (registration_id, voter_discord_id, stage, created_at)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (registration_id, "voter-1", "stage_1", "2026-08-25 12:01:00 CST"),
                    (registration_id, "voter-2", "stage_1", "2026-08-25 12:02:00 CST"),
                    (registration_id, "voter-3", "stage_1", "2026-08-25 12:03:00 CST"),
                ],
            )
        dashboard = client.get("/admin")

    assert dashboard.status_code == 200
    assert "投稿者 Discord 名稱" in dashboard.text
    assert "music_creator" in dashboard.text
    assert "即時有效票數" in dashboard.text
    assert "3 票" in dashboard.text
    assert "每 10 秒自動更新" in dashboard.text


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
        artworks = [
            client.get(f"/art/{artwork_key}")
            for artwork_key in ("ink-resonance", "moonlit-strings", "landscape-score")
        ]
        visualizer = client.get("/anonymous-visualizer.js")
        missing_artwork = client.get("/art/not-a-real-artwork")

    assert gallery.status_code == 200
    assert "匿名作品 #001" in gallery.text
    assert "歌名與創作理念將於主辦單位公告後統一公開。" in gallery.text
    assert "月下長安" not in gallery.text
    assert "一段公開的旋律。" not in gallery.text
    assert "/guyun/media/sample.mp3" in gallery.text
    assert '/guyun/anonymous-visualizer.js' in gallery.text
    assert '<canvas class="anonymous-visualizer" data-artwork="ink-resonance" data-background="/guyun/art/ink-resonance"></canvas>' in gallery.text
    assert '<video' not in gallery.text
    assert "@keyframes anonymous-art" not in gallery.text
    assert "animation:anonymous-art" not in gallery.text
    assert "private-username" not in gallery.text
    assert "私人顯示名稱" not in gallery.text
    assert media.status_code == 200
    assert media.content == b"fake-mp3-data"
    assert all(artwork.status_code == 200 for artwork in artworks)
    assert all(artwork.headers["content-type"] == "image/png" for artwork in artworks)
    assert missing_artwork.status_code == 404
    assert visualizer.status_code == 200
    assert visualizer.headers["content-type"].startswith("application/javascript")
    assert "createMediaElementSource" in visualizer.text
    assert "getByteFrequencyData" in visualizer.text
    assert "requestAnimationFrame" in visualizer.text
    assert "new Image" in visualizer.text


def test_public_gallery_hides_admin_test_uploads(tmp_path):
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
        public_base_path="",
    )
    audio_path = settings.database_path.parent / "uploads" / "test.mp3"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"test-audio")

    with TestClient(create_app(settings)) as client:
        with open_database(settings.database_path) as connection:
            connection.execute(
                """
                INSERT INTO registrations
                (discord_user_id, discord_username, display_name, work_title, category, description, contact_email,
                 audio_filename, audio_content_type, audio_size, is_test, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "test-work",
                    "管理後台測試",
                    "管理後台測試",
                    "僅限後台測試",
                    "測試作品",
                    "不應出現在公開展間。",
                    "",
                    "test.mp3",
                    "audio/mpeg",
                    10,
                    1,
                    "2026-08-25 12:00:00 CST",
                ),
            )
        gallery = client.get("/works")

    assert gallery.status_code == 200
    assert "僅限後台測試" not in gallery.text
