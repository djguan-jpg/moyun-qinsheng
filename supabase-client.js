(() => {
  const config = window.MOYUN_SUPABASE_CONFIG || {};
  const notify = (isConfigured) => window.dispatchEvent(new CustomEvent('moyun:supabase-ready', { detail: { isConfigured } }));
  const createClient = () => {
    if (!window.supabase?.createClient) { window.moyunSupabase = null; notify(false); return; }
    window.moyunSupabase = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    notify(true);
  };

  if (!config.url || !config.publishableKey) { window.moyunSupabase = null; notify(false); return; }
  if (window.supabase?.createClient) { createClient(); return; }

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.async = true;
  script.onload = createClient;
  script.onerror = () => { window.moyunSupabase = null; notify(false); };
  document.head.append(script);
})();
