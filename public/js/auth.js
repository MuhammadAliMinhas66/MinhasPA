// ===== Minhas Personal Assistant — auth (JWT) =====
// Handles: login form, register form, storing the token, attaching it to
// every API call automatically, logging out, and guarding protected pages.

const AUTH_TOKEN_KEY = 'mpa-token';
const AUTH_USER_KEY = 'mpa-user';

function getToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch (e) { return null; }
}

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null'); } catch (e) { return null; }
}

function setSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}

// ----- Global fetch interceptor -----
// Every existing page (dashboard.js, loans.js, etc.) just calls fetch('/api/...')
// with no auth headers. Rather than touching every one of those files, we
// wrap fetch once here so any request to our own /api/* endpoints
// automatically carries "Authorization: Bearer <token>" — and if the server
// ever says 401 (missing/expired token), we bounce straight to login.html.
(function installFetchInterceptor() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApiCall = url.startsWith('/api/') || url.startsWith('api/');

    let finalInit = init;
    if (isApiCall) {
      const token = getToken();
      finalInit = Object.assign({}, init);
      finalInit.headers = Object.assign({}, (init && init.headers) || {});
      if (token) finalInit.headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await originalFetch(input, finalInit);

    if (isApiCall && response.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
      clearSession();
      window.location.href = 'login.html';
    }

    return response;
  };
})();

// ----- Route guard (runs on every protected page) -----
// If this script loads and there's no token, the inline <head> script
// (see login.html/register.html pattern mirrored below) should already
// have redirected — this is the belt-and-braces check for pages that
// forgot it, plus it populates the sidebar's "logged in as" line.
function guardPage() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }
  renderSidebarUser();
  applyPlanBadges();
  enforceLiveAccess();
}

// Maps a page's data-page value (see the sidebar nav-item's data-page
// attribute) to the admin's feature-toggle key. Pages not listed here
// (dashboard, settings) aren't gated by a feature toggle.
const FEATURE_PAGE_MAP = {
  loans: 'loans', rent: 'rent', bills: 'bills', expenses: 'expenses',
  savings: 'savings', committees: 'committees', investments: 'investments', salary: 'salary',
};

// The inline <head> script already hid the page (html.mpa-gate) the
// instant it saw a token, before any of this content could flash on
// screen. This is the part that actually decides whether to reveal it:
// a fresh call to /api/auth/me (never the stale JWT or localStorage user)
// so an admin disabling an account or a feature takes effect on this
// user's very next page load — not just their next API call.
async function enforceLiveAccess() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) return; // fetch interceptor already handles this — it clears session and redirects
    if (res.status === 403 && data.code === 'ACCOUNT_DISABLED') {
      clearSession();
      window.location.replace('login.html?disabled=1');
      return;
    }
    if (!res.ok) {
      revealPage(); // couldn't verify (e.g. DB hiccup) — don't lock the user out over a network blip
      return;
    }

    const disabledFeatures = data.user.disabled_features || [];
    const merged = Object.assign({}, getStoredUser(), data.user);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(merged));

    const activeLink = document.querySelector('.nav-item.active[data-page]');
    const currentPage = activeLink ? activeLink.dataset.page : null;
    const requiredFeature = FEATURE_PAGE_MAP[currentPage];

    if (requiredFeature && disabledFeatures.includes(requiredFeature) && merged.role !== 'super_admin') {
      window.location.replace(`index.html?blocked=${encodeURIComponent(requiredFeature)}`);
      return;
    }

    markLockedNavItems(disabledFeatures, merged.role);
    revealPage();
  } catch (err) {
    revealPage(); // never leave the page permanently blank over a network error
  }
}

function revealPage() {
  document.documentElement.classList.remove('mpa-gate');
}

// Greys out sidebar links to any feature this account has disabled, and
// stops them navigating there at all — clicking shows the same message
// enforceLiveAccess() would show after the fact, just without the round trip.
function markLockedNavItems(disabledFeatures, role) {
  if (role === 'super_admin') return;
  Object.entries(FEATURE_PAGE_MAP).forEach(([page, feature]) => {
    if (!disabledFeatures.includes(feature)) return;
    const link = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (!link || link.classList.contains('active')) return; // don't lock the page you're already correctly blocked from — that redirect already fired
    link.classList.add('nav-item-locked');
    link.title = 'This feature has been disabled for your account';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showLockedToast();
    });
  });
}

function showLockedToast() {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--surface-2);border:1px solid var(--border-strong);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--text-primary);box-shadow:0 12px 28px -8px rgba(0,0,0,0.5);z-index:50';
  toast.textContent = 'This feature has been disabled for your account. Contact your admin.';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// If we just got bounced back here because a feature was disabled, say so.
(function showBlockedNotice() {
  const params = new URLSearchParams(window.location.search);
  const blocked = params.get('blocked');
  if (!blocked) return;
  window.addEventListener('DOMContentLoaded', () => {
    showLockedToast();
    window.history.replaceState({}, '', window.location.pathname);
  });
})();

// Shows a small "PRO" badge on the Investments sidebar link for anyone who
// isn't on the premium plan (and isn't a super_admin, who always has access).
// This is just a visual hint — the real enforcement is server-side
// (middleware/requirePremium.js on /api/investments and /api/market).
function applyPlanBadges() {
  const link = document.querySelector('.nav-item[data-page="investments"]');
  if (!link) return;

  const user = getStoredUser();
  const isPremium = user && (user.role === 'super_admin' || user.plan === 'premium');

  const existing = link.querySelector('.nav-pro-badge');
  if (isPremium) {
    existing?.remove();
  } else if (!existing) {
    const badge = document.createElement('span');
    badge.className = 'nav-pro-badge';
    badge.textContent = 'PRO';
    link.appendChild(badge);
  }
}

function renderSidebarUser() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer) return;
  const user = getStoredUser();
  const name = user ? (user.full_name || user.username) : 'Account';
  const isSuperAdmin = user && user.role === 'super_admin';

  footer.innerHTML = `
    <div class="auth-sidebar-user">
      <div class="auth-sidebar-user-row">
        <i class="ti ${isSuperAdmin ? 'ti-shield-lock' : 'ti-user-circle'}"></i>
        <span title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        ${isSuperAdmin ? '<span class="auth-role-badge" title="Super admin">Admin</span>' : ''}
      </div>
      <button type="button" class="auth-logout-btn" id="sidebarLogoutBtn" title="Log out">
        <i class="ti ti-logout-2"></i> Log out
      </button>
    </div>
  `;
  document.getElementById('sidebarLogoutBtn')?.addEventListener('click', logout);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ----- Password show/hide toggles (login + register pages) -----
document.querySelectorAll('.auth-toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const showing = target.type === 'text';
    target.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? '<i class="ti ti-eye"></i>' : '<i class="ti ti-eye-off"></i>';
  });
});

function showAuthError(msg) {
  const box = document.getElementById('authError');
  const text = document.getElementById('authErrorText');
  const success = document.getElementById('authSuccess');
  if (success) success.classList.remove('show');
  if (box && text) {
    text.textContent = msg;
    box.classList.add('show');
  }
}

function hideAuthMessages() {
  document.getElementById('authError')?.classList.remove('show');
  document.getElementById('authSuccess')?.classList.remove('show');
}

function setSubmitLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  const icon = btn.querySelector('i');
  const span = btn.querySelector('span');
  if (loading) {
    if (icon) icon.className = 'ti ti-loader-2';
    if (span) span.textContent = 'Please wait…';
  } else {
    if (icon) icon.className = btn.dataset.icon || icon.className;
    if (span) span.textContent = label;
  }
}

// ----- Login form -----
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const submitBtn = document.getElementById('loginSubmit');
  submitBtn.dataset.icon = 'ti ti-login-2';

  if (new URLSearchParams(window.location.search).get('disabled') === '1') {
    showAuthError('Your account has been disabled. Contact your admin.');
    window.history.replaceState({}, '', window.location.pathname);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthMessages();

    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!identifier || !password) {
      showAuthError('Enter your username/email and password.');
      return;
    }

    setSubmitLoading(submitBtn, true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();

      if (!res.ok) {
        showAuthError(data.error || 'Login failed — try again.');
        setSubmitLoading(submitBtn, false, 'Log in');
        return;
      }

      setSession(data.token, data.user);
      window.location.href = 'index.html';
    } catch (err) {
      showAuthError('Could not reach the server. Check your connection and try again.');
      setSubmitLoading(submitBtn, false, 'Log in');
    }
  });
}

// ----- Register form -----
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  const submitBtn = document.getElementById('registerSubmit');
  submitBtn.dataset.icon = 'ti ti-user-plus';

  const pwInput = document.getElementById('regPassword');
  const strengthBars = document.querySelectorAll('#regStrength .auth-strength-bar');
  const strengthLabel = document.getElementById('regStrengthLabel');

  function scorePassword(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0-4
  }

  const strengthMeta = [
    { label: 'Very weak', color: 'var(--danger)' },
    { label: 'Weak', color: 'var(--danger)' },
    { label: 'Okay', color: 'var(--warning)' },
    { label: 'Good', color: 'var(--success)' },
    { label: 'Strong', color: 'var(--success)' }
  ];

  pwInput?.addEventListener('input', () => {
    const score = pwInput.value ? Math.max(1, scorePassword(pwInput.value)) : 0;
    strengthBars.forEach((bar, i) => {
      bar.style.background = i < score ? strengthMeta[score].color : 'var(--surface-3)';
    });
    strengthLabel.textContent = pwInput.value ? strengthMeta[score].label : '\u00A0';
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthMessages();

    const full_name = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const password2 = document.getElementById('regPassword2').value;

    if (!full_name || !username || !email || !password || !password2) {
      showAuthError('Fill in every field to continue.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,40}$/.test(username)) {
      showAuthError('Username must be 3-40 characters: letters, numbers, underscore only.');
      return;
    }
    if (password.length < 8) {
      showAuthError('Password must be at least 8 characters.');
      return;
    }
    if (password !== password2) {
      showAuthError('Passwords don\u2019t match.');
      return;
    }

    setSubmitLoading(submitBtn, true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, username, email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        showAuthError(data.error || 'Registration failed — try again.');
        setSubmitLoading(submitBtn, false, 'Create account');
        return;
      }

      setSession(data.token, data.user);
      window.location.href = 'index.html';
    } catch (err) {
      showAuthError('Could not reach the server. Check your connection and try again.');
      setSubmitLoading(submitBtn, false, 'Create account');
    }
  });
}

// ----- Theme toggle on auth pages (login/register have their own button
// outside the sidebar, since there's no sidebar on those pages) -----
const authThemeBtn = document.getElementById('themeToggleBtn');
if (authThemeBtn && !document.querySelector('.sidebar')) {
  const icon = document.getElementById('themeToggleIcon');
  function syncAuthThemeIcon() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    if (icon) icon.className = `ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`;
  }
  syncAuthThemeIcon();
  authThemeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem('mpa-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    syncAuthThemeIcon();
  });
}

// ----- Run the guard automatically on every page that has a sidebar
// (i.e. every protected app page — login/register don't have one) -----
if (document.querySelector('.sidebar')) {
  guardPage();
}
