(() => {
  const config = window.MOYUN_SUPABASE_CONFIG || {};
  const isConfigured = Boolean(config.url && config.publishableKey && window.supabase?.createClient);
  window.moyunSupabase = isConfigured
    ? window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;
  window.dispatchEvent(new CustomEvent('moyun:supabase-ready', { detail: { isConfigured } }));
})();
