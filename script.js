/* Routes the Hub UI to Supabase or its clearly labeled local-only demo. */
if (window.JJAuth?.isCloud) {
  const cloudLogin = document.createElement('script');
  cloudLogin.src = 'cloud-index.js';
  document.body.appendChild(cloudLogin);
} else {
  document.getElementById('jjConnectionNote').textContent = 'LOCAL DEMO ONLY — not a secure published login. Configure Supabase before using real business data.';
/* J&J Sports Wear | Workspace Hub
 * Browser-only account demo. It is NOT server-side authentication.
 * The linked manager HTML apps must independently implement access control.
 */
'use strict';

(() => {
  const USERS_KEY = 'jj_hub_accounts_v1';
  const SESSION_KEY = 'jj_hub_session_v1';
  const HASH_ITERATIONS = 210000;
  const text = (id) => document.getElementById(id);
  const roles = { owner: 'Owner', admin: 'Admin', staff: 'Staff' };

  const elements = {
    authView: text('authView'),
    appView: text('appView'),
    setupPanel: text('setupPanel'),
    loginPanel: text('loginPanel'),
    setupForm: text('setupForm'),
    loginForm: text('loginForm'),
    setupError: text('setupError'),
    loginError: text('loginError'),
    loginUsername: text('loginUsername'),
    loginPassword: text('loginPassword'),
    loginSubmit: text('loginSubmit'),
    managerTab: text('managerTab'),
    staffTab: text('staffTab'),
    togglePassword: text('togglePassword'),
    logoutButton: text('logoutButton'),
    currentName: text('currentName'),
    currentRole: text('currentRole'),
    userAvatar: text('userAvatar'),
    welcomeRolePill: text('welcomeRolePill'),
    welcomeDescription: text('welcomeDescription'),
    studioCard: text('studioCard'),
    pressCard: text('pressCard'),
    staffNotice: text('staffNotice'),
    teamSection: text('teamSection'),
    addUserToggle: text('addUserToggle'),
    addUserArea: text('addUserArea'),
    addUserForm: text('addUserForm'),
    addUserError: text('addUserError'),
    cancelAddUser: text('cancelAddUser'),
    userList: text('userList'),
    toast: text('toast'),
  };

  let accounts = [];
  let currentAccount = null;
  let selectedRole = 'manager';
  let toastTimeout;

  function readAccounts() {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('Local account data is not valid.');
    return data;
  }

  function saveAccounts() {
    localStorage.setItem(USERS_KEY, JSON.stringify(accounts));
  }

  function normalizeUsername(value) {
    return value.trim().toLowerCase();
  }

  function checkUserFields(name, username, password) {
    if (name.trim().length < 2 || name.trim().length > 50) {
      throw new Error('Enter a name of 2–50 characters.');
    }
    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      throw new Error('Username must be 3–24 letters, numbers, dots, hyphens or underscores.');
    }
    if (password.length < 10) {
      throw new Error('Password must contain at least 10 characters.');
    }
    if (accounts.some((user) => user.username === username)) {
      throw new Error('This username is already used.');
    }
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function hexToBytes(hex) {
    if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Invalid account salt.');
    return new Uint8Array(hex.match(/.{2}/g).map((chunk) => parseInt(chunk, 16)));
  }

  function requireCrypto() {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
      throw new Error('Secure password functions are unavailable. Run the Hub on localhost or HTTPS in a modern browser.');
    }
  }

  async function passwordVerifier(password, saltHex) {
    requireCrypto();
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: HASH_ITERATIONS, hash: 'SHA-256' },
      key, 256
    );
    return bytesToHex(new Uint8Array(bits));
  }

  async function createAccount(name, username, password, role) {
    username = normalizeUsername(username);
    checkUserFields(name, username, password);
    if (!Object.hasOwn(roles, role)) throw new Error('Invalid account role.');
    requireCrypto();
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const verifier = await passwordVerifier(password, salt);
    const account = {
      id: crypto.randomUUID ? crypto.randomUUID() : bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
      name: name.trim(), username, role, salt, verifier,
      createdAt: new Date().toISOString(),
    };
    accounts.push(account);
    try {
      saveAccounts();
    } catch (error) {
      accounts.pop();
      throw new Error('Account could not be saved. Check that browser storage is enabled.');
    }
    return account;
  }

  async function verifyPassword(account, password) {
    const candidate = await passwordVerifier(password, account.salt);
    // Compare without returning at the first differing character.
    let difference = candidate.length ^ account.verifier.length;
    for (let i = 0; i < Math.min(candidate.length, account.verifier.length); i++) {
      difference |= candidate.charCodeAt(i) ^ account.verifier.charCodeAt(i);
    }
    return difference === 0;
  }

  function showError(target, message) {
    target.textContent = message;
    target.hidden = false;
  }

  function clearError(target) {
    target.textContent = '';
    target.hidden = true;
  }

  function toast(message) {
    clearTimeout(toastTimeout);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimeout = setTimeout(() => { elements.toast.hidden = true; }, 4200);
  }

  function showAuth(panel) {
    currentAccount = null;
    elements.authView.hidden = false;
    elements.appView.hidden = true;
    elements.setupPanel.hidden = panel !== 'setup';
    elements.loginPanel.hidden = panel !== 'login';
    clearError(elements.setupError);
    clearError(elements.loginError);
  }

  function showLogin() {
    elements.loginForm.reset();
    selectRole('manager');
    showAuth('login');
  }

  function selectRole(role) {
    selectedRole = role;
    elements.managerTab.classList.toggle('is-active', role === 'manager');
    elements.staffTab.classList.toggle('is-active', role === 'staff');
    elements.managerTab.setAttribute('aria-pressed', String(role === 'manager'));
    elements.staffTab.setAttribute('aria-pressed', String(role === 'staff'));
    clearError(elements.loginError);
  }

  function signIn(account) {
    currentAccount = account;
    sessionStorage.setItem(SESSION_KEY, account.id);
    showApp();
  }

  function showApp() {
    if (!currentAccount) return;
    elements.authView.hidden = true;
    elements.appView.hidden = false;
    elements.currentName.textContent = currentAccount.name;
    elements.currentRole.textContent = roles[currentAccount.role] || 'Unknown';
    elements.userAvatar.textContent = currentAccount.name.trim().split(/\s+/).slice(0, 2).map((v) => v[0].toUpperCase()).join('');
    elements.welcomeRolePill.textContent = `${roles[currentAccount.role]} access`;

    const isStaff = currentAccount.role === 'staff';
    const isOwner = currentAccount.role === 'owner';
    elements.studioCard.hidden = isStaff;
    elements.staffNotice.hidden = !isStaff;
    elements.studioCard.parentElement.classList.toggle('one-card', isStaff);
    elements.welcomeDescription.textContent = isStaff
      ? 'Access your production workspace and keep work moving.'
      : 'Use Studio Manager for sales and operations, or Press Manager for production.';
    elements.teamSection.hidden = !isOwner;
    closeAddUser();
    if (isOwner) renderAccounts();
  }

  function closeAddUser() {
    elements.addUserArea.hidden = true;
    elements.addUserToggle.setAttribute('aria-expanded', 'false');
    elements.addUserForm.reset();
    clearError(elements.addUserError);
  }

  function createTextElement(tag, className, value) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = value;
    return node;
  }

  function renderAccounts() {
    elements.userList.replaceChildren();
    for (const account of accounts) {
      const row = createTextElement('div', 'user-row', '');
      const info = createTextElement('div', 'user-info', '');
      const avatar = createTextElement('span', 'avatar', account.name.trim().split(/\s+/).slice(0, 2).map((v) => v[0].toUpperCase()).join(''));
      const details = createTextElement('div', 'user-details', '');
      details.append(
        createTextElement('strong', '', account.name),
        createTextElement('span', '', `@${account.username}`)
      );
      info.append(avatar, details);
      const actions = createTextElement('div', 'user-actions', '');
      actions.append(createTextElement('span', 'user-role', roles[account.role] || 'Unknown'));

      if (account.role !== 'owner') {
        const resetButton = createTextElement('button', 'text-button', 'Reset password');
        resetButton.type = 'button';
        resetButton.addEventListener('click', () => resetPassword(account.id));
        const removeButton = createTextElement('button', 'text-button', 'Remove');
        removeButton.type = 'button';
        removeButton.addEventListener('click', () => removeAccount(account.id));
        actions.append(resetButton, removeButton);
      }
      row.append(info, actions);
      elements.userList.append(row);
    }
  }

  async function resetPassword(id) {
    if (!currentAccount || currentAccount.role !== 'owner') return;
    const account = accounts.find((user) => user.id === id && user.role !== 'owner');
    if (!account) return;
    const password = window.prompt(`New password for ${account.name} (10+ characters):`);
    if (password === null) return;
    if (password.length < 10) { toast('Password must have at least 10 characters.'); return; }
    try {
      requireCrypto();
      const newSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const newVerifier = await passwordVerifier(password, newSalt);
      const previousSalt = account.salt;
      const previousVerifier = account.verifier;
      account.salt = newSalt;
      account.verifier = newVerifier;
      try { saveAccounts(); }
      catch (error) { account.salt = previousSalt; account.verifier = previousVerifier; throw error; }
      toast(`Password updated for ${account.name}.`);
    } catch (error) { toast(error.message || 'Could not update password.'); }
  }

  function removeAccount(id) {
    if (!currentAccount || currentAccount.role !== 'owner') return;
    const account = accounts.find((user) => user.id === id && user.role !== 'owner');
    if (!account) return;
    if (!window.confirm(`Remove ${account.name} (@${account.username})?`)) return;
    const original = accounts;
    accounts = accounts.filter((user) => user.id !== id);
    try { saveAccounts(); }
    catch (error) { accounts = original; toast('Could not remove account.'); return; }
    renderAccounts();
    toast(`${account.name}'s account was removed.`);
  }

  elements.setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(elements.setupError);
    const submitButton = elements.setupForm.querySelector('[type="submit"]');
    if (accounts.length) { showLogin(); return; }
    const name = text('setupName').value;
    const username = text('setupUsername').value;
    const password = text('setupPassword').value;
    const confirmPassword = text('setupConfirm').value;
    if (password !== confirmPassword) {
      showError(elements.setupError, 'Passwords do not match.'); return;
    }
    submitButton.disabled = true;
    try {
      const account = await createAccount(name, username, password, 'owner');
      elements.setupForm.reset();
      signIn(account);
      toast('Owner account created. You are signed in.');
    } catch (error) { showError(elements.setupError, error.message || 'Could not create account.'); }
    finally { submitButton.disabled = false; }
  });

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(elements.loginError);
    const username = normalizeUsername(elements.loginUsername.value);
    const password = elements.loginPassword.value;
    const account = accounts.find((user) => user.username === username);
    const roleMatches = account && (selectedRole === 'staff'
      ? account.role === 'staff'
      : ['owner', 'admin'].includes(account.role));
    elements.loginSubmit.disabled = true;
    try {
      // Always show a generic error if username, account type or password is incorrect.
      if (!roleMatches || !(await verifyPassword(account, password))) {
        throw new Error('Incorrect username, password, or account type.');
      }
      elements.loginPassword.value = '';
      signIn(account);
    } catch (error) {
      showError(elements.loginError, error.message || 'Could not sign in.');
    } finally { elements.loginSubmit.disabled = false; }
  });

  elements.managerTab.addEventListener('click', () => selectRole('manager'));
  elements.staffTab.addEventListener('click', () => selectRole('staff'));
  elements.togglePassword.addEventListener('click', () => {
    const revealing = elements.loginPassword.type === 'password';
    elements.loginPassword.type = revealing ? 'text' : 'password';
    elements.togglePassword.textContent = revealing ? 'Hide' : 'Show';
    elements.togglePassword.setAttribute('aria-label', `${revealing ? 'Hide' : 'Show'} password`);
  });
  elements.logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
    toast('Signed out.');
  });
  elements.addUserToggle.addEventListener('click', () => {
    if (!currentAccount || currentAccount.role !== 'owner') return;
    const opening = elements.addUserArea.hidden;
    if (opening) {
      elements.addUserArea.hidden = false;
      elements.addUserToggle.setAttribute('aria-expanded', 'true');
      text('newUserName').focus();
    } else closeAddUser();
  });
  elements.cancelAddUser.addEventListener('click', closeAddUser);
  elements.addUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(elements.addUserError);
    if (!currentAccount || currentAccount.role !== 'owner') return;
    const role = text('newUserRole').value;
    if (!['admin', 'staff'].includes(role)) {
      showError(elements.addUserError, 'Please select Admin or Staff.'); return;
    }
    const submitButton = elements.addUserForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const account = await createAccount(
        text('newUserName').value, text('newUsername').value, text('newUserPassword').value, role
      );
      closeAddUser();
      renderAccounts();
      toast(`${roles[role]} account created for ${account.name}.`);
    } catch (error) { showError(elements.addUserError, error.message || 'Could not create account.'); }
    finally { submitButton.disabled = false; }
  });

  function boot() {
    try {
      accounts = readAccounts();
      if (accounts.length === 0) {
        sessionStorage.removeItem(SESSION_KEY);
        showAuth('setup');
        return;
      }
      const sessionId = sessionStorage.getItem(SESSION_KEY);
      const sessionAccount = accounts.find((user) => user.id === sessionId);
      if (sessionAccount && Object.hasOwn(roles, sessionAccount.role)) {
        currentAccount = sessionAccount;
        showApp();
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        showLogin();
      }
    } catch (error) {
      showAuth('setup');
      showError(elements.setupError, 'Browser storage could not be read. Check your browser settings or stored data before proceeding.');
      elements.setupForm.querySelector('[type="submit"]').disabled = true;
    }
  }

  boot();
})();

}
