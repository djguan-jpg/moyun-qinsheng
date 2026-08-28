(() => {
  const link = document.querySelector('[data-gallery-back]');
  if (!link) return;
  link.addEventListener('click', (event) => {
    // Preserve normal link behavior, new-tab clicks and the no-JavaScript fallback.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      const previous = new URL(document.referrer);
      if (previous.origin === window.location.origin
          && previous.pathname !== window.location.pathname
          && window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    } catch (_) {
      // Direct links and external referrers fall back to the site's works page.
    }
  });
})();
