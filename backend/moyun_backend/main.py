from __future__ import annotations

import html
import mimetypes
import os
import secrets
import sqlite3
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.datastructures import UploadFile
from starlette.middleware.sessions import SessionMiddleware

TAIPEI = ZoneInfo("Asia/Taipei")
DISCORD_API = "https://discord.com/api"
OAUTH_SCOPES = "identify guilds.members.read"
MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_AUDIO_TYPES = {
    ".mp3": {"audio/mpeg", "audio/mp3", "application/octet-stream"},
    ".m4a": {"audio/mp4", "audio/x-m4a", "application/octet-stream"},
    ".wav": {"audio/wav", "audio/x-wav", "audio/wave", "application/octet-stream"},
    ".ogg": {"audio/ogg", "application/ogg", "application/octet-stream"},
    ".webm": {"audio/webm", "application/octet-stream"},
}
ANONYMOUS_ARTWORKS = {
    "ink-resonance": "ink-resonance.png",
    "moonlit-strings": "moonlit-strings.png",
    "landscape-score": "landscape-score.png",
}

# Docker Compose injects these values itself.  Local development reads backend/.env.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@dataclass(frozen=True)
class Settings:
    client_id: str
    client_secret: str
    guild_id: str
    participant_role_id: str
    redirect_uri: str
    session_secret: str
    session_https_only: bool
    database_path: Path
    registration_start_at: datetime | None
    registration_end_at: datetime | None
    public_base_path: str
    public_reveal_work_metadata: bool = False
    admin_user_ids: frozenset[str] = frozenset()
    admin_role_ids: frozenset[str] = frozenset()

    @property
    def discord_is_configured(self) -> bool:
        return all((self.client_id, self.client_secret, self.guild_id, self.redirect_uri))


def parse_datetime(value: str) -> datetime | None:
    value = value.strip()
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=TAIPEI)
    return parsed.astimezone(UTC)


def load_settings() -> Settings:
    return Settings(
        client_id=os.getenv("DISCORD_CLIENT_ID", "").strip(),
        client_secret=os.getenv("DISCORD_CLIENT_SECRET", "").strip(),
        guild_id=os.getenv("DISCORD_GUILD_ID", "").strip(),
        participant_role_id=os.getenv("DISCORD_PARTICIPANT_ROLE_ID", "").strip(),
        redirect_uri=os.getenv("DISCORD_REDIRECT_URI", "").strip(),
        session_secret=os.getenv("SESSION_SECRET", "development-only-change-me"),
        session_https_only=os.getenv("SESSION_HTTPS_ONLY", "false").strip().lower()
        in {"1", "true", "yes"},
        database_path=Path(os.getenv("DATABASE_PATH", "data/guyun-registration.sqlite3")),
        registration_start_at=parse_datetime(os.getenv("REGISTRATION_START_AT", "")),
        registration_end_at=parse_datetime(os.getenv("REGISTRATION_END_AT", "")),
        public_base_path=normalise_base_path(os.getenv("PUBLIC_BASE_PATH", "")),
        public_reveal_work_metadata=os.getenv("PUBLIC_REVEAL_WORK_METADATA", "").strip().lower()
        in {"1", "true", "yes"},
        admin_user_ids=frozenset(
            value.strip()
            for value in os.getenv("DISCORD_ADMIN_USER_IDS", "").split(",")
            if value.strip()
        ),
        admin_role_ids=frozenset(
            value.strip()
            for value in os.getenv("DISCORD_ADMIN_ROLE_IDS", "").split(",")
            if value.strip()
        ),
    )


def normalise_base_path(value: str) -> str:
    value = value.strip().strip("/")
    return f"/{value}" if value else ""


def public_path(settings: Settings, path: str) -> str:
    return f"{settings.public_base_path}{path}"


def open_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def initialise_database(path: Path) -> None:
    with open_database(path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_user_id TEXT NOT NULL UNIQUE,
                discord_username TEXT NOT NULL,
                display_name TEXT NOT NULL,
                work_title TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                contact_email TEXT NOT NULL,
                audio_filename TEXT,
                audio_content_type TEXT,
                audio_size INTEGER,
                is_test INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
            """
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(registrations)")}
        for column, definition in {
            "audio_filename": "TEXT",
            "audio_content_type": "TEXT",
            "audio_size": "INTEGER",
            "is_test": "INTEGER NOT NULL DEFAULT 0",
            "updated_at": "TEXT",
        }.items():
            if column not in columns:
                connection.execute(f"ALTER TABLE registrations ADD COLUMN {column} {definition}")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
                voter_discord_id TEXT NOT NULL,
                stage TEXT NOT NULL DEFAULT 'stage_1',
                created_at TEXT NOT NULL,
                UNIQUE (registration_id, voter_discord_id, stage)
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS votes_registration_id_idx ON votes(registration_id)")


def uploads_directory(settings: Settings) -> Path:
    directory = settings.database_path.parent / "uploads"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


async def save_audio_upload(upload: UploadFile, settings: Settings) -> tuple[str, str, int]:
    original_name = upload.filename or ""
    extension = Path(original_name).suffix.lower()
    content_type = (upload.content_type or "").lower()
    allowed_types = ALLOWED_AUDIO_TYPES.get(extension)
    if not allowed_types or content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="請上傳 MP3、M4A、WAV、OGG 或 WEBM 音檔。",
        )
    content = await upload.read(MAX_AUDIO_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="音檔內容不可為空。")
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="音檔大小不可超過 25 MB。")
    filename = f"{secrets.token_urlsafe(18)}{extension}"
    (uploads_directory(settings) / filename).write_bytes(content)
    return filename, content_type, len(content)


def registration_state(settings: Settings, now: datetime | None = None) -> tuple[bool, str]:
    now = now or datetime.now(UTC)
    if settings.registration_start_at and now < settings.registration_start_at:
        return False, f"報名將於 {format_time(settings.registration_start_at)} 開啟"
    if settings.registration_end_at and now >= settings.registration_end_at:
        return False, f"報名已於 {format_time(settings.registration_end_at)} 結束"
    return True, "報名開放中"


def format_time(value: datetime) -> str:
    return value.astimezone(TAIPEI).strftime("%Y 年 %m 月 %d 日 %H:%M（台北時間）")


def get_current_user(request: Request) -> dict[str, str] | None:
    user = request.session.get("discord_user")
    return user if isinstance(user, dict) else None


def is_admin_user(user: dict[str, str] | None, settings: Settings) -> bool:
    if not user:
        return False
    role_ids = set(filter(None, user.get("role_ids", "").split(",")))
    return user.get("id") in settings.admin_user_ids or bool(role_ids & settings.admin_role_ids)


def page(title: str, body: str, *, status_code: int = 200) -> HTMLResponse:
    document = f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}｜古韻新生</title>
<style>
  .anonymous-art {{ height:clamp(190px,31vw,250px); overflow:hidden; margin:-20px -20px 18px; background:#1c312a; }}
  .anonymous-art img {{ display:block; width:100%; height:100%; object-fit:cover; }}
  .anonymous-art {{ position:relative; }} .anonymous-art canvas {{ position:absolute; inset:0; display:block; width:100%; height:100%; pointer-events:none; }}
  :root {{ color-scheme: light; font-family: "Noto Serif TC", "Microsoft JhengHei", serif; color: #19302c; background:#f5f2e9; }}
  body {{ margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at top right,#d9e3dc,transparent 38%),#f5f2e9; }}
  main {{ width:min(680px,calc(100% - 40px)); margin:40px 20px; padding:36px; background:#fffdf8; border:1px solid #d8d1c3; box-shadow:0 16px 45px #23362a20; }}
  .eyebrow {{ color:#9d4733; font-size:.75rem; letter-spacing:.14em; }} h1 {{ margin:.35rem 0 1rem; }} p {{ line-height:1.8; }}
  form {{ display:grid; gap:16px; margin-top:24px; }} label {{ display:grid; gap:7px; font-weight:700; }} input,select,textarea {{ font:inherit; padding:10px; border:1px solid #b9b3a5; background:#fff; }} textarea {{ min-height:120px; resize:vertical; }}
  button,a.button {{ display:inline-block; width:fit-content; border:0; padding:12px 18px; background:#234d45; color:#fff; font:inherit; text-decoration:none; cursor:pointer; }}
  .notice {{ padding:13px 15px; border-left:4px solid #9d4733; background:#f6e9e3; }} .success {{ border-color:#28634c; background:#e6f1e9; }}
  .muted {{ color:#66736e; font-size:.92rem; }} .logout {{ margin-top:24px; background:transparent; color:#234d45; padding:0; text-decoration:underline; }}
  .gallery,.admin {{ width:min(1060px,calc(100% - 40px)); }} .gallery-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:18px; margin-top:24px; }} .work {{ padding:20px; border:1px solid #d8d1c3; background:#fff; }} .work h2 {{ margin:.3rem 0 .8rem; font-size:1.2rem; }} audio {{ width:100%; }}
  @media (max-width:640px) {{ body {{ display:block; }} main {{ box-sizing:border-box; width:100%; margin:0; padding:16px; }} .gallery-grid {{ grid-template-columns:1fr; gap:14px; margin-top:18px; }} .work {{ padding:14px; }} .anonymous-art {{ height:clamp(190px,58vw,280px); margin:-14px -14px 15px; }} .work h2 {{ font-size:1.13rem; }} }}
  .admin-stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; margin:24px 0; }} .admin-stats article {{ padding:18px; background:#f3f6f1; border:1px solid #d8d1c3; }} .admin-stats p,.admin-stats h2 {{ margin:.15rem 0; }} table {{ width:100%; border-collapse:collapse; margin-top:16px; }} th,td {{ padding:12px 8px; border-bottom:1px solid #ded8cb; text-align:left; vertical-align:top; }} th {{ color:#66736e; font-size:.82rem; }}
</style></head><body><main>{body}</main></body></html>"""
    return HTMLResponse(document, status_code=status_code)


def notice(message: str, *, success: bool = False) -> str:
    class_name = "notice success" if success else "notice"
    return f'<p class="{class_name}">{html.escape(message)}</p>'


def require_csrf(request: Request, token: str) -> None:
    expected = request.session.get("csrf_token")
    if not expected or not secrets.compare_digest(expected, token):
        raise HTTPException(status_code=403, detail="表單已過期，請重新整理後再送出。")


async def exchange_discord_code(settings: Settings, code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            f"{DISCORD_API}/oauth2/token",
            data={
                "client_id": settings.client_id,
                "client_secret": settings.client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_response.raise_for_status()
        access_token = token_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}
        user_response = await client.get(f"{DISCORD_API}/users/@me", headers=headers)
        user_response.raise_for_status()
        member_response = await client.get(
            f"{DISCORD_API}/users/@me/guilds/{settings.guild_id}/member", headers=headers
        )
        member_response.raise_for_status()
    return {"user": user_response.json(), "member": member_response.json()}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        initialise_database(settings.database_path)
        yield

    app = FastAPI(title="古韻新生報名服務", lifespan=lifespan)
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        https_only=settings.session_https_only,
        same_site="lax",
        max_age=60 * 60 * 8,
    )

    @app.get("/health")
    async def health() -> JSONResponse:
        is_open, message = registration_state(settings)
        return JSONResponse(
            {
                "service": "guyun-xinsheng-registration",
                "discordConfigured": settings.discord_is_configured,
                "registrationOpen": is_open,
                "registrationStatus": message,
            }
        )

    @app.get("/")
    async def home(request: Request) -> HTMLResponse:
        is_open, message = registration_state(settings)
        user = get_current_user(request)
        login_label = "繼續報名" if user else "使用 Discord 登入"
        body = f"""
<p class="eyebrow">GUYUN XINSHENG</p><h1>古韻新生・線上報名</h1>
{notice(message, success=is_open)}
<p>以 Discord 驗證身分後，即可提交古風音樂作品資料。每個 Discord 帳號限一筆有效報名；報名截止前可隨時修改已提交的資料。投稿結束後將進入開放所有人參與的公開投票淘汰賽，最後設敗部復活賽。</p>
<a class="button" href="{public_path(settings, '/register')}">{login_label}</a>
<a class="button" href="{public_path(settings, '/works')}">聆聽公開作品</a>"""
        return page("線上報名", body)

    @app.get("/works")
    async def public_works() -> HTMLResponse:
        metadata_columns = ", work_title, category, description" if settings.public_reveal_work_metadata else ""
        with open_database(settings.database_path) as connection:
            works = connection.execute(
                f"""
                SELECT id, audio_filename, audio_content_type, created_at{metadata_columns}
                FROM registrations
                WHERE audio_filename IS NOT NULL AND is_test = 0
                ORDER BY id DESC
                """
            ).fetchall()
        if not works:
            body = f"""
<p class="eyebrow">PUBLIC LISTENING GALLERY</p><h1>公開作品展演</h1>
{notice("目前尚無公開作品；首件完成投稿的作品將會出現在這裡。")}
<a class="button" href="{public_path(settings, '/')}">回到報名入口</a>"""
            return page("公開作品展演", body)

        def render_work_card(work: sqlite3.Row) -> str:
            audio_source = public_path(settings, "/media/" + work["audio_filename"])
            audio_type = html.escape(work["audio_content_type"] or "audio/mpeg")
            artwork_keys = tuple(ANONYMOUS_ARTWORKS)
            artwork_key = artwork_keys[(work["id"] - 1) % len(artwork_keys)]
            artwork_url = public_path(settings, "/art/" + artwork_key + "?v=canvas-artwork-20260825-v3")
            if settings.public_reveal_work_metadata:
                metadata = f"""<p class="eyebrow">匿名作品 #{work['id']:03d}・{html.escape(work['category'])}</p>
<h2>{html.escape(work['work_title'])}</h2><p class="muted">{html.escape(work['description'])}</p>"""
            else:
                metadata = f"""<p class="eyebrow">ANONYMOUS ENTRY</p>
<h2>匿名作品 #{work['id']:03d}</h2><p class="muted">歌名與創作理念將於主辦單位公告後統一公開。</p>"""
            return f"""<article class="work"><div class="anonymous-art" aria-hidden="true"><img src="{artwork_url}" alt=""><canvas class="anonymous-visualizer" data-artwork="{artwork_key}"></canvas></div>{metadata}
<audio controls preload="metadata"><source src="{audio_source}" type="{audio_type}">你的瀏覽器不支援音檔播放。</audio></article>"""

        cards = "".join(
            render_work_card(work) for work in works
        )
        gallery_description = (
            "以下作品已由創作者投稿；創作者 Discord 身分不會公開。"
            if settings.public_reveal_work_metadata
            else "以下作品均以匿名編號呈現，可直接播放音檔；歌名與創作理念將於主辦單位公告後統一公開。"
        )
        body = f"""
<p class="eyebrow">PUBLIC LISTENING GALLERY</p><h1>公開作品展演</h1>
<p>{gallery_description}</p><div class="gallery-grid">{cards}</div>
<script src="{public_path(settings, '/anonymous-visualizer.js')}" defer></script>"""
        return page("公開作品展演", body)

    @app.get("/media/{audio_filename}")
    async def stream_audio(audio_filename: str) -> FileResponse:
        if Path(audio_filename).name != audio_filename:
            raise HTTPException(status_code=404, detail="找不到音檔。")
        path = uploads_directory(settings) / audio_filename
        if not path.is_file():
            raise HTTPException(status_code=404, detail="找不到音檔。")
        media_type, _ = mimetypes.guess_type(path.name)
        return FileResponse(path, media_type=media_type or "application/octet-stream")

    @app.get("/art/{artwork}")
    async def stream_anonymous_artwork(artwork: str) -> FileResponse:
        filename = ANONYMOUS_ARTWORKS.get(artwork)
        if not filename:
            raise HTTPException(status_code=404, detail="找不到匿名作品圖案。")
        path = Path(__file__).resolve().parent / "static" / "anonymous-art" / filename
        if not path.is_file():
            raise HTTPException(status_code=404, detail="找不到匿名作品圖案。")
        return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})

    @app.get("/anonymous-visualizer.js")
    async def stream_anonymous_visualizer() -> FileResponse:
        path = Path(__file__).resolve().parent / "static" / "anonymous-visualizer.js"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="找不到匿名作品播放器。")
        return FileResponse(path, media_type="application/javascript", headers={"Cache-Control": "no-cache"})

    @app.get("/auth/login")
    async def login(request: Request, next: str = ""):
        if not settings.discord_is_configured:
            return page(
                "Discord 尚未設定",
                "<h1>Discord 登入尚未設定</h1><p>請先在伺服器的 <code>.env</code> 填入 Discord 應用程式資料，再重新啟動服務。</p>",
                status_code=503,
            )
        state = secrets.token_urlsafe(32)
        request.session["oauth_state"] = state
        request.session["post_login_destination"] = "admin" if next == "admin" else "register"
        query = urlencode(
            {
                "client_id": settings.client_id,
                "redirect_uri": settings.redirect_uri,
                "response_type": "code",
                "scope": OAUTH_SCOPES,
                "state": state,
                "prompt": "consent",
            }
        )
        return RedirectResponse(f"https://discord.com/oauth2/authorize?{query}", status_code=302)

    @app.get("/auth/callback")
    async def callback(request: Request, code: str = "", state: str = ""):
        expected_state = request.session.pop("oauth_state", "")
        post_login_destination = request.session.pop("post_login_destination", "register")
        if not code or not expected_state or not secrets.compare_digest(expected_state, state):
            return page("登入失敗", "<h1>登入驗證失敗</h1><p>請回到報名頁重新登入。</p>", status_code=400)
        try:
            discord = await exchange_discord_code(settings, code)
        except httpx.HTTPError:
            return page("登入失敗", "<h1>無法完成 Discord 驗證</h1><p>請稍後再試；若問題持續，請聯絡主辦單位。</p>", status_code=502)

        discord_user = discord["user"]
        roles = {str(role) for role in discord["member"].get("roles", [])}
        is_admin = str(discord_user["id"]) in settings.admin_user_ids or bool(
            roles & settings.admin_role_ids
        )
        if settings.participant_role_id and settings.participant_role_id not in roles and not is_admin:
            return page(
                "尚未取得報名資格",
                "<h1>尚未取得報名資格</h1><p>本活動僅開放持有「音樂創作者」身分組的 Discord 成員報名。</p>",
                status_code=403,
            )

        member = discord["member"]
        request.session["discord_user"] = {
            "id": str(discord_user["id"]),
            "username": discord_user.get("global_name") or discord_user.get("username") or "Discord 使用者",
            "display_name": member.get("nick") or discord_user.get("global_name") or discord_user.get("username") or "Discord 使用者",
            "role_ids": ",".join(sorted(roles)),
        }
        if post_login_destination == "admin":
            if not is_admin:
                return page(
                    "沒有管理權限",
                    "<h1>沒有管理權限</h1><p>請使用活動 Discord 伺服器的管理員帳號登入。</p>",
                    status_code=403,
                )
            return RedirectResponse(public_path(settings, "/admin"), status_code=303)
        return RedirectResponse(public_path(settings, "/register"), status_code=303)

    @app.get("/admin")
    async def admin(request: Request, test_uploaded: str = "", test_error: str = "") -> HTMLResponse:
        user = get_current_user(request)
        if not user:
            return RedirectResponse(public_path(settings, "/auth/login") + "?next=admin", status_code=303)
        if not is_admin_user(user, settings):
            return page(
                "沒有管理權限",
                f"<h1>沒有管理權限</h1><p>此頁僅供活動 Discord 伺服器管理員使用。</p><a class=\"button\" href=\"{public_path(settings, '/auth/login')}?next=admin\">重新使用 Discord 登入</a>",
                status_code=403,
            )
        with open_database(settings.database_path) as connection:
            total = connection.execute("SELECT COUNT(*) FROM registrations").fetchone()[0]
            with_audio = connection.execute(
                "SELECT COUNT(*) FROM registrations WHERE audio_filename IS NOT NULL"
            ).fetchone()[0]
            test_uploads = connection.execute(
                "SELECT COUNT(*) FROM registrations WHERE is_test = 1"
            ).fetchone()[0]
            valid_votes = connection.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
            registrations = connection.execute(
                """
                SELECT registrations.id, registrations.discord_username, registrations.display_name,
                       registrations.work_title, registrations.category, registrations.description,
                       registrations.audio_filename, registrations.audio_content_type, registrations.is_test,
                       registrations.created_at, COUNT(votes.id) AS vote_count
                FROM registrations
                LEFT JOIN votes ON votes.registration_id = registrations.id
                GROUP BY registrations.id
                ORDER BY registrations.id DESC LIMIT 50
                """
            ).fetchall()
        start = format_time(settings.registration_start_at) if settings.registration_start_at else "未設定"
        end = format_time(settings.registration_end_at) if settings.registration_end_at else "未設定"
        rows = "".join(
            f"""<tr><td>#{item['id']:03d}</td><td><strong>{html.escape(item['discord_username'])}</strong><br><span class=\"muted\">{html.escape(item['display_name'])}</span></td><td><strong>{html.escape(item['work_title'])}</strong>{' <span class=\"muted\">（測試）</span>' if item['is_test'] else ''}<br><span class=\"muted\">{html.escape(item['description'])}</span></td><td>{html.escape(item['category'])}</td><td>{html.escape(item['created_at'])}</td><td>{item['vote_count']} 票</td><td>{('<a href=\"' + public_path(settings, '/media/' + item['audio_filename']) + '\">播放音檔</a>') if item['audio_filename'] else '—'}</td></tr>"""
            for item in registrations
        ) or "<tr><td colspan=\"7\">目前尚無投稿資料。</td></tr>"
        request.session["csrf_token"] = secrets.token_urlsafe(32)
        messages = ""
        if test_uploaded:
            messages += notice("測試作品已上傳，可直接在下方清單播放驗證。", success=True)
        if test_error:
            messages += notice(test_error)
        body = f"""
<p class=\"eyebrow\">DISCORD ADMINISTRATION</p><h1>古韻新生・管理後台</h1>
<p class=\"muted\">已登入為 {html.escape(user['display_name'])}。只有活動 Discord 伺服器管理員可存取此頁。</p>
<div class=\"admin-stats\"><article><p>投稿總數</p><h2>{total}</h2></article><article><p>即時有效票數</p><h2>{valid_votes}</h2></article><article><p>已上傳音檔</p><h2>{with_audio}</h2></article><article><p>測試作品</p><h2>{test_uploads}</h2></article><article><p>報名開放</p><h2>{html.escape(start)}</h2></article><article><p>報名截止</p><h2>{html.escape(end)}</h2></article></div>
<p class=\"muted\">● 後台資料每 10 秒自動更新；Discord 名稱與票數僅顯示給管理員。</p>
<h2>測試作品上傳</h2>{messages}<p class=\"muted\">測試作品不會顯示在一般訪客的公開作品展演頁，僅供後台驗證上傳與播放功能。</p>
<form method=\"post\" action=\"{public_path(settings, '/admin/test-upload')}\" enctype=\"multipart/form-data\"><input type=\"hidden\" name=\"csrf_token\" value=\"{request.session['csrf_token']}\"><label>測試作品名稱<input name=\"work_title\" required maxlength=\"200\" placeholder=\"例如：後台音檔測試\"></label><label>測試說明<textarea name=\"description\" required maxlength=\"2000\" placeholder=\"可記錄本次測試內容"></textarea></label><label>音檔<input name=\"audio_file\" required type=\"file\" accept=\"audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm\"></label><p class=\"muted\">支援 MP3、M4A、WAV、OGG、WEBM，檔案大小上限 25 MB。</p><button type=\"submit\">上傳測試作品</button></form>
<h2>最新投稿</h2><table><thead><tr><th>編號</th><th>投稿者 Discord 名稱</th><th>作品</th><th>組別</th><th>提交時間</th><th>即時票數</th><th>音檔</th></tr></thead><tbody>{rows}</tbody></table>
<p><a class=\"button\" href=\"{public_path(settings, '/works')}\">查看公開展演</a></p>
<form method=\"post\" action=\"{public_path(settings, '/auth/logout')}\"><button class=\"logout\" type=\"submit\">登出</button></form><script>window.setTimeout(() => window.location.reload(), 10000);</script>"""
        return page("管理後台", body)

    @app.post("/admin/test-upload")
    async def upload_test_work(request: Request):
        user = get_current_user(request)
        if not user:
            return RedirectResponse(public_path(settings, "/auth/login") + "?next=admin", status_code=303)
        if not is_admin_user(user, settings):
            return page("沒有管理權限", "<h1>沒有管理權限</h1><p>此頁僅供活動 Discord 伺服器管理員使用。</p>", status_code=403)
        form = await request.form()
        try:
            require_csrf(request, str(form.get("csrf_token", "")))
        except HTTPException as error:
            return RedirectResponse(
                public_path(settings, "/admin") + "?" + urlencode({"test_error": error.detail}), status_code=303
            )
        work_title = str(form.get("work_title", "")).strip()
        description = str(form.get("description", "")).strip()
        audio_upload = form.get("audio_file")
        if not (work_title and description and isinstance(audio_upload, UploadFile)):
            return RedirectResponse(
                public_path(settings, "/admin") + "?" + urlencode({"test_error": "請完整填寫測試作品資料。"}), status_code=303
            )
        if len(work_title) > 200 or len(description) > 2000:
            return RedirectResponse(
                public_path(settings, "/admin") + "?" + urlencode({"test_error": "欄位內容超過允許長度。"}), status_code=303
            )
        try:
            audio_filename, audio_content_type, audio_size = await save_audio_upload(audio_upload, settings)
        except HTTPException as error:
            return RedirectResponse(
                public_path(settings, "/admin") + "?" + urlencode({"test_error": error.detail}), status_code=303
            )
        with open_database(settings.database_path) as connection:
            connection.execute(
                """
                INSERT INTO registrations
                (discord_user_id, discord_username, display_name, work_title, category, description, contact_email, audio_filename, audio_content_type, audio_size, is_test, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"test-{secrets.token_urlsafe(12)}",
                    "管理後台測試",
                    "管理後台測試",
                    work_title,
                    "測試作品",
                    description,
                    "",
                    audio_filename,
                    audio_content_type,
                    audio_size,
                    1,
                    datetime.now(TAIPEI).strftime("%Y-%m-%d %H:%M:%S %Z"),
                ),
            )
        return RedirectResponse(public_path(settings, "/admin") + "?test_uploaded=1", status_code=303)

    @app.get("/register")
    async def register(request: Request, saved: str = "", error: str = ""):
        user = get_current_user(request)
        if not user:
            return RedirectResponse(public_path(settings, "/auth/login"), status_code=303)
        is_open, message = registration_state(settings)
        if not is_open:
            return page(
                "報名尚未開放",
                f"<h1>目前無法報名</h1>{notice(message)}<p>已登入為 {html.escape(user['display_name'])}。</p><a class=\"button\" href=\"/\">返回古韻新生網站</a>",
            )
        request.session["csrf_token"] = secrets.token_urlsafe(32)
        with open_database(settings.database_path) as connection:
            existing = connection.execute(
                """
                SELECT work_title, category, description, audio_filename, created_at, updated_at
                FROM registrations WHERE discord_user_id = ?
                """,
                (user["id"],),
            ).fetchone()
        messages = ""
        if saved == "updated":
            messages += notice("報名資料已更新。", success=True)
        elif saved:
            messages += notice("報名資料已送出。", success=True)
        if error:
            messages += notice(error)
        is_editing = existing is not None
        work_title = html.escape(existing["work_title"], quote=True) if existing else ""
        description = html.escape(existing["description"]) if existing else ""
        category = existing["category"] if existing else "古風音樂"
        current_audio = existing["audio_filename"] if existing else None
        timestamp_label = "最後修改時間" if existing and existing["updated_at"] else "提交時間"
        timestamp = (existing["updated_at"] or existing["created_at"]) if existing else ""
        existing_summary = (
            f"{notice('已收到《' + existing['work_title'] + '》的資料。', success=True)}"
            f"<p>{timestamp_label}：{html.escape(timestamp)}</p>"
            if existing
            else ""
        )
        audio_label = "作品音檔（留空會保留目前音檔）" if current_audio else "作品音檔"
        audio_required = "" if current_audio else " required"
        submit_label = "更新報名資料" if is_editing else "送出報名資料"
        body = f"""
<p class="eyebrow">DISCORD VERIFIED ENTRY</p><h1>{'修改參賽作品' if is_editing else '提交參賽作品'}</h1>
<p class="muted">登入帳號：{html.escape(user['display_name'])}。每個帳號僅保留一筆有效報名。</p>{messages}{existing_summary}
<p><a class="button" href="/">← 返回古韻新生網站</a></p>
<form method="post" action="{public_path(settings, '/register')}" enctype="multipart/form-data">
  <input type="hidden" name="csrf_token" value="{request.session['csrf_token']}">
  <label>作品名稱<input name="work_title" required maxlength="200" value="{work_title}" placeholder="請輸入作品名稱"></label>
  <label>參賽組別<select name="category"><option value="古風音樂"{' selected' if category == '古風音樂' else ''}>古風音樂</option></select></label>
  <label>作品簡介<textarea name="description" required maxlength="2000" placeholder="請介紹創作理念、樂器與曲風">{description}</textarea></label>
  <label>{audio_label}<input name="audio_file"{audio_required} type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm"></label>
  <p class="muted">支援 MP3、M4A、WAV、OGG、WEBM，檔案大小上限 25 MB。{('如更換音檔，舊檔會在更新成功後移除。' if current_audio else '完成送出後，音檔會立即顯示於公開作品展演頁供其他人播放。')}</p>
  <label><span><input name="agreement" value="yes" type="checkbox" required> 我確認資料正確，並同意活動規則。</span></label>
  <button type="submit">{submit_label}</button>
</form>
<form method="post" action="{public_path(settings, '/auth/logout')}"><button class="logout" type="submit">登出</button></form>"""
        return page("提交參賽作品", body)

    @app.post("/register")
    async def submit_registration(request: Request):
        user = get_current_user(request)
        if not user:
            return RedirectResponse(public_path(settings, "/auth/login"), status_code=303)
        form = await request.form()
        try:
            require_csrf(request, str(form.get("csrf_token", "")))
        except HTTPException as error:
            return page("表單已過期", f"<h1>表單已過期</h1>{notice(error.detail)}<a class=\"button\" href=\"{public_path(settings, '/register')}\">重新開啟報名表</a>", status_code=403)
        is_open, message = registration_state(settings)
        if not is_open:
            return page("目前無法報名", f"<h1>目前無法報名</h1>{notice(message)}", status_code=403)
        work_title = str(form.get("work_title", "")).strip()
        category = str(form.get("category", "")).strip()
        description = str(form.get("description", "")).strip()
        agreement = str(form.get("agreement", ""))
        audio_upload = form.get("audio_file")
        has_new_audio = isinstance(audio_upload, UploadFile) and bool(audio_upload.filename)
        with open_database(settings.database_path) as connection:
            existing = connection.execute(
                "SELECT audio_filename FROM registrations WHERE discord_user_id = ?", (user["id"],)
            ).fetchone()
        if not (work_title and category and description and agreement == "yes"):
            return RedirectResponse(public_path(settings, "/register") + "?error=請完整填寫所有必填欄位。", status_code=303)
        if not existing and not has_new_audio:
            return RedirectResponse(public_path(settings, "/register") + "?error=請上傳作品音檔。", status_code=303)
        if len(work_title) > 200 or len(description) > 2000:
            return RedirectResponse(public_path(settings, "/register") + "?error=欄位內容超過允許長度。", status_code=303)
        audio_filename = audio_content_type = None
        audio_size = None
        if has_new_audio:
            try:
                audio_filename, audio_content_type, audio_size = await save_audio_upload(audio_upload, settings)
            except HTTPException as error:
                return RedirectResponse(public_path(settings, "/register") + "?error=" + str(error.detail), status_code=303)
        updated_at = datetime.now(TAIPEI).strftime("%Y-%m-%d %H:%M:%S %Z")
        try:
            with open_database(settings.database_path) as connection:
                if existing:
                    if has_new_audio:
                        connection.execute(
                            """
                            UPDATE registrations
                            SET discord_username = ?, display_name = ?, work_title = ?, category = ?, description = ?,
                                audio_filename = ?, audio_content_type = ?, audio_size = ?, updated_at = ?
                            WHERE discord_user_id = ?
                            """,
                            (user["username"], user["display_name"], work_title, category, description,
                             audio_filename, audio_content_type, audio_size, updated_at, user["id"]),
                        )
                    else:
                        connection.execute(
                            """
                            UPDATE registrations
                            SET discord_username = ?, display_name = ?, work_title = ?, category = ?, description = ?,
                                updated_at = ?
                            WHERE discord_user_id = ?
                            """,
                            (user["username"], user["display_name"], work_title, category, description,
                             updated_at, user["id"]),
                        )
                else:
                    connection.execute(
                        """
                        INSERT INTO registrations
                        (discord_user_id, discord_username, display_name, work_title, category, description, contact_email, audio_filename, audio_content_type, audio_size, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user["id"], user["username"], user["display_name"], work_title, category,
                            description, "", audio_filename, audio_content_type, audio_size, updated_at, updated_at,
                        ),
                    )
        except sqlite3.IntegrityError:
            if audio_filename:
                (uploads_directory(settings) / audio_filename).unlink(missing_ok=True)
            return RedirectResponse(public_path(settings, "/register"), status_code=303)
        if existing and audio_filename and existing["audio_filename"]:
            old_audio = Path(existing["audio_filename"])
            if old_audio.name == existing["audio_filename"] and old_audio.name != audio_filename:
                (uploads_directory(settings) / old_audio.name).unlink(missing_ok=True)
        status = "updated" if existing else "created"
        return RedirectResponse(public_path(settings, "/register") + f"?saved={status}", status_code=303)

    @app.post("/auth/logout")
    async def logout(request: Request):
        request.session.clear()
        return RedirectResponse(public_path(settings, "/"), status_code=303)

    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = load_settings()
    uvicorn.run(app, host=os.getenv("APP_HOST", "127.0.0.1"), port=int(os.getenv("APP_PORT", "8010")))


if __name__ == "__main__":
    main()
