const viewButtons = document.querySelectorAll('[data-view]');
const views = document.querySelectorAll('.view');
const navLinks = document.querySelectorAll('.main-nav a');
const liveDataConfig = window.MOYUN_BACKEND_CONFIG || {};
const liveDataApiBaseUrl = String(liveDataConfig.apiBaseUrl || '').replace(/\/+$/, '');
let liveAdminSnapshot = null;

function openDiscordAdmin() {
  if (!liveDataApiBaseUrl) {
    showAdminToast('目前無法連接 Discord 管理後台，請稍後再試。');
    return;
  }
  window.location.assign(`${liveDataApiBaseUrl}/admin`);
}

function showView(viewId, updateHash = true) {
  if (viewId === 'admin') {
    openDiscordAdmin();
    return;
  }
  views.forEach((view) => view.classList.toggle('active', view.id === viewId));
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.view === viewId));
  document.querySelector('.main-nav').classList.remove('open');
  document.body.classList.remove('admin-mode');
  if (updateHash && window.location.hash !== `#${viewId}`) window.history.replaceState(null, '', `#${viewId}`);
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
  return window.location.hash.slice(1).split('?')[0];
}

function isKnownView(viewId) {
  return Array.from(views).some((view) => view.id === viewId);
}

const requestedView = getRequestedView();
if (requestedView && isKnownView(requestedView)) showView(requestedView, false);
window.addEventListener('hashchange', () => {
  const viewId = getRequestedView();
  if (viewId && isKnownView(viewId)) showView(viewId, false);
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
  button.textContent = 'Discord 管理後台 ↗';
}

function requestLiveDataAuthorization() {
  openDiscordAdmin();
}

function startDiscordRegistration() {
  if (!liveDataApiBaseUrl) {
    showAdminToast('目前無法連接 Discord 報名服務，請稍後再試。');
    return;
  }
  window.location.assign(`${liveDataApiBaseUrl}/register`);
}

function openLiveWorksManager() {
  if (!liveDataApiBaseUrl) {
    showAdminToast('目前無法連接作品上傳服務，請稍後再試。');
    return;
  }
  const adminUrl = liveAdminSnapshot?.adminUrl || `${liveDataApiBaseUrl}/admin`;
  const uploadUrl = new URL(adminUrl);
  uploadUrl.hash = 'proxy-registration';
  window.location.assign(uploadUrl.toString());
}

document.querySelectorAll('[data-discord-register]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    startDiscordRegistration();
  });
});

const publicCompetitionApiUrl = liveDataApiBaseUrl
  ? `${liveDataApiBaseUrl}/api/public/competition?contest=guyun`
  : '';
const publicWorksContainer = document.querySelector('[data-public-works]');
const scheduleContainer = document.querySelector('[data-competition-schedule]');
let countdownTarget = scheduleContainer?.dataset.deadline
  ? new Date(scheduleContainer.dataset.deadline)
  : null;
let countdownTimer;

function formatAudioTime(value) {
  if (!Number.isFinite(value) || value < 0) return '--:--';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function pauseOtherWorkPlayers(currentAudio) {
  document.querySelectorAll('.work-audio').forEach((audio) => {
    if (audio !== currentAudio && !audio.paused) audio.pause();
  });
}

function createWaveform() {
  const waveform = document.createElement('span');
  waveform.className = 'work-waveform';
  waveform.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 32; index += 1) {
    const bar = document.createElement('i');
    const height = 11 + ((index * 19 + 17) % 28);
    bar.style.setProperty('--height', `${height}px`);
    bar.style.setProperty('--delay', `${(index % 8) * -0.075}s`);
    waveform.append(bar);
  }
  return waveform;
}

function createPublicWorkCard(work, index) {
  const card = document.createElement('article');
  const artwork = document.createElement('div');
  const artworkLabel = document.createElement('span');
  const copy = document.createElement('div');
  const category = document.createElement('p');
  const title = document.createElement('h3');
  const description = document.createElement('p');
  const player = document.createElement('div');
  const playButton = document.createElement('button');
  const waveform = createWaveform();
  const time = document.createElement('span');
  const audio = document.createElement('audio');

  card.className = `work-card public-work-card variant-${(index % 3) + 1}`;
  artwork.className = 'work-image';
  artworkLabel.className = 'play';
  artworkLabel.textContent = String(index + 1).padStart(2, '0');
  artwork.append(artworkLabel);
  category.textContent = work.hasLyrics ? '古風音樂 · 含匿名歌詞' : '古風音樂 · 匿名展演';
  title.textContent = work.code || `匿名作品 ${String(index + 1).padStart(2, '0')}`;
  description.className = 'work-description';
  description.textContent = '作品資料將於投票結束後由主辦單位統一公開。';
  player.className = 'work-player';
  playButton.type = 'button';
  playButton.className = 'work-play-toggle';
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', `播放${title.textContent}`);
  time.className = 'work-time';
  time.textContent = '0:00 / --:--';
  audio.className = 'work-audio';
  audio.preload = 'none';
  audio.src = work.listenUrl;
  audio.setAttribute('controlsList', 'nodownload');

  playButton.addEventListener('click', () => {
    if (audio.paused) {
      pauseOtherWorkPlayers(audio);
      audio.play().catch(() => showAdminToast('音訊暫時無法播放，請稍後再試。'));
    } else {
      audio.pause();
    }
  });
  audio.addEventListener('play', () => {
    pauseOtherWorkPlayers(audio);
    card.classList.add('is-playing');
    playButton.textContent = 'Ⅱ';
    playButton.setAttribute('aria-label', `暫停${title.textContent}`);
  });
  audio.addEventListener('pause', () => {
    card.classList.remove('is-playing');
    playButton.textContent = '▶';
    playButton.setAttribute('aria-label', `播放${title.textContent}`);
  });
  audio.addEventListener('timeupdate', () => {
    const progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    waveform.style.setProperty('--progress', `${Math.min(100, progress)}%`);
    time.textContent = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}`;
  });
  audio.addEventListener('loadedmetadata', () => {
    time.textContent = `0:00 / ${formatAudioTime(audio.duration)}`;
  });
  audio.addEventListener('ended', () => {
    waveform.style.setProperty('--progress', '0%');
    audio.currentTime = 0;
  });

  player.append(playButton, waveform, time, audio);
  copy.append(category, title, description, player);
  card.append(artwork, copy);
  return card;
}

function renderPublicWorks(works) {
  if (!publicWorksContainer) return;
  if (!works.length) {
    const empty = document.createElement('div');
    const title = document.createElement('strong');
    const copy = document.createElement('p');
    const button = document.createElement('button');
    empty.className = 'works-empty';
    title.textContent = '第一首旋律，等待你投稿';
    copy.textContent = '目前尚無公開作品，登入 Discord 即可完成投稿。';
    button.type = 'button';
    button.textContent = '使用 Discord 登入投稿 →';
    button.addEventListener('click', startDiscordRegistration);
    empty.append(title, copy, button);
    publicWorksContainer.replaceChildren(empty);
    return;
  }
  publicWorksContainer.replaceChildren(...works.map(createPublicWorkCard));
}

function setCountdownValue(selector, value) {
  const element = scheduleContainer?.querySelector(selector);
  if (element) element.textContent = String(Math.max(0, value)).padStart(2, '0');
}

function updateCountdown() {
  if (!scheduleContainer || !countdownTarget || Number.isNaN(countdownTarget.valueOf())) return;
  const remaining = Math.max(0, countdownTarget.getTime() - Date.now());
  setCountdownValue('[data-countdown-days]', Math.floor(remaining / 86400000));
  setCountdownValue('[data-countdown-hours]', Math.floor((remaining / 3600000) % 24));
  setCountdownValue('[data-countdown-minutes]', Math.floor((remaining / 60000) % 60));
  setCountdownValue('[data-countdown-seconds]', Math.floor((remaining / 1000) % 60));
  if (remaining === 0 && countdownTimer) window.clearInterval(countdownTimer);
}

function updateScheduleStages(submission, voting) {
  const submissionStage = scheduleContainer?.querySelector('[data-schedule-stage="submission"]');
  const votingStage = scheduleContainer?.querySelector('[data-schedule-stage="voting"]');
  [submissionStage, votingStage].forEach((stage) => stage?.classList.remove('active', 'complete'));
  if (submission?.status === 'ended') submissionStage?.classList.add('complete');
  else submissionStage?.classList.add('active');
  if (submission?.status === 'ended' && voting?.status === 'open') votingStage?.classList.add('active');
  else if (voting?.status === 'ended') votingStage?.classList.add('complete');
}

function applyCompetitionSchedule(schedule) {
  if (!scheduleContainer || !schedule) return;
  const submission = schedule.submission || {};
  const voting = schedule.voting || {};
  const badge = scheduleContainer.querySelector('[data-live-status]');
  const period = scheduleContainer.querySelector('[data-live-period]');
  const label = scheduleContainer.querySelector('[data-countdown-label]');
  const fallbackDeadline = new Date(scheduleContainer.dataset.deadline);

  if (submission.status === 'upcoming' && submission.startAt) {
    countdownTarget = new Date(submission.startAt);
    if (badge) badge.textContent = '投稿即將開始';
    if (label) label.textContent = '投稿開始倒數';
  } else if (submission.status !== 'ended') {
    countdownTarget = submission.endAt ? new Date(submission.endAt) : fallbackDeadline;
    if (badge) badge.textContent = 'Discord 投稿進行中';
    if (label) label.textContent = '報名截止倒數';
  } else if (voting.status === 'upcoming' && voting.startAt) {
    countdownTarget = new Date(voting.startAt);
    if (badge) badge.textContent = '投稿已截止';
    if (label) label.textContent = '匿名投票開始倒數';
  } else if (voting.status === 'open' && voting.endAt) {
    countdownTarget = new Date(voting.endAt);
    if (badge) badge.textContent = '匿名投票進行中';
    if (label) label.textContent = '本階段投票截止倒數';
  } else {
    countdownTarget = null;
    if (badge) {
      badge.textContent = '本階段已結束';
      badge.dataset.state = 'ended';
    }
    if (label) label.textContent = '下一階段時間將另行公告';
    ['[data-countdown-days]', '[data-countdown-hours]', '[data-countdown-minutes]', '[data-countdown-seconds]']
      .forEach((selector) => setCountdownValue(selector, 0));
  }
  if (period && submission.endAt) {
    period.textContent = `報名期間：${submission.period}（台灣時間）`;
  }
  updateScheduleStages(submission, voting);
  updateCountdown();
}

async function hydratePublicCompetition() {
  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 1000);
  if (!publicCompetitionApiUrl) {
    renderPublicWorks([]);
    return;
  }
  try {
    const response = await fetch(publicCompetitionApiUrl, {
      headers: { Accept: 'application/json' },
      mode: 'cors',
    });
    if (!response.ok) throw new Error(`Competition API returned ${response.status}`);
    const data = await response.json();
    if (data.sourceAvailable === false) {
      renderPublicWorks([]);
      const officialVoteButton = document.querySelector('[data-open-official-vote]');
      if (officialVoteButton) {
        officialVoteButton.disabled = true;
        officialVoteButton.textContent = '正式投票尚未開放';
      }
      return;
    }
    renderPublicWorks(Array.isArray(data.works) ? data.works : []);
    applyCompetitionSchedule(data.schedule);
  } catch (error) {
    console.debug('Public competition data unavailable', error);
    if (publicWorksContainer) {
      const empty = document.createElement('div');
      const title = document.createElement('strong');
      const copy = document.createElement('p');
      const button = document.createElement('button');
      empty.className = 'works-empty';
      title.textContent = '作品展間正在同步';
      copy.textContent = '你仍可前往正式匿名展間聆聽作品。';
      button.type = 'button';
      button.textContent = '開啟正式作品展間 →';
      button.addEventListener('click', () => window.location.assign(`${liveDataApiBaseUrl}/vote`));
      empty.append(title, copy, button);
      publicWorksContainer.replaceChildren(empty);
    }
  }
}

async function shareCompetition(kind) {
  const registrationUrl = `${liveDataApiBaseUrl}/register`;
  const messages = {
    share: '古韻新生古風音樂大賽現正開放投稿，以匿名投票讓每一段旋律公平被聽見。',
    invite: '邀請你參加「古韻新生」古風音樂大賽！只要擁有 Discord 音樂創作者身分即可投稿。',
  };
  const text = `${messages[kind]}\n${registrationUrl}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: '古韻新生｜古風音樂大賽', text, url: registrationUrl });
      return;
    }
    await navigator.clipboard.writeText(text);
    window.open('https://discord.com/channels/@me', '_blank', 'noopener');
    showAdminToast('邀請文字已複製，可直接貼到 Discord。');
  } catch (error) {
    if (error?.name !== 'AbortError') showAdminToast('分享未完成，請再試一次。');
  }
}

document.querySelector('[data-share-discord]')?.addEventListener('click', () => shareCompetition('share'));
document.querySelector('[data-invite-creator]')?.addEventListener('click', () => shareCompetition('invite'));
document.querySelector('[data-open-official-vote]')?.addEventListener('click', () => {
  if (liveDataApiBaseUrl) window.location.assign(`${liveDataApiBaseUrl}/vote`);
});
hydratePublicCompetition();

document.querySelector('[data-admin-add-work]')?.addEventListener('click', openLiveWorksManager);

function initializeLiveDataControls() {
  const actionArea = document.querySelector('.admin-header > div:last-child');
  if (!actionArea || !liveDataApiBaseUrl || document.querySelector('[data-live-data-connect]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-connect-data';
  button.dataset.liveDataConnect = '';
  button.addEventListener('click', requestLiveDataAuthorization);
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
  openDiscordAdmin();
  return false;
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

window.requestAdminAccess = openDiscordAdmin;

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

function initializeSpiritPromptPanels() {
  spiritCards.forEach((card, spiritId) => {
    const copy = card.querySelector('.spirit-copy');
    if (!copy || copy.querySelector('[data-spirit-prompt-panel]')) return;
    const panel = document.createElement('section');
    const header = document.createElement('div');
    const label = document.createElement('span');
    const copyButton = document.createElement('button');
    const prompt = document.createElement('p');
    const hint = document.createElement('small');
    panel.className = 'spirit-prompt-card';
    panel.dataset.spiritPromptPanel = spiritId;
    panel.hidden = true;
    label.textContent = '歌曲靈感提示詞';
    copyButton.type = 'button';
    copyButton.className = 'spirit-prompt-copy';
    copyButton.textContent = '複製提示詞';
    copyButton.dataset.spiritPromptCopy = spiritId;
    prompt.dataset.spiritPromptText = spiritId;
    hint.textContent = '再次點擊寵物，可更換一則新靈感。';
    header.append(label, copyButton);
    panel.append(header, prompt, hint);
    copy.append(panel);
  });
}

async function copySpiritPrompt(spiritId, button) {
  const prompt = spiritCards.get(spiritId)?.querySelector('[data-spirit-prompt-text]')?.textContent;
  if (!prompt) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    button.textContent = '已複製 ✓';
    window.setTimeout(() => { button.textContent = '複製提示詞'; }, 1600);
  } catch (error) {
    button.textContent = '請長按文字複製';
    window.setTimeout(() => { button.textContent = '複製提示詞'; }, 2200);
  }
}

function revealSpiritPrompt(card, interaction, promptIndex) {
  window.dispatchEvent(new CustomEvent('mingyun:request', {
    detail: {
      spiritId: card.dataset.spirit,
      interactionCount: promptIndex + 1,
    },
  }));
}

initializeSpiritPromptPanels();
document.querySelectorAll('[data-spirit-prompt-copy]').forEach((button) => {
  button.addEventListener('click', () => copySpiritPrompt(button.dataset.spiritPromptCopy, button));
});

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
  if (response) response.textContent = `${interaction.messages[interactionCount % interaction.messages.length]} 已生成歌曲靈感。${isCombo ? ' 三次默契連擊成功！' : ''}`;
  revealSpiritPrompt(card, interaction, interactionCount);
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
