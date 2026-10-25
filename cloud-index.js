/* Alternative index login when Supabase configuration is enabled. */
(() => {
  const auth = window.JJAuth;
  const $ = id => document.getElementById(id);
  const login = $('loginForm'), error = $('loginError');
  $('setupPanel').hidden = true;
  $('loginPanel').hidden = false;
  const roleTabs = document.querySelector('.role-tabs');
  roleTabs.hidden = true;
  const username = $('loginUsername');
  username.type = 'email';
  username.placeholder = 'name@example.com';
  username.autocomplete = 'email';
  username.previousElementSibling.textContent = 'Email address';
  $('loginPanel').querySelector('.small-copy').textContent = 'Sign in using your Supabase email and password.';
  $('loginPanel').querySelector('.form-note').textContent = 'Accounts and roles are provisioned in Supabase Authentication and user_profiles.';
  $('teamSection').hidden = true;
  const note = $('jjConnectionNote');
  note.textContent = 'Cloud mode: Supabase Auth + role policies enabled';

  let identity = null;
  function showApp(user) {
    identity = user;
    $('authView').hidden = true;
    $('appView').hidden = false;
    $('currentName').textContent = user.name;
    $('currentRole').textContent = user.role;
    $('welcomeRolePill').textContent = user.role.charAt(0).toUpperCase()+user.role.slice(1)+' access';
    $('userAvatar').textContent = user.name.trim().split(/\s+/).slice(0,2).map(p=>p.charAt(0).toUpperCase()).join('');
    const staff = user.role === 'staff';
    $('studioCard').hidden = staff;
    $('staffNotice').hidden = !staff;
    $('studioCard').parentElement.classList.toggle('one-card',staff);
    $('welcomeDescription').textContent = staff
      ? 'Your production workspace is ready.'
      : 'Choose Studio Manager or Press Manager to begin.';
    $('teamSection').hidden = true;
    if (user.role === 'owner') {
      const h = document.createElement('p');
      h.style.fontSize = '12px'; h.style.opacity = '.7';
      h.textContent = 'Cloud users: add staff in Supabase Authentication, then assign roles in user_profiles (SQL instructions included).';
      $('teamSection').hidden = false;
      $('teamSection').querySelector('.section-topline p').replaceWith(h);
      $('addUserToggle').hidden = true;
      $('userList').textContent = 'Roles are managed securely in the Supabase Dashboard. Browser-based account creation is disabled in cloud mode.';
    }
  }
  function showLogin() {
    identity=null;
    $('appView').hidden=true;
    $('authView').hidden=false;
    login.reset();
  }
  login.addEventListener('submit', async e => {
    e.preventDefault();
    error.hidden = true;
    const button = $('loginSubmit');
    button.disabled=true;
    try {
      const user=await auth.signIn(username.value.trim(), $('loginPassword').value);
      showApp(user);
    } catch(err){error.textContent = err.message || 'Sign in failed';error.hidden=false;}
    finally{button.disabled=false;}
  });
  $('togglePassword').addEventListener('click', () => {
    const input=$('loginPassword');
    const show=input.type==='password';input.type=show?'text':'password';
    $('togglePassword').textContent=show?'Hide':'Show';
  });
  $('logoutButton').addEventListener('click', async () => {
    try { await auth.signOut(); showLogin(); }
    catch(e){alert('Sign out failed: '+e.message);}
  });
  (async()=>{
    try {
      const user = await auth.current();
      if(user) showApp(user); else showLogin();
    } catch(e){showLogin();error.hidden=false;error.textContent=e.message;}
  })();
})();
