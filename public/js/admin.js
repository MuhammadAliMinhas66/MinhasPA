const API = '/api/admin';

const FEATURE_META = {
  loans:       { label: 'Loans',            icon: 'ti-arrows-exchange' },
  rent:        { label: 'Rent',             icon: 'ti-home-2' },
  bills:       { label: 'Bills',            icon: 'ti-file-invoice' },
  expenses:    { label: 'Daily expenses',   icon: 'ti-receipt' },
  savings:     { label: 'Savings insights', icon: 'ti-trending-up' },
  committees:  { label: 'Committees',       icon: 'ti-users-group' },
  investments: { label: 'Investments',      icon: 'ti-building-bank' },
  salary:      { label: 'Salary calculator',icon: 'ti-calculator' },
};
const FEATURE_KEYS = Object.keys(FEATURE_META);

const RESOURCE_LABELS = {
  loans: 'Loans', rent: 'Rent', bills: 'Bills', expenses: 'Expenses',
  categories: 'Categories', settings: 'Settings', dashboard: 'Dashboard',
  salary: 'Salary', savings: 'Savings / Committees', investments: 'Investments',
  market: 'Market data', 'admin-users': 'Admin — user management',
};

const ACTION_LABELS = { create: 'Added', update: 'Edited', delete: 'Deleted' };
const ACTION_ICONS = { create: 'ti-plus', update: 'ti-pencil', delete: 'ti-trash' };

let currentUsers = [];
let myUserId = null;
let activeFeatureUserId = null;
let activeFeatureSelection = [];
let activeEditUserId = null;
let activeResetPwUserId = null;
let activeDeleteUserId = null;

const usersBody = document.getElementById('usersBody');
const featureModalOverlay = document.getElementById('featureModalOverlay');
const featureToggleList = document.getElementById('featureToggleList');
const featureModalTitle = document.getElementById('featureModalTitle');

async function init() {
  const me = getStoredUser();
  myUserId = me ? me.id : null;
  await loadUsers();
}

async function loadUsers() {
  usersBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading users…</span></div></td></tr>`;
  try {
    const res = await fetch(`${API}/users`);
    if (!res.ok) throw new Error('Request failed');
    currentUsers = await res.json();
    renderStats(currentUsers);
    renderTable(currentUsers);
    populateLogUserFilter(currentUsers);
  } catch (err) {
    usersBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't load users. Check your database connection.</span></div></td></tr>`;
  }
}

function renderStats(users) {
  document.getElementById('statTotal').textContent = users.length;
  document.getElementById('statActive').textContent = users.filter(u => u.is_active_now).length;
  document.getElementById('statPremium').textContent = users.filter(u => u.plan === 'premium').length;
  document.getElementById('statAdmins').textContent = users.filter(u => u.role === 'super_admin').length;
}

// ===== Activity status (replaces the old manual Active/Disabled toggle) =====
// Status is now derived entirely from the activity log — real usage, not a
// switch an admin has to remember to flip. "Active now" = a request in the
// last 15 minutes (matches the server's window in routes/admin.js).
function activityStatusHtml(u) {
  if (u.is_active_now) {
    return `<span class="activity-badge live"><i class="ti ti-circle-filled"></i> Active now</span>`;
  }
  if (!u.last_activity_at) {
    return `<span class="activity-badge none"><i class="ti ti-moon-stars"></i> No activity yet</span>`;
  }
  return `<span class="activity-badge idle"><i class="ti ti-clock"></i> ${escapeHtml(relativeTime(u.last_activity_at))}</span>`;
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function renderTable(users) {
  if (users.length === 0) {
    usersBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No users yet</span></div></td></tr>`;
    return;
  }

  usersBody.innerHTML = users.map(u => {
    const isMe = u.id === myUserId;
    const disabledAttr = isMe ? 'disabled' : '';
    const onFeatures = FEATURE_KEYS.length - u.disabled_features.length;
    const allOn = u.disabled_features.length === 0;
    const entriesLabel = u.entries_added === 1 ? '1 entry added' : `${u.entries_added} entries added`;

    return `
    <tr data-id="${u.id}">
      <td>
        <div class="person-cell">
          ${escapeHtml(u.full_name || u.username)}
          ${isMe ? '<span class="you-badge">(you)</span>' : ''}
          <div style="color:var(--text-tertiary,var(--text-secondary));font-size:11.5px;margin-top:2px">${escapeHtml(u.username)} · ${escapeHtml(u.email || '')}</div>
        </div>
      </td>
      <td>
        <select class="inline-select role-${u.role}" ${disabledAttr} onchange="updateUser('${u.id}', {role: this.value})">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
          <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super admin</option>
        </select>
      </td>
      <td>
        <select class="inline-select plan-${u.plan}" ${disabledAttr} onchange="updateUser('${u.id}', {plan: this.value})">
          <option value="free" ${u.plan === 'free' ? 'selected' : ''}>Free</option>
          <option value="premium" ${u.plan === 'premium' ? 'selected' : ''}>Premium</option>
        </select>
      </td>
      <td>
        ${activityStatusHtml(u)}
        <div class="entries-count">${escapeHtml(entriesLabel)}</div>
      </td>
      <td>
        <button class="features-btn ${allOn ? 'all-on' : ''}" ${disabledAttr} onclick="openFeatureModal('${u.id}')">
          <i class="ti ti-adjustments-horizontal"></i> ${onFeatures}/${FEATURE_KEYS.length} on
          ${!allOn ? `<span class="fb-count">${u.disabled_features.length} off</span>` : ''}
        </button>
      </td>
      <td>${u.created_at ? formatDate(u.created_at) : '—'}</td>
      <td>${u.last_login_at ? formatDate(u.last_login_at) : 'Never'}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Edit user" ${disabledAttr} onclick="openEditModal('${u.id}')"><i class="ti ti-pencil"></i></button>
          <button class="icon-btn" title="Reset password" ${disabledAttr} onclick="openResetPwModal('${u.id}')"><i class="ti ti-key"></i></button>
          <button class="icon-btn icon-btn-danger" title="Delete user" ${disabledAttr} onclick="openDeleteModal('${u.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

async function updateUser(id, patch) {
  try {
    const res = await fetch(`${API}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Update failed');
    }
    await loadUsers();
    return true;
  } catch (err) {
    alert(err.message || 'Could not update this user.');
    loadUsers(); // revert any optimistic UI drift by re-syncing from the server
    return false;
  }
}

// ===== Feature toggle popover =====
function openFeatureModal(id) {
  const u = currentUsers.find(x => x.id === id);
  if (!u) return;
  activeFeatureUserId = id;
  activeFeatureSelection = [...u.disabled_features];
  featureModalTitle.textContent = `Feature access — ${u.full_name || u.username}`;

  featureToggleList.innerHTML = FEATURE_KEYS.map(key => {
    const meta = FEATURE_META[key];
    const enabled = !activeFeatureSelection.includes(key);
    return `
      <div class="feature-toggle-row">
        <div class="feature-toggle-name"><i class="ti ${meta.icon}"></i> ${meta.label}</div>
        <label class="status-toggle">
          <input type="checkbox" data-feature="${key}" ${enabled ? 'checked' : ''} onchange="toggleFeatureSelection('${key}', this.checked)">
          <span class="toggle-track"></span>
        </label>
      </div>
    `;
  }).join('');

  featureModalOverlay.classList.add('open');
}

function toggleFeatureSelection(key, enabled) {
  if (enabled) {
    activeFeatureSelection = activeFeatureSelection.filter(k => k !== key);
  } else if (!activeFeatureSelection.includes(key)) {
    activeFeatureSelection.push(key);
  }
}

document.getElementById('featureModalClose').addEventListener('click', closeFeatureModal);
document.getElementById('featureCancelBtn').addEventListener('click', closeFeatureModal);
featureModalOverlay.addEventListener('click', (e) => { if (e.target === featureModalOverlay) closeFeatureModal(); });

function closeFeatureModal() {
  featureModalOverlay.classList.remove('open');
  activeFeatureUserId = null;
}

document.getElementById('featureSaveBtn').addEventListener('click', async () => {
  if (activeFeatureUserId === null) return;
  await updateUser(activeFeatureUserId, { disabled_features: activeFeatureSelection });
  closeFeatureModal();
});

// ===== Edit user modal =====
const editUserModalOverlay = document.getElementById('editUserModalOverlay');

function openEditModal(id) {
  const u = currentUsers.find(x => x.id === id);
  if (!u) return;
  activeEditUserId = id;
  document.getElementById('editUserModalTitle').textContent = `Edit — ${u.full_name || u.username}`;
  document.getElementById('editFullName').value = u.full_name || '';
  document.getElementById('editUsername').value = u.username || '';
  document.getElementById('editEmail').value = u.email || '';
  editUserModalOverlay.classList.add('open');
}

function closeEditModal() {
  editUserModalOverlay.classList.remove('open');
  activeEditUserId = null;
}

document.getElementById('editUserModalClose').addEventListener('click', closeEditModal);
document.getElementById('editUserCancelBtn').addEventListener('click', closeEditModal);
editUserModalOverlay.addEventListener('click', (e) => { if (e.target === editUserModalOverlay) closeEditModal(); });

document.getElementById('editUserSaveBtn').addEventListener('click', async () => {
  if (activeEditUserId === null) return;
  const full_name = document.getElementById('editFullName').value.trim();
  const username = document.getElementById('editUsername').value.trim();
  const email = document.getElementById('editEmail').value.trim();
  if (!full_name || !username || !email) {
    alert('All three fields are required.');
    return;
  }
  const ok = await updateUser(activeEditUserId, { full_name, username, email });
  if (ok) closeEditModal();
});

// ===== Reset password modal =====
const resetPwModalOverlay = document.getElementById('resetPwModalOverlay');
const resetPwForm = document.getElementById('resetPwForm');
const resetPwResult = document.getElementById('resetPwResult');

function openResetPwModal(id) {
  const u = currentUsers.find(x => x.id === id);
  if (!u) return;
  activeResetPwUserId = id;
  document.getElementById('resetPwModalTitle').textContent = `Reset password — ${u.full_name || u.username}`;
  setResetPwMode('generate');
  document.getElementById('resetPwInput').value = '';
  resetPwForm.style.display = '';
  resetPwResult.style.display = 'none';
  resetPwModalOverlay.classList.add('open');
}

function closeResetPwModal() {
  resetPwModalOverlay.classList.remove('open');
  activeResetPwUserId = null;
}

function setResetPwMode(mode) {
  const manual = mode === 'manual';
  document.getElementById('resetPwGenBtn').classList.toggle('active', !manual);
  document.getElementById('resetPwManualBtn').classList.toggle('active', manual);
  document.getElementById('resetPwManualRow').style.display = manual ? '' : 'none';
  document.getElementById('resetPwHint').textContent = manual
    ? 'The user will need this exact password to log in next time — share it with them yourself.'
    : 'A strong random password will be generated and shown once — copy it and send it to the user securely.';
}

document.getElementById('resetPwModalClose').addEventListener('click', closeResetPwModal);
document.getElementById('resetPwCancelBtn').addEventListener('click', closeResetPwModal);
document.getElementById('resetPwDoneBtn').addEventListener('click', closeResetPwModal);
resetPwModalOverlay.addEventListener('click', (e) => { if (e.target === resetPwModalOverlay) closeResetPwModal(); });

document.getElementById('resetPwConfirmBtn').addEventListener('click', async () => {
  if (activeResetPwUserId === null) return;
  const manual = document.getElementById('resetPwManualBtn').classList.contains('active');
  const body = {};
  if (manual) {
    const pw = document.getElementById('resetPwInput').value;
    if (pw.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    body.new_password = pw;
  }
  try {
    const res = await fetch(`${API}/users/${activeResetPwUserId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not reset password');

    if (data.generated && data.new_password) {
      document.getElementById('resetPwGenerated').textContent = data.new_password;
      resetPwForm.style.display = 'none';
      resetPwResult.style.display = '';
    } else {
      closeResetPwModal();
      alert('Password updated.');
    }
  } catch (err) {
    alert(err.message || 'Could not reset password.');
  }
});

document.getElementById('resetPwCopyBtn').addEventListener('click', () => {
  const text = document.getElementById('resetPwGenerated').textContent;
  navigator.clipboard?.writeText(text).then(() => {
    const btn = document.getElementById('resetPwCopyBtn');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-check"></i> Copied';
    setTimeout(() => { btn.innerHTML = original; }, 1500);
  }).catch(() => {});
});

// ===== Delete user modal =====
const deleteUserModalOverlay = document.getElementById('deleteUserModalOverlay');

function openDeleteModal(id) {
  const u = currentUsers.find(x => x.id === id);
  if (!u) return;
  activeDeleteUserId = id;
  document.getElementById('deleteUserMessage').textContent =
    `Delete ${u.full_name || u.username}? This permanently removes their account and every entry they created (loans, rent, bills, expenses, savings, committees, investments, salary). This can't be undone.`;
  deleteUserModalOverlay.classList.add('open');
}

function closeDeleteModal() {
  deleteUserModalOverlay.classList.remove('open');
  activeDeleteUserId = null;
}

document.getElementById('deleteUserModalClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteUserCancelBtn').addEventListener('click', closeDeleteModal);
deleteUserModalOverlay.addEventListener('click', (e) => { if (e.target === deleteUserModalOverlay) closeDeleteModal(); });

document.getElementById('deleteUserConfirmBtn').addEventListener('click', async () => {
  if (activeDeleteUserId === null) return;
  try {
    const res = await fetch(`${API}/users/${activeDeleteUserId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Could not delete this user.');
    }
    closeDeleteModal();
    await loadUsers();
  } catch (err) {
    alert(err.message || 'Could not delete this user.');
  }
});

// ===== Users / Activity log tab switching =====
function switchAdminView(view) {
  const usersView = document.getElementById('usersView');
  const logsView = document.getElementById('logsView');
  document.getElementById('tabUsersBtn').classList.toggle('active', view === 'users');
  document.getElementById('tabLogsBtn').classList.toggle('active', view === 'logs');
  usersView.style.display = view === 'users' ? '' : 'none';
  logsView.style.display = view === 'logs' ? '' : 'none';
  if (view === 'logs' && !logsLoadedOnce) {
    logsLoadedOnce = true;
    loadLogs(1);
  }
}

// ===== Activity log panel =====
let logsLoadedOnce = false;
let currentLogPage = 1;
let currentLogTotal = 0;
const LOG_PAGE_SIZE = 50;

function populateLogUserFilter(users) {
  const sel = document.getElementById('logUserFilter');
  const current = sel.value;
  sel.innerHTML = '<option value="">All users</option>' + users.map(u =>
    `<option value="${u.id}">${escapeHtml(u.full_name || u.username)}</option>`
  ).join('');
  sel.value = current;
}

function populateLogResourceFilter() {
  const sel = document.getElementById('logResourceFilter');
  if (sel.dataset.populated) return;
  sel.dataset.populated = '1';
  sel.innerHTML = '<option value="">All areas</option>' + Object.entries(RESOURCE_LABELS).map(([key, label]) =>
    `<option value="${key}">${escapeHtml(label)}</option>`
  ).join('');
}
populateLogResourceFilter();

async function loadLogs(page) {
  currentLogPage = page || 1;
  const logsBody = document.getElementById('logsBody');
  logsBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading activity…</span></div></td></tr>`;

  const params = new URLSearchParams({ page: currentLogPage, limit: LOG_PAGE_SIZE });
  const user = document.getElementById('logUserFilter').value;
  const resource = document.getElementById('logResourceFilter').value;
  const action = document.getElementById('logActionFilter').value;
  if (user) params.set('user', user);
  if (resource) params.set('resource', resource);
  if (action) params.set('action', action);

  try {
    const res = await fetch(`${API}/logs?${params.toString()}`);
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    currentLogTotal = data.total;
    renderLogs(data.logs);
    updateLogPager();
  } catch (err) {
    logsBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't load the activity log.</span></div></td></tr>`;
  }
}

function renderLogs(logs) {
  const logsBody = document.getElementById('logsBody');
  if (!logs.length) {
    logsBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No activity found</span></div></td></tr>`;
    return;
  }
  logsBody.innerHTML = logs.map(l => {
    const resourceLabel = RESOURCE_LABELS[l.resource] || l.resource;
    const actionLabel = ACTION_LABELS[l.action] || l.action;
    const actionIcon = ACTION_ICONS[l.action] || 'ti-dot';
    return `
    <tr>
      <td>${formatDateTime(l.created_at)}</td>
      <td>
        <div class="person-cell">
          ${escapeHtml(l.full_name || l.username || 'Unknown user')}
          <div style="color:var(--text-tertiary,var(--text-secondary));font-size:11.5px;margin-top:2px">${escapeHtml(l.email || '')}</div>
        </div>
      </td>
      <td><span class="action-badge action-${l.action}"><i class="ti ${actionIcon}"></i> ${escapeHtml(actionLabel)}</span></td>
      <td>${escapeHtml(resourceLabel)}</td>
      <td class="log-summary">${escapeHtml(l.summary || '—')}</td>
    </tr>
  `;
  }).join('');
}

function updateLogPager() {
  const totalPages = Math.max(1, Math.ceil(currentLogTotal / LOG_PAGE_SIZE));
  document.getElementById('logPageLabel').textContent = `Page ${currentLogPage} of ${totalPages} · ${currentLogTotal} total`;
  document.getElementById('logPrevBtn').disabled = currentLogPage <= 1;
  document.getElementById('logNextBtn').disabled = currentLogPage >= totalPages;
}

document.getElementById('logRefreshBtn').addEventListener('click', () => loadLogs(1));
document.getElementById('logUserFilter').addEventListener('change', () => loadLogs(1));
document.getElementById('logResourceFilter').addEventListener('change', () => loadLogs(1));
document.getElementById('logActionFilter').addEventListener('change', () => loadLogs(1));
document.getElementById('logPrevBtn').addEventListener('click', () => { if (currentLogPage > 1) loadLogs(currentLogPage - 1); });
document.getElementById('logNextBtn').addEventListener('click', () => loadLogs(currentLogPage + 1));

// ===== Helpers =====
function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  const date = new Date(d);
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

init();
