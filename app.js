const viewButtons = document.querySelectorAll('[data-view]');
const views = document.querySelectorAll('.view');
const navLinks = document.querySelectorAll('.main-nav a');
function showView(viewId, updateHash = true) {
  views.forEach((view) => view.classList.toggle('active', view.id === viewId));
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.view === viewId));
  document.querySelector('.main-nav').classList.remove('open');
  document.body.classList.toggle('admin-mode', viewId === 'admin');
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
document.querySelectorAll('.tabbar button,.filters button,.news-cats button').forEach((button) => button.addEventListener('click', () => {
  const group = button.parentElement.querySelectorAll('button');
  group.forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
}));

const requestedView = window.location.hash.slice(1);
if (requestedView && document.getElementById(requestedView)) showView(requestedView, false);
window.addEventListener('hashchange', () => {
  const viewId = window.location.hash.slice(1);
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
  const report = '\uFEFF項目,數值\n總報名數,1284\n已完成繳費,1106\n待審核資料,24\n今日投票數,8947\n';
  const reportUrl = URL.createObjectURL(new Blob([report], { type: 'text/csv;charset=utf-8' }));
  const downloadLink = document.createElement('a');
  downloadLink.href = reportUrl;
  downloadLink.download = '墨韻琴聲-賽事報表.csv';
  downloadLink.click();
  URL.revokeObjectURL(reportUrl);
  showAdminToast('報表已下載');
});

document.querySelectorAll('.row-link').forEach((button) => button.addEventListener('click', () => {
  button.textContent = '已處理 ✓';
  showAdminToast('報名資料狀態已更新');
}));
