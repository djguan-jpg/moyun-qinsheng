from fastapi.testclient import TestClient

from moyun_backend.main import Settings, create_app


def test_empty_gallery_links_directly_home_without_history_script(tmp_path):
    settings = Settings(client_id="", client_secret="", guild_id="", participant_role_id="",
                        redirect_uri="", session_secret="test", session_https_only=False,
                        database_path=tmp_path / "entries.sqlite3", registration_start_at=None,
                        registration_end_at=None, public_base_path="/guyun")
    with TestClient(create_app(settings)) as client:
        response = client.get("/works")
        assert response.status_code == 200
        assert 'href="/#home">← 回到首頁</a>' in response.text
        assert '回到上一頁' not in response.text
        assert 'data-gallery-back' not in response.text
        assert 'gallery-navigation.js' not in response.text
        # Keep the legacy asset available for already-open pages only.
        script = client.get("/gallery-navigation.js")
        assert script.status_code == 200
        assert script.headers["content-type"].startswith("application/javascript")
        assert script.headers["cache-control"] == "no-cache"
        assert "window.history.back()" in script.text
