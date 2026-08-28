# 古韻新生 Discord 報名後端

這個服務與舊的 AI 台語歌曲大賽完全分離，提供「古韻新生」的 Discord OAuth 登入、音樂創作者身分組驗證、音檔上傳，以及每個 Discord 帳號一筆的報名資料儲存。報名開放期間，投稿者可返回同一張表單修改作品資料；未重新選擇音檔時會保留既有音檔。

## 本機啟動

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
Copy-Item .env.example .env
python -m uvicorn moyun_backend.main:app --reload --port 8010
```

完成 `.env` 後，在 Discord Developer Portal 的 OAuth2 頁面加入完全相同的 Redirect URL，例如：

```text
http://localhost:8010/auth/callback
```

OAuth2 scopes 必須包含 `identify` 與 `guilds.members.read`。如果要限制報名資格，將「🎵｜音樂創作者」的身分組 ID 填入 `DISCORD_PARTICIPANT_ROLE_ID`。

## 正式部署

1. 將整個 `backend/` 資料夾放到獨立、可公開 HTTPS 的主機上。
2. 在主機建立 `.env`，將 `APP_HOST=0.0.0.0`、`SESSION_HTTPS_ONLY=true`，並把 `DISCORD_REDIRECT_URI` 改成正式的 `/auth/callback` 網址。
3. 若使用既有的 Caddy 主機，設定 `PUBLIC_BASE_PATH=/guyun`，並以 `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build` 啟動。Caddy 需將 `/guyun/*` 轉送到容器名稱 `guyun-registration:8010`。
4. 開啟 `https://你的網域/guyun/health`。回應中的 `discordConfigured` 必須為 `true`。
5. 最後才更新網站根目錄的 `backend-config.js`：

```js
window.MOYUN_BACKEND_CONFIG = Object.freeze({
  registrationApiBaseUrl: 'https://你的網域/guyun',
});
```

網站前端會以頁面跳轉方式前往 `/register`，不需要 CORS 設定。請不要指向舊的台語比賽後端。

## 後台存取權限

後台網址為 `/admin`（正式站：`/guyun/admin`），仍須使用 Discord 登入並驗證為活動伺服器成員。`DISCORD_ADMIN_USER_IDS` 與 `DISCORD_ADMIN_ROLE_IDS` 保留管理員權限；`DISCORD_ADMIN_VIEWER_USER_IDS` 是獨立的唯讀使用者名單（多位以逗號區隔），可查看投稿、票數與播放音檔，但不會顯示上傳表單，直接呼叫後台上傳端點也會回傳 403。唯讀權限不會授予 Discord 身分組或豁免一般投稿資格。

## 音檔與公開播放

報名表必須上傳一個 MP3、M4A、WAV、OGG 或 WEBM 音檔，檔案上限為 25 MB。報名完成後，音檔會立即出現在 `/works` 公開展演頁並可直接播放。預設 `PUBLIC_REVEAL_WORK_METADATA=false`，公開頁只會顯示匿名作品編號，歌名與創作理念不會被查詢或輸出；主辦單位公告後才可將此環境變數設為 `true` 並重新部署以公開資料。公開頁一律不會顯示 Discord 帳號、創作者姓名或聯絡信箱。

## 主機備份

`ops/guyun-registration-backup.sh` 搭配同目錄的 systemd service 與 timer，會每 3 小時備份 `data/` 中的投稿資料與音檔。資料庫會以 SQLite backup API 建立一致性快照；未變更的音檔會使用硬連結去重，備份存放於 `backups/<UTC 時間戳>/`。不會自動刪除歷史備份，應依主機的可用空間另行決定保留策略。

## 預設時程

報名開放時間由 `.env` 的 `REGISTRATION_START_AT` 與 `REGISTRATION_END_AT` 控制，採用 ISO 8601 格式。範例已設定為 2026-08-25 12:00（台北時間）開放，並因網站維修延長 48 小時至 2026-09-14 23:59 截止；結束時間留空則持續開放。
