// 部署完成且 /health 回傳 discordConfigured: true 後，
// 將 registrationApiBaseUrl 寫入網站根目錄的 backend-config.js 並推送發布。
window.MOYUN_BACKEND_CONFIG = Object.freeze({
  registrationApiBaseUrl: 'https://contest.zoeg.studio',
});
