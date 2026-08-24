# 古韻新生 Discord 報名後端

這個服務與舊的 AI 台語歌曲大賽完全分離，提供「古韻新生」的 Discord OAuth 登入、音樂創作者身分組驗證、音檔上傳，以及每個 Discord 帳號一筆的報名資料儲存。

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

## 音檔與公開播放

報名表必須上傳一個 MP3、M4A、WAV、OGG 或 WEBM 音檔，檔案上限為 25 MB。報名完成後，音檔會立即出現在 `/works` 公開展演頁並可直接播放；頁面不會顯示 Discord 帳號或創作者姓名，也不收集聯絡信箱。

## 預設時程

報名開放時間由 `.env` 的 `REGISTRATION_START_AT` 與 `REGISTRATION_END_AT` 控制，採用 ISO 8601 格式。範例已設定為 2026-08-25 12:00（台北時間）開放，2026-09-12 23:59 截止；結束時間留空則持續開放。
