/* Shared authentication boundary for the J&J Workspace Hub.
 * Local mode = convenience demo ONLY. Supabase mode = authenticated, RLS-protected server data.
 */
(() => {
  'use strict';
  const cfg = window.JJ_CONFIG || {};
  const isCloud = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || '') &&
    /^(sb_publishable_|eyJ)/.test(cfg.supabasePublishableKey || '');
  const client = isCloud && window.supabase?.createClient?.(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const ACCOUNTS_KEY = 'jj_hub_accounts_v1';
  const SESSION_KEY = 'jj_hub_session_v1';
  const DATA_KEYS = ['jj_studio_v13', 'printShopState', 'jj_v11_data', 'jj_v11_inventory', 'jj_v11_job_orders'];

  function clearDataCache() {
    for (const key of DATA_KEYS) sessionStorage.removeItem(key);
  }
  const dataStorage = {
    getItem(key) { return (isCloud && DATA_KEYS.includes(key) ? sessionStorage : localStorage).getItem(key); },
    setItem(key, value) { return (isCloud && DATA_KEYS.includes(key) ? sessionStorage : localStorage).setItem(key, value); },
    removeItem(key) { return (isCloud && DATA_KEYS.includes(key) ? sessionStorage : localStorage).removeItem(key); }
  };

  async function current() {
    if (isCloud) {
      if (!client) throw new Error('Supabase SDK failed to load. Check your internet connection.');
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) return null;
      const { data: profile, error: profileError } = await client.from('user_profiles')
        .select('display_name,role,active').eq('id', data.user.id).maybeSingle();
      if (profileError) throw new Error('Unable to load account role: ' + profileError.message);
      if (!profile || !profile.active || !['owner','admin','staff'].includes(profile.role)) return null;
      return { id: data.user.id, email: data.user.email, username: data.user.email,
        name: profile.display_name || data.user.email, role: profile.role };
    }
    const sessionId = sessionStorage.getItem(SESSION_KEY);
    let accounts = [];
    try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); }
    catch (_) { return null; }
    return accounts.find(u => u.id === sessionId && ['owner','admin','staff'].includes(u.role)) || null;
  }
  async function signIn(email, password) {
    if (!isCloud || !client) throw new Error('Cloud mode is not configured.');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const profile = await current();
    if (!profile) {
      await client.auth.signOut();
      throw new Error('This account has no active Owner/Admin/Staff profile. Ask the owner to assign a role in Supabase.');
    }
    clearDataCache();
    return profile;
  }
  async function signOut() {
    clearDataCache();
    sessionStorage.removeItem(SESSION_KEY);
    if (isCloud && client) await client.auth.signOut();
  }
  const canAccess = (identity, workspace) => identity && (
    identity.role === 'owner' || identity.role === 'admin' || (identity.role === 'staff' && workspace === 'press')
  );
  window.JJDataStore = dataStorage;
  window.JJAuth = Object.freeze({ isCloud, client, current, signIn, signOut, canAccess, clearDataCache });
})();
