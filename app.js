const viewButtons = document.querySelectorAll('[data-view]');
const views = document.querySelectorAll('.view');
const navLinks = document.querySelectorAll('.main-nav a');
function showView(viewId) {
  views.forEach((view) => view.classList.toggle('active', view.id === viewId));
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.view === viewId));
  document.querySelector('.main-nav').classList.remove('open');
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
