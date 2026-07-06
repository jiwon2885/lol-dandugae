/* ===== Runtime public config loader ===== */
window.AppConfig = (() => {
  let cached = null;

  async function load() {
    if (cached) return cached;

    try {
      const res = await fetch('/api/app-config', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Config API returned ${res.status}`);
      const data = await res.json();
      cached = {
        supabaseUrl: typeof data.supabaseUrl === 'string' ? data.supabaseUrl : '',
        supabaseAnonKey: typeof data.supabaseAnonKey === 'string' ? data.supabaseAnonKey : '',
      };
    } catch (err) {
      console.error('[Config] Failed to load runtime config:', err);
      cached = { supabaseUrl: '', supabaseAnonKey: '' };
    }

    return cached;
  }

  return { load };
})();
