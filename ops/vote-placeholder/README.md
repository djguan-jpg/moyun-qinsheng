# 暫時移除投票頁示範內容 — 2026-08-27

依使用者手機截圖，從公開 `#vote` 頁面移除寫死的人氣榜、三筆範例票數、「月下長安」推薦卡與假投票按鈕；移除只改按鈕文字、未送出真實投票的 JS 事件。保留匿名投票入口，改顯示「投票尚未開放」與目前投稿／公開聆聽階段說明。

僅部署 `index.html`、`app.js` 至 `/home/ubuntu/ai-song-contest/moyun-qinsheng-site`，已確認線上原檔與本機版本僅有換行差異。主機原檔備份於 `/home/ubuntu/ai-song-contest/.backup-vote-placeholder-20260827`，本機原檔副本在 `live-before/`。沒有修改資料庫、音檔、後端、CSS、Discord 設定或既有公告排程。

驗證：`node --check app.js` 通過；`node --test scripts/test-vote-placeholder.mjs` 三項通過。使用 Browser 在正式站 390×844 手機視窗重新載入 `/#vote`，確認不再顯示示範榜單、作品或投票按鈕，頁面無 JavaScript 錯誤。

復原時先確認沒有後續修改，再比對並還原上述兩個前台檔案即可；本次沒有刪除任何投稿資料。
