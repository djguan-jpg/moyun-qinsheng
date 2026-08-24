const viewButtons = document.querySelectorAll('[data-view]');
const views = document.querySelectorAll('.view');
const navLinks = document.querySelectorAll('.main-nav a');
const liveDataConfig = window.MOYUN_BACKEND_CONFIG || {};
const liveDataApiBaseUrl = String(liveDataConfig.apiBaseUrl || '').replace(/\/+$/, '');
const registrationApiBaseUrl = String(liveDataConfig.registrationApiBaseUrl || '').replace(/\/+$/, '');
const liveAdminTokenKey = 'moyun-live-admin-token';
let liveAdminSnapshot = null;
function showView(viewId, updateHash = true) {
  views.forEach((view) => view.classList.toggle('active', view.id === viewId));
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.view === viewId));
  document.querySelector('.main-nav').classList.remove('open');
  document.body.classList.toggle('admin-mode', viewId === 'admin');
  if (updateHash && window.location.hash !== `#${viewId}`) window.history.replaceState(null, '', `#${viewId}`);
  if (viewId === 'admin') window.requestAdminAccess?.();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
viewButtons.forEach((button) => button.addEventListener('click', (event) => {
  const viewId = button.dataset.view;
  if (!viewId) return;
  event.preventDefault();
  showView(viewId);
}));
document.querySelector('.menu-button').addEventListener('click', () => document.querySelector('.main-nav').classList.toggle('open'));
document.querySelectorAll('[data-admin]').forEach((button) => button.addEventListener('click', () => {
  const panelId = button.dataset.admin;
  document.querySelectorAll('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.id === panelId));
  document.querySelectorAll('.admin-sidebar > button[data-admin]').forEach((item) => item.classList.toggle('active', item.dataset.admin === panelId));
  document.querySelector('.admin-sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));
document.querySelector('.mobile-admin-menu').addEventListener('click', () => document.querySelector('.admin-sidebar').classList.toggle('open'));
document.querySelectorAll('.vote-button').forEach((button) => button.addEventListener('click', () => { button.innerHTML = '✓ 已完成今日投票'; button.disabled = true; }));
document.querySelectorAll('.filters button,.news-cats button').forEach((button) => button.addEventListener('click', () => {
  const group = button.parentElement.querySelectorAll('button');
  group.forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
}));

const infoTabButtons = document.querySelectorAll('[data-info-tab]');
const infoTabPanels = document.querySelectorAll('[data-info-panel]');
function showInfoTab(tabId) {
  infoTabButtons.forEach((button) => {
    const isActive = button.dataset.infoTab === tabId;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  infoTabPanels.forEach((panel) => {
    const isActive = panel.dataset.infoPanel === tabId;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
}
infoTabButtons.forEach((button) => button.addEventListener('click', () => showInfoTab(button.dataset.infoTab)));

const adminCurrentTime = document.querySelector('.admin-header > div:first-child > span');
const adminTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
function updateAdminCurrentTime() {
  if (!adminCurrentTime) return;
  adminCurrentTime.textContent = `台灣時間　${adminTimeFormatter.format(new Date())}`;
}
updateAdminCurrentTime();
window.setInterval(updateAdminCurrentTime, 1000);

function getRequestedView() {
  const [viewId, rawParameters = ''] = window.location.hash.slice(1).split('?');
  const adminToken = new URLSearchParams(rawParameters).get('admin_token');
  if (viewId === 'admin' && adminToken) {
    sessionStorage.setItem(liveAdminTokenKey, adminToken);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin`);
  }
  return viewId;
}

const requestedView = getRequestedView();
if (requestedView && document.getElementById(requestedView)) showView(requestedView, false);
window.addEventListener('hashchange', () => {
  const viewId = getRequestedView();
  if (viewId && document.getElementById(viewId)) showView(viewId, false);
});

function showAdminToast(message) {
  const existingToast = document.querySelector('.admin-toast');
  if (existingToast) existingToast.remove();
  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function formatLiveAdminDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function getLiveDataStatus() {
  let status = document.querySelector('[data-live-data-status]');
  if (status) return status;
  const title = document.querySelector('#dashboard .admin-title > div');
  if (!title) return null;
  status = document.createElement('small');
  status.dataset.liveDataStatus = '';
  status.className = 'admin-data-status';
  title.append(status);
  return status;
}

function setLiveDataStatus(message, state = 'pending') {
  const status = getLiveDataStatus();
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function updateLiveDataConnectButton() {
  const button = document.querySelector('[data-live-data-connect]');
  if (!button) return;
  button.textContent = sessionStorage.getItem(liveAdminTokenKey) ? '更新資料 ↻' : '連接資料';
}

function requestLiveDataAuthorization() {
  if (!liveDataApiBaseUrl) {
    showAdminToast('尚未設定資料伺服器。');
    return;
  }
  window.location.assign(`${liveDataApiBaseUrl}/moyun/admin/connect`);
}

function startDiscordRegistration() {
  if (!registrationApiBaseUrl) {
    showAdminToast('目前無法連接 Discord 報名服務，請稍後再試。');
    return;
  }
  window.location.assign(`${registrationApiBaseUrl}/register`);
}

document.querySelectorAll('[data-discord-register]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    startDiscordRegistration();
  });
});

function initializeLiveDataControls() {
  const actionArea = document.querySelector('.admin-header > div:last-child');
  if (!actionArea || !liveDataApiBaseUrl || document.querySelector('[data-live-data-connect]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-connect-data';
  button.dataset.liveDataConnect = '';
  button.addEventListener('click', () => {
    if (sessionStorage.getItem(liveAdminTokenKey)) {
      hydrateLiveAdminDashboard();
      return;
    }
    requestLiveDataAuthorization();
  });
  actionArea.prepend(button);
  updateLiveDataConnectButton();
}

function createAdminTextCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value || '—';
  return cell;
}

function createAdminBadgeCell(value, className) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = value;
  cell.append(badge);
  return cell;
}

function createAdminParticipantCell(registration) {
  const cell = document.createElement('td');
  const avatar = document.createElement('span');
  const name = document.createElement('b');
  const serial = document.createElement('small');
  avatar.className = 'table-avatar';
  avatar.textContent = (registration.displayName || '參').slice(0, 1);
  name.textContent = registration.displayName || '未命名參賽者';
  serial.textContent = registration.serialNumber || '—';
  cell.append(avatar, name, serial);
  return cell;
}

function createLiveDataActionCell() {
  const cell = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-link';
  button.textContent = '管理作品 ↗';
  button.addEventListener('click', () => {
    const adminUrl = liveAdminSnapshot?.adminUrl || `${liveDataApiBaseUrl}/admin`;
    window.open(adminUrl, '_blank', 'noopener');
  });
  cell.append(button);
  return cell;
}

function createLiveRegistrationRow(registration, layout) {
  const row = document.createElement('tr');
  const audioStatus = registration.hasAudio ? '已上傳音檔' : '缺少音檔';
  const audioClassName = registration.hasAudio ? 'paid' : 'unpaid';
  if (layout === 'dashboard') {
    row.append(
      createAdminParticipantCell(registration),
      createAdminTextCell(registration.songTitle),
      createAdminTextCell(formatLiveAdminDate(registration.createdAt)),
      createAdminBadgeCell(audioStatus, audioClassName),
      createAdminBadgeCell('已同步', 'approved'),
      createLiveDataActionCell(),
    );
    return row;
  }
  const workStatus = registration.hasThumbnail ? '音檔與縮圖完整' : audioStatus;
  row.append(
    createAdminParticipantCell(registration),
    createAdminTextCell(registration.songTitle),
    createAdminTextCell(workStatus),
    createAdminTextCell(formatLiveAdminDate(registration.createdAt)),
    createAdminTextCell(`${Number(registration.votes || 0).toLocaleString('zh-TW')} 票`),
    createLiveDataActionCell(),
  );
  return row;
}

function renderLiveRegistrationTables(registrations) {
  const dashboardBody = document.querySelector('#dashboard .table-card tbody');
  const registrationsBody = document.querySelector('#registrations .table-card tbody');
  const dashboardHeaders = ['參賽者', '作品名稱', '投稿時間', '音檔狀態', '資料狀態', ''];
  const registrationsHeaders = ['參賽者', '作品名稱', '作品狀態', '投稿時間', '票數', '操作'];
  document.querySelectorAll('#dashboard .table-card thead th').forEach((cell, index) => {
    cell.textContent = dashboardHeaders[index] || '';
  });
  document.querySelectorAll('#registrations .table-card thead th').forEach((cell, index) => {
    cell.textContent = registrationsHeaders[index] || '';
  });
  if (dashboardBody) {
    dashboardBody.replaceChildren(...registrations.slice(0, 3).map((registration) => (
      createLiveRegistrationRow(registration, 'dashboard')
    )));
  }
  if (registrationsBody) {
    registrationsBody.replaceChildren(...registrations.map((registration) => (
      createLiveRegistrationRow(registration, 'registrations')
    )));
  }
}

function renderLiveWorks(works) {
  const container = document.querySelector('#works-admin .admin-cards');
  if (!container) return;
  container.replaceChildren(...works.slice(0, 3).map((work, index) => {
    const article = document.createElement('article');
    const artwork = document.createElement('div');
    const eyebrow = document.createElement('p');
    const title = document.createElement('h3');
    const meta = document.createElement('small');
    const button = document.createElement('button');
    artwork.className = `admin-work p${(index % 3) + 1}`;
    eyebrow.textContent = `作品編號 · ${work.serialNumber || '—'}`;
    title.textContent = work.songTitle || '未命名作品';
    meta.textContent = `${work.displayName || '未命名參賽者'}　·　${Number(work.votes || 0).toLocaleString('zh-TW')} 票`;
    button.type = 'button';
    button.textContent = '在 Discord 後台管理 ↗';
    button.addEventListener('click', () => {
      const adminUrl = liveAdminSnapshot?.adminUrl || `${liveDataApiBaseUrl}/admin`;
      window.open(adminUrl, '_blank', 'noopener');
    });
    article.append(artwork, eyebrow, title, meta, button);
    return article;
  }));
}

function renderLiveVotingStats(data) {
  const cards = document.querySelectorAll('#votes-admin .vote-admin-stats article');
  if (cards.length < 3) return;
  const activity = data.activity || {};
  const statistics = data.stats || {};
  const values = [
    ['投票狀態', activity.votingStatus || '未設定', activity.votingPeriod || '未設定投票期間'],
    ['累計有效票數', Number(statistics.votes || 0).toLocaleString('zh-TW'), '由 Discord 系統即時同步'],
    ['已上傳作品', Number(statistics.works || 0).toLocaleString('zh-TW'), '含已成功上傳音檔的投稿'],
  ];
  cards.forEach((card, index) => {
    const [label, value, detail] = values[index];
    const labelElement = card.querySelector('p');
    const valueElement = card.querySelector('h2');
    const detailElement = card.querySelector('small');
    if (labelElement) labelElement.textContent = label;
    if (valueElement) valueElement.textContent = value;
    if (detailElement) detailElement.textContent = detail;
  });
}

function renderLiveDashboard(data) {
  liveAdminSnapshot = data;
  const statistics = data.stats || {};
  const metricCards = document.querySelectorAll('#dashboard .metric-grid article');
  const metricValues = [
    ['總報名數', statistics.registrations, '所有 Discord 報名資料'],
    ['今日投稿數', statistics.todayRegistrations, '台灣時間今日新增'],
    ['已上傳作品', statistics.works, '含成功上傳音檔'],
    ['總投票數', statistics.votes, '所有有效投票'],
  ];
  metricCards.forEach((card, index) => {
    const [label, value, detail] = metricValues[index];
    const labelElement = card.querySelector('p');
    const valueElement = card.querySelector('h2');
    const detailElement = card.querySelector('small');
    if (labelElement) labelElement.textContent = label;
    if (valueElement) valueElement.textContent = Number(value || 0).toLocaleString('zh-TW');
    if (detailElement) detailElement.textContent = detail;
  });
  const greeting = document.querySelector('#dashboard .admin-title h1');
  if (greeting) greeting.textContent = `早安，${data.admin?.displayName || '管理員'} ☼`;
  const chartTitle = document.querySelector('#dashboard .chart-card h3');
  const chartCopy = document.querySelector('#dashboard .chart-card .card-head p');
  if (chartTitle) chartTitle.textContent = 'Discord 資料同步';
  if (chartCopy) chartCopy.textContent = `最後更新：${formatLiveAdminDate(data.updatedAt)}`;
  const categoryTitle = document.querySelector('#dashboard .category-card h3');
  const categoryCopy = document.querySelector('#dashboard .category-card .card-head p');
  const categoryList = document.querySelector('#dashboard .category-card ul');
  if (categoryTitle) categoryTitle.textContent = '投稿概況';
  if (categoryCopy) categoryCopy.textContent = '目前 Discord 比賽資料';
  if (categoryList) {
    const items = [
      ['已報名', statistics.registrations],
      ['今日投稿', statistics.todayRegistrations],
      ['已上傳作品', statistics.works],
      ['累計投票', statistics.votes],
    ];
    categoryList.replaceChildren(...items.map(([label, value]) => {
      const item = document.createElement('li');
      const marker = document.createElement('i');
      const count = document.createElement('b');
      item.append(marker, document.createTextNode(label), count);
      count.textContent = Number(value || 0).toLocaleString('zh-TW');
      return item;
    }));
  }
  renderLiveRegistrationTables(Array.isArray(data.registrations) ? data.registrations : []);
  renderLiveWorks(Array.isArray(data.works) ? data.works : []);
  renderLiveVotingStats(data);
}

function renderLiveDataPlaceholder() {
  liveAdminSnapshot = null;
  const metricCards = document.querySelectorAll('#dashboard .metric-grid article');
  const labels = ['總報名數', '今日投稿數', '已上傳作品', '總投票數'];
  metricCards.forEach((card, index) => {
    const labelElement = card.querySelector('p');
    const valueElement = card.querySelector('h2');
    const detailElement = card.querySelector('small');
    if (labelElement) labelElement.textContent = labels[index];
    if (valueElement) valueElement.textContent = '—';
    if (detailElement) detailElement.textContent = '尚未同步 Discord 資料';
  });
  const greeting = document.querySelector('#dashboard .admin-title h1');
  const chartTitle = document.querySelector('#dashboard .chart-card h3');
  const chartCopy = document.querySelector('#dashboard .chart-card .card-head p');
  const categoryTitle = document.querySelector('#dashboard .category-card h3');
  const categoryCopy = document.querySelector('#dashboard .category-card .card-head p');
  const categoryList = document.querySelector('#dashboard .category-card ul');
  if (greeting) greeting.textContent = '早安，管理員 ☼';
  if (chartTitle) chartTitle.textContent = '等待資料連接';
  if (chartCopy) chartCopy.textContent = '請使用 Discord 管理員帳號連接資料';
  if (categoryTitle) categoryTitle.textContent = '投稿概況';
  if (categoryCopy) categoryCopy.textContent = '尚未同步';
  if (categoryList) categoryList.replaceChildren();
  renderLiveRegistrationTables([]);
  renderLiveWorks([]);
  document.querySelectorAll('#votes-admin .vote-admin-stats article').forEach((card) => {
    const valueElement = card.querySelector('h2');
    const detailElement = card.querySelector('small');
    if (valueElement) valueElement.textContent = '—';
    if (detailElement) detailElement.textContent = '尚未同步 Discord 資料';
  });
}

async function hydrateLiveAdminDashboard() {
  const token = sessionStorage.getItem(liveAdminTokenKey);
  updateLiveDataConnectButton();
  if (!liveDataApiBaseUrl) {
    renderLiveDataPlaceholder();
    setLiveDataStatus('尚未設定 Discord 資料伺服器。', 'error');
    return false;
  }
  if (!token) {
    renderLiveDataPlaceholder();
    setLiveDataStatus('尚未連接 Discord 資料，請點選右上角「連接資料」。', 'pending');
    return false;
  }
  setLiveDataStatus('正在同步 Discord 資料…', 'pending');
  try {
    const response = await fetch(`${liveDataApiBaseUrl}/api/moyun/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) sessionStorage.removeItem(liveAdminTokenKey);
      renderLiveDataPlaceholder();
      updateLiveDataConnectButton();
      setLiveDataStatus('Discord 管理員授權已失效，請重新連接資料。', 'error');
      return false;
    }
    const data = await response.json();
    renderLiveDashboard(data);
    setLiveDataStatus(`已連接 Discord 資料 · 更新於 ${formatLiveAdminDate(data.updatedAt)}`, 'connected');
    updateLiveDataConnectButton();
    return true;
  } catch (error) {
    renderLiveDataPlaceholder();
    setLiveDataStatus('目前無法連接 Discord 資料伺服器，請稍後再試。', 'error');
    return false;
  }
}

initializeLiveDataControls();

const settingsFields = document.querySelectorAll('#settings .settings-card input');
const savedSettings = JSON.parse(window.localStorage.getItem('moyun-admin-settings') || '{}');
settingsFields.forEach((field) => {
  const settingName = field.previousElementSibling?.textContent || field.name;
  if (savedSettings[settingName]) field.value = savedSettings[settingName];
});

const saveSettingsButton = document.querySelector('#settings .settings-card .button.primary');
if (saveSettingsButton) saveSettingsButton.addEventListener('click', () => {
  const settings = {};
  settingsFields.forEach((field) => { settings[field.previousElementSibling?.textContent || field.name] = field.value; });
  window.localStorage.setItem('moyun-admin-settings', JSON.stringify(settings));
  showAdminToast('系統設定已儲存於此裝置');
});

const exportReportButton = document.querySelector('#dashboard .admin-title .button.primary');
if (exportReportButton) exportReportButton.addEventListener('click', () => {
  const statistics = liveAdminSnapshot?.stats || {};
  const rows = [
    ['項目', '數值'],
    ['總報名數', statistics.registrations ?? '尚未連接'],
    ['今日投稿數', statistics.todayRegistrations ?? '尚未連接'],
    ['已上傳作品', statistics.works ?? '尚未連接'],
    ['總投票數', statistics.votes ?? '尚未連接'],
  ];
  if (liveAdminSnapshot?.registrations?.length) {
    rows.push([], ['最新投稿', '作品名稱', '投稿時間', '票數']);
    liveAdminSnapshot.registrations.forEach((registration) => {
      rows.push([
        registration.displayName,
        registration.songTitle,
        formatLiveAdminDate(registration.createdAt),
        registration.votes,
      ]);
    });
  }
  const report = `\uFEFF${rows.map((row) => row.map((value) => (
    `"${String(value ?? '').replaceAll('"', '""')}"`
  )).join(',')).join('\n')}\n`;
  const reportUrl = URL.createObjectURL(new Blob([report], { type: 'text/csv;charset=utf-8' }));
  const downloadLink = document.createElement('a');
  downloadLink.href = reportUrl;
  downloadLink.download = '古韻新生-賽事報表.csv';
  downloadLink.click();
  URL.revokeObjectURL(reportUrl);
  showAdminToast('報表已下載');
});

document.querySelectorAll('.row-link').forEach((button) => button.addEventListener('click', () => {
  button.textContent = '已處理 ✓';
  showAdminToast('報名資料狀態已更新');
}));

const adminAuthGate = document.querySelector('.admin-auth-gate');
const adminLoginForm = document.querySelector('#admin-login-form');
const adminLoginEmail = document.querySelector('#admin-login-email');
const adminLoginPassword = document.querySelector('#admin-login-password');
const adminEmailField = document.querySelector('#admin-email-field');
const adminLoginKicker = document.querySelector('#admin-login-kicker');
const adminLoginTitle = document.querySelector('#admin-login-title');
const adminLoginMessage = document.querySelector('#admin-login-message');
const localAdminSessionKey = 'moyun-local-admin-unlocked';
const localAdminPasswordHash = '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5';

function configureAdminGate(useSupabase) {
  adminEmailField.hidden = !useSupabase;
  adminLoginEmail.disabled = !useSupabase;
  adminLoginEmail.required = useSupabase;
  adminLoginKicker.textContent = useSupabase ? 'ADMIN ACCESS' : 'ADMIN PASSWORD';
  adminLoginTitle.textContent = useSupabase ? '管理員登入' : '輸入管理員密碼';
  adminLoginPassword.placeholder = useSupabase ? '請輸入密碼' : '請輸入管理員密碼';
  adminLoginMessage.textContent = '';
}

async function localPasswordMatches(password) {
  const encodedPassword = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', encodedPassword);
  const hashedPassword = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  return hashedPassword === localAdminPasswordHash;
}

async function hydrateAdminDashboard() {
  if (!window.moyunSupabase) {
    await hydrateLiveAdminDashboard();
    return;
  }
  const [{ count: total }, { count: paid }, { count: reviewing }, { count: votes }] = await Promise.all([
    window.moyunSupabase.from('registrations').select('*', { count: 'exact', head: true }),
    window.moyunSupabase.from('registrations').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid'),
    window.moyunSupabase.from('registrations').select('*', { count: 'exact', head: true }).eq('review_status', 'pending'),
    window.moyunSupabase.from('votes').select('*', { count: 'exact', head: true }),
  ]);
  const metrics = document.querySelectorAll('.metric-grid h2');
  [total, paid, reviewing, votes].forEach((value, index) => { if (metrics[index]) metrics[index].textContent = (value || 0).toLocaleString('zh-TW'); });
}

window.requestAdminAccess = async () => {
  if (!window.moyunSupabase) {
    configureAdminGate(false);
    if (sessionStorage.getItem(localAdminSessionKey) === 'true') {
      adminAuthGate.hidden = true;
      await hydrateAdminDashboard();
      return;
    }
    adminAuthGate.hidden = false;
    return;
  }
  configureAdminGate(true);
  const { data: { user } } = await window.moyunSupabase.auth.getUser();
  if (!user) { adminAuthGate.hidden = false; return; }
  const { data: profile } = await window.moyunSupabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    adminAuthGate.hidden = false;
    adminLoginMessage.textContent = '此帳號沒有管理員權限。';
    return;
  }
  adminAuthGate.hidden = true;
  await hydrateAdminDashboard();
};

if (adminLoginForm) adminLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!window.moyunSupabase) {
    const passwordMatches = await localPasswordMatches(adminLoginPassword.value);
    if (!passwordMatches) { adminLoginMessage.textContent = '密碼不正確，請再試一次。'; return; }
    sessionStorage.setItem(localAdminSessionKey, 'true');
    adminLoginPassword.value = '';
    adminAuthGate.hidden = true;
    await hydrateAdminDashboard();
    showAdminToast('已進入管理後台。');
    return;
  }
  adminLoginMessage.textContent = '正在登入…';
  const { error } = await window.moyunSupabase.auth.signInWithPassword({
    email: adminLoginEmail.value,
    password: adminLoginPassword.value,
  });
  if (error) { adminLoginMessage.textContent = error.message; return; }
  await window.requestAdminAccess();
});

document.querySelector('[data-admin-signout]')?.addEventListener('click', async () => {
  if (window.moyunSupabase) await window.moyunSupabase.auth.signOut();
  sessionStorage.removeItem(localAdminSessionKey);
  sessionStorage.removeItem(liveAdminTokenKey);
  liveAdminSnapshot = null;
  adminAuthGate.hidden = true;
  showView('home');
  showAdminToast('已登出管理後台');
});

if (requestedView === 'admin') window.requestAdminAccess();

const spiritCards = new Map(Array.from(document.querySelectorAll('[data-spirit]')).map((card) => [card.dataset.spirit, card]));
const spiritTimers = new Map();
const spiritInteractions = {
  momo: {
    symbols: ['墨', '●', '✦', '丶'],
    messages: ['墨墨畫出了一段新旋律，靈感＋1。', '一筆落下，山水之間有了新的聲音。', '墨墨把你的心情寫進樂譜裡了。'],
    videoMessage: '墨墨正在揮毫作曲。',
    idleMessage: '墨墨收起毛筆，回到靜靜等候靈感的模樣。',
    notes: [261.63, 329.63, 392],
    wave: 'triangle',
    step: 0.1,
    duration: 0.54,
    gain: 0.034,
  },
  yeye: {
    symbols: ['♪', '♥', '汪', '♫'],
    messages: ['夜夜搖著尾巴唱起晚安曲，陪伴值＋1。', '汪！夜夜用笑容點亮今晚的旋律。', '夜夜把你的心情唱成一首溫暖的歌。'],
    videoMessage: '夜夜正在為你唱一段暖暖的旋律。',
    idleMessage: '夜夜搖搖尾巴，回到陪伴你的待機狀態。',
    notes: [392, 493.88, 587.33, 659.25],
    wave: 'sine',
    step: 0.12,
    duration: 0.62,
    gain: 0.028,
  },
  lulu: {
    symbols: ['咚', '●', '✦', '鼓'],
    messages: ['律律敲響節拍，活力值全滿！', '咚、咚、鏘！律律邀請你一起搖擺。', '節奏已啟動，下一個音符交給你。'],
    videoMessage: '律律正在喚醒水墨裡的節拍。',
    idleMessage: '律律收住節拍，回到蓄勢待發的待機狀態。',
    notes: [130.81, 196, 130.81, 261.63],
    wave: 'square',
    step: 0.11,
    duration: 0.22,
    gain: 0.018,
  },
};
let spiritAudioContext;
const spiritReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function playSpiritSound(interaction, isCombo = false) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    spiritAudioContext ||= new AudioContextClass();
    if (spiritAudioContext.state === 'suspended') spiritAudioContext.resume();
    const baseTime = spiritAudioContext.currentTime + 0.015;
    const notes = isCombo ? [...interaction.notes, interaction.notes[0] * 2] : interaction.notes;
    notes.forEach((frequency, index) => {
      const oscillator = spiritAudioContext.createOscillator();
      const volume = spiritAudioContext.createGain();
      const startTime = baseTime + (index * interaction.step);
      oscillator.type = interaction.wave;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      volume.gain.setValueAtTime(0.0001, startTime);
      volume.gain.exponentialRampToValueAtTime(interaction.gain, startTime + 0.025);
      volume.gain.exponentialRampToValueAtTime(0.0001, startTime + interaction.duration);
      oscillator.connect(volume);
      volume.connect(spiritAudioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + interaction.duration + 0.04);
    });
  } catch (error) {
    console.debug('Spirit audio unavailable', error);
  }
}

function releaseSpiritParticles(card, interaction, isCombo = false) {
  const effects = card.querySelector('.spirit-effects');
  if (!effects) return;
  effects.replaceChildren();
  const particleCount = isCombo ? 18 : 10;
  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('span');
    const horizontalDirection = index % 2 === 0 ? -1 : 1;
    const horizontalDistance = (34 + ((index * 17) % 72)) * horizontalDirection;
    particle.className = 'spirit-particle';
    particle.textContent = interaction.symbols[index % interaction.symbols.length];
    particle.style.setProperty('--x', `${horizontalDistance}px`);
    particle.style.setProperty('--y', `${-78 - ((index * 29) % 120)}px`);
    particle.style.setProperty('--rotation', `${horizontalDirection * (18 + (index * 7))}deg`);
    particle.style.setProperty('--delay', `${(index % 5) * 0.055}s`);
    effects.append(particle);
  }
}

function triggerSpirit(spiritId) {
  const card = spiritCards.get(spiritId);
  const interaction = spiritInteractions[spiritId];
  if (!card || !interaction) return;
  const previousTimer = spiritTimers.get(spiritId);
  if (previousTimer) window.clearTimeout(previousTimer);
  const interactionCount = Number(card.dataset.interactionCount || 0);
  const nextInteractionCount = interactionCount + 1;
  const isCombo = nextInteractionCount % 3 === 0;
  card.classList.remove('is-playing', 'is-combo');
  void card.offsetWidth;
  card.classList.add('is-playing');
  if (isCombo) card.classList.add('is-combo');
  card.dataset.interactionCount = String(nextInteractionCount);
  card.dataset.reaction = String(((nextInteractionCount - 1) % 3) + 1);
  const response = card.querySelector('.spirit-response');
  if (response) response.textContent = `${interaction.messages[interactionCount % interaction.messages.length]}${isCombo ? ' 三次默契連擊成功！' : ''}`;
  releaseSpiritParticles(card, interaction, isCombo);
  playSpiritSound(interaction, isCombo);
  spiritTimers.set(spiritId, window.setTimeout(() => card.classList.remove('is-playing', 'is-combo'), 1900));
}

function stopSpiritVideo(spiritId, hasFinished = false) {
  const card = spiritCards.get(spiritId);
  const interaction = spiritInteractions[spiritId];
  const video = card?.querySelector('[data-spirit-video]');
  if (!card || !video) return;
  video.pause();
  try { video.currentTime = 0; } catch (_) { /* The browser has not loaded metadata yet. */ }
  card.classList.remove('is-video-playing');
  card.removeAttribute('aria-busy');
  if (hasFinished) {
    const response = card.querySelector('.spirit-response');
    if (response) response.textContent = interaction.idleMessage;
  }
}

function playSpiritVideo(spiritId) {
  const card = spiritCards.get(spiritId);
  const interaction = spiritInteractions[spiritId];
  const video = card?.querySelector('[data-spirit-video]');
  if (!card || !interaction || !video) return;
  spiritCards.forEach((_, otherSpiritId) => {
    if (otherSpiritId !== spiritId) stopSpiritVideo(otherSpiritId);
  });
  video.pause();
  try { video.currentTime = 0; } catch (_) { /* Metadata is still loading; play() will begin at the start. */ }
  card.classList.add('is-video-playing');
  card.setAttribute('aria-busy', 'true');
  const response = card.querySelector('.spirit-response');
  if (response) response.textContent = `${interaction.videoMessage} 影片結束後會回到待機。`;
  const playPromise = video.play();
  if (playPromise) {
    playPromise.catch(() => {
      stopSpiritVideo(spiritId);
      if (response) response.textContent = '影片暫時無法播放，請再試一次。';
    });
  }
}

document.querySelectorAll('[data-spirit-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const spiritId = button.dataset.spiritAction;
    triggerSpirit(spiritId);
    playSpiritVideo(spiritId);
  });
});

document.querySelectorAll('[data-spirit-video]').forEach((video) => {
  video.addEventListener('ended', () => stopSpiritVideo(video.dataset.spiritVideo, true));
  video.addEventListener('error', () => stopSpiritVideo(video.dataset.spiritVideo));
});

function resetSpiritGaze(card) {
  card.classList.remove('is-following');
  card.style.setProperty('--gaze-x', '0px');
  card.style.setProperty('--gaze-y', '0px');
}

document.querySelectorAll('.spirit-portrait').forEach((portrait) => {
  const card = portrait.closest('.spirit-card');
  if (!card) return;
  portrait.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || spiritReducedMotion.matches) return;
    const bounds = portrait.getBoundingClientRect();
    const horizontalRatio = ((event.clientX - bounds.left) / bounds.width) - 0.5;
    const verticalRatio = ((event.clientY - bounds.top) / bounds.height) - 0.5;
    card.classList.add('is-following');
    card.style.setProperty('--gaze-x', `${horizontalRatio * 10}px`);
    card.style.setProperty('--gaze-y', `${verticalRatio * 7}px`);
  });
  portrait.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || spiritReducedMotion.matches) return;
    const bounds = portrait.getBoundingClientRect();
    const horizontalRatio = ((event.clientX - bounds.left) / bounds.width) - 0.5;
    const verticalRatio = ((event.clientY - bounds.top) / bounds.height) - 0.5;
    card.classList.add('is-following');
    card.style.setProperty('--gaze-x', `${horizontalRatio * 8}px`);
    card.style.setProperty('--gaze-y', `${verticalRatio * 5}px`);
    window.setTimeout(() => resetSpiritGaze(card), 520);
  });
  portrait.addEventListener('pointerleave', () => resetSpiritGaze(card));
  portrait.addEventListener('pointercancel', () => resetSpiritGaze(card));
  portrait.addEventListener('blur', () => resetSpiritGaze(card));
});

const spiritEnsembleButton = document.querySelector('[data-spirit-ensemble]');
if (spiritEnsembleButton) spiritEnsembleButton.addEventListener('click', () => {
  if (spiritEnsembleButton.classList.contains('is-playing')) return;
  const originalLabel = spiritEnsembleButton.innerHTML;
  spiritEnsembleButton.classList.add('is-playing');
  spiritEnsembleButton.innerHTML = '<span aria-hidden="true">♪</span> 三靈合奏中';
  ['momo', 'yeye', 'lulu'].forEach((spiritId, index) => {
    window.setTimeout(() => triggerSpirit(spiritId), index * 430);
  });
  window.setTimeout(() => {
    spiritEnsembleButton.classList.remove('is-playing');
    spiritEnsembleButton.innerHTML = originalLabel;
  }, 2350);
});
