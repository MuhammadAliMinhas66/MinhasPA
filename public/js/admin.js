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

let currentUsers = [];
let myUserId = null;
let activeFeatureUserId = null;
let activeFeatureSelection = [];

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
  usersBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading users…</span></div></td></tr>`;
  try {
    const res = await fetch(`${API}/users`);
    if (!res.ok) throw new Error('Request failed');
    currentUsers = await res.json();
    renderStats(currentUsers);
    renderTable(currentUsers);
  } catch (err) {
    usersBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't load users. Check your database connection.</span></div></td></tr>`;
  }
}

function renderStats(users) {
  document.getElementById('statTotal').textContent = users.length;
  document.getElementById('statActive').textContent = users.filter(u => u.is_active).length;
  document.getElementById('statPremium').textContent = users.filter(u => u.plan === 'premium').length;
  document.getElementById('statAdmins').textContent = users.filter(u => u.role === 'super_admin').length;
}

function renderTable(users) {
  if (users.length === 0) {
    usersBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No users yet</span></div></td></tr>`;
    return;
  }

  usersBody.innerHTML = users.map(u => {
    const isMe = u.id === myUserId;
    const disabledAttr = isMe ? 'disabled' : '';
    const onFeatures = FEATURE_KEYS.length - u.disabled_features.length;
    const allOn = u.disabled_features.length === 0;

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
        <select class="inline-select role-${u.role}" ${disabledAttr} onchange="updateUser(${u.id}, {role: this.value})">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
          <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super admin</option>
        </select>
      </td>
      <td>
        <select class="inline-select plan-${u.plan}" ${disabledAttr} onchange="updateUser(${u.id}, {plan: this.value})">
          <option value="free" ${u.plan === 'free' ? 'selected' : ''}>Free</option>
          <option value="premium" ${u.plan === 'premium' ? 'selected' : ''}>Premium</option>
        </select>
      </td>
      <td>
        <label class="status-toggle">
          <input type="checkbox" ${u.is_active ? 'checked' : ''} ${disabledAttr} onchange="updateUser(${u.id}, {is_active: this.checked})">
          <span class="toggle-track"></span>
          <span class="status-toggle-label">${u.is_active ? 'Active' : 'Disabled'}</span>
        </label>
      </td>
      <td>
        <button class="features-btn ${allOn ? 'all-on' : ''}" ${disabledAttr} onclick="openFeatureModal(${u.id})">
          <i class="ti ti-adjustments-horizontal"></i> ${onFeatures}/${FEATURE_KEYS.length} on
          ${!allOn ? `<span class="fb-count">${u.disabled_features.length} off</span>` : ''}
        </button>
      </td>
      <td>${u.created_at ? formatDate(u.created_at) : '—'}</td>
      <td>${u.last_login_at ? formatDate(u.last_login_at) : 'Never'}</td>
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
  } catch (err) {
    alert(err.message || 'Could not update this user.');
    loadUsers(); // revert any optimistic UI drift by re-syncing from the server
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

// ===== Helpers =====
function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

init();
