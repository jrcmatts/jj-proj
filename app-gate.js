/* Manager pages do not execute application scripts until role check and data load succeed. */
(async () => {
  'use strict';
  const type = document.body.dataset.workspace;
  const overlay = document.getElementById('jj-auth-overlay');
  const auth = window.JJAuth;
  let nativeLoadCompleted = false;
  window.addEventListener('load', e => { if (e.isTrusted) nativeLoadCompleted = true; });
  try {
    if (!auth) throw new Error('Authentication library could not load.');
    const identity = await auth.current();
    if (!identity || !auth.canAccess(identity, type)) {
      location.replace('index.html');
      return;
    }
    await window.JJCloud.load(type);
    const topbar = document.querySelector(type === 'studio' ? '.top-bar' : '.topbar');
    const menu = document.createElement('div');
    menu.className = 'jj-access-actions';
    const label = document.createElement('span');
    label.className = 'jj-user-label';
    label.style.fontSize = '11px';
    label.textContent = `${identity.name} · ${identity.role}`;
    const back = document.createElement('a');
    back.href = 'index.html';
    back.textContent = '⌂ Hub';
    back.addEventListener('click', e => { e.preventDefault(); void window.JJCloud.navigate('index.html'); });
    const signout = document.createElement('button');
    signout.type = 'button';
    signout.textContent = 'Sign out';
    signout.addEventListener('click', async () => {
      try { await window.JJCloud.flush(); await auth.signOut(); location.replace('index.html'); }
      catch (err) { alert('Unable to sign out safely: '+err.message+'\nPlease back up unsynced work.'); }
    });
    menu.append(label,back,signout);
    if (topbar) topbar.append(menu);
    document.documentElement.classList.remove('jj-auth-pending');
    document.getElementById('jj-auth-overlay').remove();
    const script = document.createElement('script');
    script.src = type+'.js';
    script.onload = () => {
      // Original managers installed load handlers within inline scripts.
      // Because loading now happens after authorization, replay load if already finished.
      if (nativeLoadCompleted) window.dispatchEvent(new Event('load'));
    };
    script.onerror = () => window.JJCloud.status('Manager application JavaScript failed to load.', 'error');
    document.body.append(script);
  } catch (error) {
    document.documentElement.classList.add('jj-auth-error');
    overlay.textContent = 'Could not open '+type+' Manager: '+error.message+' — Sign in and check Supabase configuration.';
    overlay.style.visibility = 'visible';
    const link = document.createElement('a');
    link.href = 'index.html';
    link.style.color = '#e7c780';
    link.style.marginLeft = '14px';
    link.textContent = 'Back to login';
    overlay.append(link);
  }
})();
