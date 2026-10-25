/* Cloud snapshot adapter for the original localStorage-oriented apps.
 * Supabase uses a revision check to reject simultaneous stale edits.
 * This is a migration bridge, NOT yet normalized multi-user records.
 */
(() => {
  'use strict';
  const auth = window.JJAuth;
  const keys = { studio: 'jj_studio_v13', press: 'printShopState' };
  let workspace = null, revision = 0, queued = null, sending = false, fault = null, timer = null;
  let statusElement = null;

  function status(message, state = '') {
    if (!statusElement) {
      statusElement = document.createElement('div');
      statusElement.className = 'jj-sync-status';
      statusElement.setAttribute('role', 'status');
      document.body.appendChild(statusElement);
    }
    statusElement.textContent = message;
    statusElement.dataset.state = state;
  }
  async function load(type) {
    workspace = type;
    if (!auth.isCloud) {
      status('Local demo: records saved only in this browser');
      return;
    }
    if (!auth.client) throw new Error('Supabase SDK unavailable.');
    status('Loading '+type+' data from Supabase…');
    const { data, error } = await auth.client.from('workspace_snapshots')
      .select('payload,revision').eq('workspace', type).maybeSingle();
    if (error) throw new Error('Unable to load cloud records: ' + error.message);
    revision = data?.revision || 0;
    // In cloud mode the original apps read SESSION storage, never a persistent local data cache.
    for (const key of ['jj_studio_v13','printShopState','jj_v11_data','jj_v11_inventory','jj_v11_job_orders'])
      sessionStorage.removeItem(key);
    if (data?.payload) {
      window.JJDataStore.setItem(keys[type], JSON.stringify(data.payload));
    } else if (type === 'studio') {
      window.JJDataStore.setItem(keys.studio, JSON.stringify({version:13,transactions:[],inventory:[],jobOrders:[],quoteItems:[]}));
    }
    status('Supabase connected · '+type+' · revision '+revision, 'saved');
  }
  function scheduleSave(type, data) {
    if (!auth.isCloud) return;
    if (type !== workspace) return;
    queued = JSON.parse(JSON.stringify(data));
    status(fault ? 'Cloud save stopped: '+fault+'. Export backup before leaving.' : 'Saving changes to Supabase…', fault ? 'error' : '');
    if (fault) return;
    clearTimeout(timer);
    timer = setTimeout(drain, 350);
  }
  async function drain() {
    if (!auth.isCloud || fault || sending || queued === null) return;
    clearTimeout(timer);
    sending = true;
    const payload = queued;
    queued = null;
    try {
      const { data, error } = await auth.client.rpc('save_workspace_snapshot', {
        p_workspace: workspace, p_payload: payload, p_expected_revision: revision
      });
      if (error) throw error;
      revision = Number(data);
      status('Saved to Supabase · revision '+revision, 'saved');
    } catch (err) {
      queued = queued || payload;
      fault = err.message || 'Network or revision conflict';
      status('NOT synced: '+fault+'. Download your app backup before refreshing.', 'error');
      console.error('J&J cloud save error:', err);
    } finally {
      sending = false;
      if (queued !== null && !fault) void drain();
    }
  }
  async function flush() {
    clearTimeout(timer);
    if (queued !== null && !fault) await drain();
    while (sending) await new Promise(resolve => setTimeout(resolve, 60));
    if (fault || queued !== null) throw new Error(fault || 'Save is still pending');
  }
  async function navigate(url) {
    if (auth.isCloud) {
      try { await flush(); } catch (error) {
        alert('Cannot leave safely: '+error.message+'\nExport a JSON backup before navigating.');
        return;
      }
    }
    location.href = url;
  }
  window.addEventListener('beforeunload', (event) => {
    if (auth.isCloud && (sending || queued !== null)) { event.preventDefault(); event.returnValue = ''; }
  });
  window.JJCloud = Object.freeze({ load, scheduleSave, flush, navigate, status });
})();
