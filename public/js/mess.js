// ===== Mess (shared food) — page logic =====
const API = '/api/mess';
const LAST_GROUP_KEY = 'mpa-mess-last-group';

let groups = [];
let currentGroupId = null;
let currentGroup = null; // full detail: { id, name, currency, invite_code, my_role, members[] }
let currentDate = todayStr();
let currentDay = null; // { menu, expenses, members, totals }

function todayStr() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}
function showToast(msg, isError) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--surface-2);border:1px solid ${isError ? 'var(--danger)' : 'var(--border-strong)'};border-radius:10px;padding:12px 16px;font-size:13px;color:var(--text-primary);box-shadow:0 12px 28px -8px rgba(0,0,0,0.5);z-index:60;max-width:320px`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
async function apiFetch(url, opts) {
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* 204 etc */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ===== Boot =====
async function initMessPage() {
  await loadGroups();
  renderToolbar();

  if (groups.length === 0) {
    document.getElementById('messOnboardPanel').style.display = 'flex';
    document.getElementById('messMainArea').style.display = 'none';
    return;
  }

  document.getElementById('messOnboardPanel').style.display = 'none';
  document.getElementById('messMainArea').style.display = 'block';

  const remembered = localStorage.getItem(LAST_GROUP_KEY);
  const initialId = groups.find(g => g.id === remembered) ? remembered : groups[0].id;
  await selectGroup(initialId);
}

async function loadGroups() {
  try {
    groups = await apiFetch(`${API}/groups`);
  } catch (err) {
    console.error(err);
    groups = [];
    showToast(err.message, true);
  }
}

function renderToolbar() {
  const toolbar = document.getElementById('messToolbar');
  if (groups.length === 0) {
    toolbar.innerHTML = `
      <button class="btn btn-ghost" id="tbJoinBtn"><i class="ti ti-door-enter" style="font-size:15px"></i> Join</button>
      <button class="btn btn-primary" id="tbCreateBtn"><i class="ti ti-plus" style="font-size:15px"></i> Create group</button>
    `;
  } else {
    toolbar.innerHTML = `
      <select class="mess-group-select" id="tbGroupSelect">
        ${groups.map(g => `<option value="${g.id}" ${g.id === currentGroupId ? 'selected' : ''}>${escapeHtml(g.name)} (${g.member_count})</option>`).join('')}
      </select>
      <button class="btn btn-ghost" id="tbJoinBtn" title="Join another group"><i class="ti ti-door-enter" style="font-size:15px"></i></button>
      <button class="btn btn-primary" id="tbCreateBtn"><i class="ti ti-plus" style="font-size:15px"></i> New group</button>
    `;
    document.getElementById('tbGroupSelect').addEventListener('change', (e) => selectGroup(e.target.value));
  }
  document.getElementById('tbJoinBtn')?.addEventListener('click', () => openModal('joinGroupModalOverlay'));
  document.getElementById('tbCreateBtn')?.addEventListener('click', () => openModal('createGroupModalOverlay'));
}

async function selectGroup(groupId) {
  currentGroupId = groupId;
  localStorage.setItem(LAST_GROUP_KEY, groupId);
  await loadGroupDetail();
  await Promise.all([loadDay(currentDate), loadSummary(), loadFund()]);
}

// ===== Group detail (header, members, invite code) =====
async function loadGroupDetail() {
  try {
    currentGroup = await apiFetch(`${API}/groups/${currentGroupId}`);
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
    return;
  }

  document.getElementById('groupAvatar').textContent = initials(currentGroup.name);
  document.getElementById('groupTitle').textContent = currentGroup.name;
  document.getElementById('groupSub').textContent = `${currentGroup.members.length} member${currentGroup.members.length === 1 ? '' : 's'} · ${currentGroup.currency}`;
  document.getElementById('inviteCodeText').textContent = currentGroup.invite_code;

  const stack = document.getElementById('groupAvatarStack');
  const shown = currentGroup.members.slice(0, 4);
  const extra = currentGroup.members.length - shown.length;
  stack.innerHTML = shown.map(m => `<div class="avatar-circle" title="${escapeHtml(m.full_name)}">${initials(m.full_name)}</div>`).join('')
    + (extra > 0 ? `<div class="avatar-circle avatar-more">+${extra}</div>` : '');

  // Payer dropdown in the expense modal
  const paidBySelect = document.getElementById('expensePaidBy');
  paidBySelect.innerHTML = currentGroup.members.map(m => `<option value="${m.user_id}">${escapeHtml(m.full_name)}</option>`).join('');
}

// ===== Day: menu, attendance, expenses, hero totals =====
async function loadDay(date) {
  currentDate = date;
  document.getElementById('dayDateInput').value = date;

  const chipList = document.getElementById('menuChipList');
  const attList = document.getElementById('attendanceList');
  const expBody = document.getElementById('expenseTableBody');
  attList.innerHTML = `<div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading…</span></div>`;
  expBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading…</span></div></td></tr>`;

  try {
    currentDay = await apiFetch(`${API}/groups/${currentGroupId}/days/${date}`);
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
    return;
  }

  renderHero();
  renderMenu();
  renderAttendance();
  renderExpenses();
  renderTasks();
}

function renderHero() {
  const t = currentDay.totals;
  document.getElementById('heroTotal').textContent = `${currentGroup.currency} ${t.total_expense.toLocaleString()}`;
  document.getElementById('heroHeadcount').textContent = `${t.headcount} of ${currentDay.members.length}`;
  document.getElementById('heroPerHead').textContent = `${currentGroup.currency} ${t.per_head.toLocaleString()}`;
}

function isOwner() { return currentGroup?.my_role === 'owner'; }
function myUserId() { return getStoredUser()?.id; }

function renderMenu() {
  const chipList = document.getElementById('menuChipList');
  const items = currentDay.menu.items || [];
  const owner = isOwner();
  chipList.innerHTML = items.length
    ? items.map((item, i) => `<span class="menu-chip"><i class="ti ti-tools-kitchen-2"></i><span class="dish-name">${escapeHtml(item)}</span>${owner ? `<button type="button" data-idx="${i}" class="menu-chip-remove"><i class="ti ti-x"></i></button>` : ''}</span>`).join('')
    : `<span style="font-size:12px;color:var(--text-muted)">No dishes added yet</span>`;
  chipList.querySelectorAll('.menu-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const items = (currentDay.menu.items || []).slice();
      items.splice(idx, 1);
      saveMenu(items, document.getElementById('menuNotesInput').value);
    });
  });
  document.getElementById('menuNotesInput').value = currentDay.menu.notes || '';

  // Only Ali (the owner/admin) sets the menu — everyone else just reads it.
  document.getElementById('menuAddRow').style.display = owner ? 'flex' : 'none';
  const notesEl = document.getElementById('menuNotesInput');
  notesEl.readOnly = !owner;
  notesEl.placeholder = owner ? 'Notes (optional) — e.g. cooking turn, timing' : 'No notes added';
}

async function saveMenu(items, notes) {
  try {
    const menu = await apiFetch(`${API}/groups/${currentGroupId}/days/${currentDate}/menu`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, notes }),
    });
    currentDay.menu = menu;
    renderMenu();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

function renderAttendance() {
  const attList = document.getElementById('attendanceList');
  if (currentDay.members.length === 0) {
    attList.innerHTML = `<div class="empty-state"><i class="ti ti-users"></i><span>No members yet</span></div>`;
    return;
  }
  const owner = isOwner();
  const me = myUserId();
  attList.innerHTML = currentDay.members.map(m => {
    const canToggle = owner || m.user_id === me;
    return `
    <div class="attendance-row">
      <div class="attendance-name">${escapeHtml(m.full_name)}${m.role === 'owner' ? '<small>Owner</small>' : ''}${m.user_id === me ? '<small>You</small>' : ''}</div>
      <span class="attendance-status ${m.eating ? 'eating' : 'absent'}">${m.eating ? 'Eating' : 'Excluded'}</span>
      <div class="attendance-toggle ${m.eating ? 'on' : ''} ${canToggle ? '' : 'disabled'}" data-user="${m.user_id}" ${canToggle ? '' : 'title="Only the group owner can change someone else\'s attendance"'}><div class="attendance-toggle-dot"></div></div>
    </div>
  `;
  }).join('');
  attList.querySelectorAll('.attendance-toggle:not(.disabled)').forEach(el => {
    el.addEventListener('click', () => toggleAttendance(el.dataset.user, !el.classList.contains('on')));
  });
}

async function toggleAttendance(userId, eating) {
  // Update locally first so the toggle feels instant, then reconcile with
  // the server response — no need to refetch the whole day (menu, every
  // expense, every task) just because one person's attendance flipped.
  const member = currentDay.members.find(m => m.user_id === userId);
  if (member) member.eating = eating;
  renderAttendance();
  recomputeHeroLocally();

  try {
    await apiFetch(`${API}/groups/${currentGroupId}/days/${currentDate}/attendance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, eating }),
    });
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
    if (member) member.eating = !eating; // roll back the optimistic update
    renderAttendance();
    recomputeHeroLocally();
  }
}

// Recomputes headcount/per-head from the already-loaded day data instead
// of round-tripping to the server — attendance is the most-clicked control
// on this page, so this is the difference between snappy and laggy.
function recomputeHeroLocally() {
  const headcount = currentDay.members.filter(m => m.eating).length;
  const total = currentDay.totals.total_expense;
  const perHead = headcount > 0 ? Math.round((total / headcount) * 100) / 100 : 0;
  currentDay.totals.headcount = headcount;
  currentDay.totals.per_head = perHead;
  renderHero();
}

function memberName(userId) {
  const m = currentGroup?.members.find(mm => mm.user_id === userId);
  return m ? m.full_name : 'Former member';
}

const CATEGORY_LABELS = { ingredient: 'Ingredient', purchased: 'Purchased', other: 'Other' };

function renderExpenses() {
  const body = document.getElementById('expenseTableBody');
  if (currentDay.expenses.length === 0) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-shopping-cart"></i><span>Nothing logged for this day yet</span></div></td></tr>`;
    return;
  }
  body.innerHTML = currentDay.expenses.map(e => `
    <tr>
      <td><span class="mess-item-name">${escapeHtml(e.item_name)}</span>${e.notes ? `<div class="mess-item-qty">${escapeHtml(e.notes)}</div>` : ''}</td>
      <td><span class="category-badge ${e.category}">${CATEGORY_LABELS[e.category]}</span></td>
      <td class="mess-paid-by">${escapeHtml(memberName(e.paid_by))}</td>
      <td>${currentGroup.currency} ${Number(e.cost).toLocaleString()}</td>
      <td>
        <button type="button" class="icon-btn" data-edit="${e.id}" title="Edit"><i class="ti ti-pencil"></i></button>
        <button type="button" class="icon-btn danger" data-del="${e.id}" title="Delete"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openExpenseModal(btn.dataset.edit)));
  body.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => deleteExpense(btn.dataset.del)));
}

async function deleteExpense(id) {
  if (!confirm('Delete this item?')) return;
  try {
    await apiFetch(`${API}/groups/${currentGroupId}/expenses/${id}`, { method: 'DELETE' });
    await loadDay(currentDate);
    await loadSummary();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

// ===== Daily duties (cook / dishes / groceries / custom) =====
function renderTasks() {
  const list = document.getElementById('dutyList');
  const tasks = currentDay.tasks || [];
  const owner = isOwner();
  const me = myUserId();

  // Only Ali (owner/admin) assigns duties — dishwashing, groceries, etc.
  document.getElementById('dutyQuickAdd').style.display = owner ? 'flex' : 'none';
  document.getElementById('dutyCustomRow').style.display = owner ? 'flex' : 'none';

  if (tasks.length === 0) {
    list.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">${owner ? 'No duties assigned yet — tap a quick option above or add your own' : 'No duties assigned yet'}</span>`;
    return;
  }
  const memberOptions = (selectedId) => currentGroup.members.map(m =>
    `<option value="${m.user_id}" ${m.user_id === selectedId ? 'selected' : ''}>${escapeHtml(m.full_name)}</option>`
  ).join('');

  list.innerHTML = tasks.map(t => {
    const canToggle = owner || (t.assigned_to && t.assigned_to === me);
    return `
    <div class="duty-row ${t.status === 'done' ? 'done' : ''}">
      <div class="duty-check ${t.status === 'done' ? 'checked' : ''} ${canToggle ? '' : 'disabled'}" data-task="${t.id}" data-action="toggle"><i class="ti ti-check"></i></div>
      <span class="duty-name">${escapeHtml(t.task_name)}</span>
      ${owner
        ? `<select class="duty-assign-select" data-task="${t.id}" data-action="assign"><option value="">Unassigned</option>${memberOptions(t.assigned_to)}</select>`
        : `<span class="duty-assign-readonly">${t.assigned_to ? escapeHtml(memberName(t.assigned_to)) : 'Unassigned'}</span>`}
      ${owner ? `<button type="button" class="duty-delete-btn" data-task="${t.id}" data-action="delete"><i class="ti ti-trash"></i></button>` : ''}
    </div>
  `;
  }).join('');

  list.querySelectorAll('[data-action="toggle"]:not(.disabled)').forEach(el => {
    el.addEventListener('click', () => setTaskStatus(el.dataset.task, el.classList.contains('checked') ? 'pending' : 'done'));
  });
  list.querySelectorAll('[data-action="assign"]').forEach(el => {
    el.addEventListener('change', () => assignTask(el.dataset.task, el.value || null));
  });
  list.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', () => deleteTask(el.dataset.task));
  });
}

async function addTask(taskName, assignedTo) {
  const name = taskName.trim();
  if (!name) return;
  try {
    const task = await apiFetch(`${API}/groups/${currentGroupId}/days/${currentDate}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: name, assigned_to: assignedTo || null }),
    });
    currentDay.tasks = (currentDay.tasks || []).concat(task);
    renderTasks();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

async function setTaskStatus(taskId, status) {
  const task = currentDay.tasks.find(t => t.id === taskId);
  if (task) { task.status = status; renderTasks(); } // optimistic, same reasoning as attendance
  try {
    await apiFetch(`${API}/groups/${currentGroupId}/tasks/${taskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
    if (task) { task.status = status === 'done' ? 'pending' : 'done'; renderTasks(); }
  }
}

async function assignTask(taskId, userId) {
  try {
    const updated = await apiFetch(`${API}/groups/${currentGroupId}/tasks/${taskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_to: userId }),
    });
    const idx = currentDay.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) currentDay.tasks[idx] = updated;
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
    renderTasks(); // revert the <select> to the last known-good state
  }
}

async function deleteTask(taskId) {
  try {
    await apiFetch(`${API}/groups/${currentGroupId}/tasks/${taskId}`, { method: 'DELETE' });
    currentDay.tasks = currentDay.tasks.filter(t => t.id !== taskId);
    renderTasks();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

// ===== Expense modal =====
function openExpenseModal(expenseId) {
  const form = document.getElementById('expenseForm');
  form.reset();
  document.getElementById('expenseId').value = '';
  document.getElementById('expenseModalTitle').textContent = 'Add an item';

  if (expenseId) {
    const e = currentDay.expenses.find(x => x.id === expenseId);
    if (e) {
      document.getElementById('expenseModalTitle').textContent = 'Edit item';
      document.getElementById('expenseId').value = e.id;
      document.getElementById('expenseItemName').value = e.item_name;
      document.getElementById('expenseCategory').value = e.category;
      document.getElementById('expenseCost').value = e.cost;
      document.getElementById('expensePaidBy').value = e.paid_by;
      document.getElementById('expenseNotes').value = e.notes || '';
    }
  } else {
    document.getElementById('expensePaidBy').value = getStoredUser()?.id || currentGroup.members[0]?.user_id || '';
  }
  openModal('expenseModalOverlay');
}

async function submitExpenseForm(e) {
  e.preventDefault();
  const id = document.getElementById('expenseId').value;
  const payload = {
    item_name: document.getElementById('expenseItemName').value.trim(),
    category: document.getElementById('expenseCategory').value,
    cost: Number(document.getElementById('expenseCost').value),
    paid_by: document.getElementById('expensePaidBy').value,
    notes: document.getElementById('expenseNotes').value.trim() || null,
  };

  const btn = document.getElementById('expenseSaveBtn');
  btn.disabled = true;
  try {
    if (id) {
      await apiFetch(`${API}/groups/${currentGroupId}/expenses/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    } else {
      await apiFetch(`${API}/groups/${currentGroupId}/days/${currentDate}/expenses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    }
    closeModal('expenseModalOverlay');
    await loadDay(currentDate);
    await loadSummary();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ===== Mess fund (fixed per-person contributions) =====
let currentFund = null;

async function loadFund() {
  const body = document.getElementById('fundTableBody');
  body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading…</span></div></td></tr>`;
  try {
    currentFund = await apiFetch(`${API}/groups/${currentGroupId}/fund`);
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
    return;
  }
  renderFund();
}

function renderFund() {
  const owner = isOwner();
  const f = currentFund;

  document.getElementById('fundRoundBadge').textContent = `Round ${f.round}`;
  document.getElementById('fundCollected').textContent = `${currentGroup.currency} ${f.totals.collected_this_round.toLocaleString()}`;
  document.getElementById('fundSpent').textContent = `${currentGroup.currency} ${f.totals.total_spent_lifetime.toLocaleString()}`;
  const balanceEl = document.getElementById('fundBalance');
  balanceEl.textContent = `${currentGroup.currency} ${f.totals.fund_balance.toLocaleString()}`;
  balanceEl.className = 'fund-hero-stat-value ' + (f.totals.fund_balance >= 0 ? 'positive' : 'negative');

  document.getElementById('fundTargetOwnerRow').style.display = owner ? 'flex' : 'none';
  document.getElementById('fundTargetMemberRow').style.display = owner ? 'none' : 'flex';
  document.getElementById('fundTargetInput').value = f.target;
  document.getElementById('fundTargetReadonly').textContent = `${currentGroup.currency} ${f.target.toLocaleString()}`;

  const body = document.getElementById('fundTableBody');
  if (f.members.length === 0) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-users"></i><span>No members yet</span></div></td></tr>`;
    return;
  }
  body.innerHTML = f.members.map(m => `
    <tr>
      <td>${escapeHtml(m.full_name)}${m.role === 'owner' ? '<span class="mess-item-qty"> · Owner</span>' : ''}</td>
      <td>${currentGroup.currency} ${m.paid.toLocaleString()}</td>
      <td>${currentGroup.currency} ${m.remaining.toLocaleString()}</td>
      <td><span class="contrib-status ${m.status}">${m.status === 'paid' ? 'Paid' : m.status === 'partial' ? 'Partial' : 'Pending'}</span></td>
      <td>${owner ? `<button type="button" class="icon-btn" data-record="${m.user_id}" title="Record a payment"><i class="ti ti-plus"></i></button>` : ''}</td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-record]').forEach(btn => btn.addEventListener('click', () => openPaymentModal(btn.dataset.record)));
}

async function saveFundTarget() {
  const target = Number(document.getElementById('fundTargetInput').value);
  if (!Number.isFinite(target) || target < 0) { showToast('Enter a valid amount', true); return; }
  try {
    await apiFetch(`${API}/groups/${currentGroupId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contribution_target: target }),
    });
    showToast('Contribution target updated');
    await loadFund();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

async function startNewRound() {
  if (!confirm("Start a new collection round? Everyone's \"paid\" status resets to zero for the new round — last round's history is kept, not deleted.")) return;
  try {
    await apiFetch(`${API}/groups/${currentGroupId}/round`, { method: 'POST' });
    showToast('New round started');
    await loadFund();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

function openPaymentModal(memberId) {
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentMember').innerHTML = currentGroup.members.map(m => `<option value="${m.user_id}" ${m.user_id === memberId ? 'selected' : ''}>${escapeHtml(m.full_name)}</option>`).join('');
  document.getElementById('paymentDate').value = todayStr();
  openModal('paymentModalOverlay');
}

async function submitPaymentForm(e) {
  e.preventDefault();
  const payload = {
    member: document.getElementById('paymentMember').value,
    amount: Number(document.getElementById('paymentAmount').value),
    date: document.getElementById('paymentDate').value,
    notes: document.getElementById('paymentNotes').value.trim() || null,
  };
  const btn = document.getElementById('paymentSaveBtn');
  btn.disabled = true;
  try {
    await apiFetch(`${API}/groups/${currentGroupId}/contributions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    closeModal('paymentModalOverlay');
    showToast('Payment recorded');
    await loadFund();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ===== Summary / settle up =====
async function loadSummary() {
  const from = document.getElementById('summaryFromInput').value || currentDate.slice(0, 8) + '01';
  const to = document.getElementById('summaryToInput').value || currentDate;
  document.getElementById('summaryFromInput').value = from;
  document.getElementById('summaryToInput').value = to;

  const body = document.getElementById('summaryTableBody');
  body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading…</span></div></td></tr>`;

  try {
    const summary = await apiFetch(`${API}/groups/${currentGroupId}/summary?from=${from}&to=${to}`);
    if (summary.members.length === 0) {
      body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="ti ti-scale"></i><span>No members</span></div></td></tr>`;
      return;
    }
    body.innerHTML = summary.members.map(m => {
      const pillClass = m.balance > 0.5 ? 'owed' : m.balance < -0.5 ? 'owes' : 'settled';
      const pillText = m.balance > 0.5 ? `Gets back ${currentGroup.currency} ${Math.abs(m.balance).toLocaleString()}`
        : m.balance < -0.5 ? `Owes ${currentGroup.currency} ${Math.abs(m.balance).toLocaleString()}`
        : 'Settled';
      return `
        <tr>
          <td>${escapeHtml(m.full_name)}${m.role === 'owner' ? '<span class="mess-item-qty"> · Owner</span>' : ''}</td>
          <td>${currentGroup.currency} ${m.paid.toLocaleString()}</td>
          <td>${currentGroup.currency} ${m.share.toLocaleString()}</td>
          <td><span class="balance-pill ${pillClass}">${pillText}</span></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>${escapeHtml(err.message)}</span></div></td></tr>`;
  }
}

// ===== Members modal =====
async function openMembersModal() {
  const body = document.getElementById('membersModalBody');
  body.innerHTML = `<div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading…</span></div>`;
  openModal('membersModalOverlay');

  await loadGroupDetail(); // fresh member list
  const isOwner = currentGroup.my_role === 'owner';
  const me = getStoredUser();

  body.innerHTML = `
    <div class="form-row" style="margin-bottom:10px">
      <div class="invite-chip" id="membersInviteChip" style="width:100%;box-sizing:border-box;justify-content:center">
        <i class="ti ti-key"></i><span>${escapeHtml(currentGroup.invite_code)}</span><i class="ti ti-copy"></i>
      </div>
    </div>
    ${currentGroup.members.map(m => `
      <div class="member-manage-row">
        <div class="member-manage-name">${escapeHtml(m.full_name)}${m.username ? ` <span style="color:var(--text-secondary)">@${escapeHtml(m.username)}</span>` : ''}</div>
        ${m.role === 'owner' ? '<span class="member-manage-role">Owner</span>' : ''}
        ${isOwner && m.role !== 'owner' ? `<button type="button" class="icon-btn danger" data-remove="${m.user_id}" title="Remove"><i class="ti ti-user-minus"></i></button>` : ''}
      </div>
    `).join('')}
  `;

  document.getElementById('membersInviteChip').addEventListener('click', () => copyInviteCode());
  body.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => removeMember(btn.dataset.remove)));

  document.getElementById('leaveGroupBtn').style.display = isOwner ? 'none' : 'inline-flex';
  document.getElementById('regenerateCodeBtn').style.display = isOwner ? 'inline-flex' : 'none';
}

async function removeMember(userId) {
  if (!confirm('Remove this member from the group?')) return;
  try {
    await apiFetch(`${API}/groups/${currentGroupId}/members/${userId}`, { method: 'DELETE' });
    await openMembersModal();
    await loadDay(currentDate);
    await loadSummary();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

async function leaveGroup() {
  if (!confirm('Leave this mess group? You can rejoin later with the invite code.')) return;
  try {
    await apiFetch(`${API}/groups/${currentGroupId}/leave`, { method: 'DELETE' });
    closeModal('membersModalOverlay');
    localStorage.removeItem(LAST_GROUP_KEY);
    await initMessPage();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

async function regenerateCode() {
  if (!confirm('Generate a new invite code? The old code will stop working.')) return;
  try {
    const data = await apiFetch(`${API}/groups/${currentGroupId}/regenerate-code`, { method: 'POST' });
    currentGroup.invite_code = data.invite_code;
    document.getElementById('inviteCodeText').textContent = data.invite_code;
    await openMembersModal();
    showToast('New invite code generated');
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

function copyInviteCode() {
  if (!currentGroup) return;
  navigator.clipboard?.writeText(currentGroup.invite_code).then(() => showToast('Invite code copied')).catch(() => showToast(`Invite code: ${currentGroup.invite_code}`));
}

// ===== Create / join group =====
async function submitCreateGroup(e) {
  e.preventDefault();
  const name = document.getElementById('createGroupName').value.trim();
  const currency = document.getElementById('createGroupCurrency').value.trim() || 'Rs';
  const btn = document.getElementById('createGroupSaveBtn');
  btn.disabled = true;
  try {
    const group = await apiFetch(`${API}/groups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, currency }),
    });
    closeModal('createGroupModalOverlay');
    document.getElementById('createGroupForm').reset();
    await loadGroups();
    renderToolbar();
    document.getElementById('messOnboardPanel').style.display = 'none';
    document.getElementById('messMainArea').style.display = 'block';
    await selectGroup(group.id);
    showToast(`"${group.name}" created — share the invite code with your friends`);
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function submitJoinGroup(e) {
  e.preventDefault();
  const code = document.getElementById('joinGroupCode').value.trim().toUpperCase();
  const btn = document.getElementById('joinGroupSaveBtn');
  btn.disabled = true;
  try {
    const group = await apiFetch(`${API}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    closeModal('joinGroupModalOverlay');
    document.getElementById('joinGroupForm').reset();
    await loadGroups();
    renderToolbar();
    document.getElementById('messOnboardPanel').style.display = 'none';
    document.getElementById('messMainArea').style.display = 'block';
    await selectGroup(group.id);
    showToast(`Joined "${group.name}"`);
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ===== Modal helpers =====
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ===== Wire up static elements =====
document.getElementById('onboardCreateBtn')?.addEventListener('click', () => openModal('createGroupModalOverlay'));
document.getElementById('onboardJoinBtn')?.addEventListener('click', () => openModal('joinGroupModalOverlay'));

document.getElementById('createGroupForm').addEventListener('submit', submitCreateGroup);
document.getElementById('createGroupModalClose').addEventListener('click', () => closeModal('createGroupModalOverlay'));
document.getElementById('createGroupCancelBtn').addEventListener('click', () => closeModal('createGroupModalOverlay'));

document.getElementById('joinGroupForm').addEventListener('submit', submitJoinGroup);
document.getElementById('joinGroupModalClose').addEventListener('click', () => closeModal('joinGroupModalOverlay'));
document.getElementById('joinGroupCancelBtn').addEventListener('click', () => closeModal('joinGroupModalOverlay'));

document.getElementById('expenseForm').addEventListener('submit', submitExpenseForm);
document.getElementById('expenseModalClose').addEventListener('click', () => closeModal('expenseModalOverlay'));
document.getElementById('expenseCancelBtn').addEventListener('click', () => closeModal('expenseModalOverlay'));
document.getElementById('addExpenseBtn').addEventListener('click', () => openExpenseModal(null));

document.getElementById('manageMembersBtn').addEventListener('click', openMembersModal);
document.getElementById('membersModalClose').addEventListener('click', () => closeModal('membersModalOverlay'));
document.getElementById('leaveGroupBtn').addEventListener('click', leaveGroup);
document.getElementById('regenerateCodeBtn').addEventListener('click', regenerateCode);

document.getElementById('inviteChip').addEventListener('click', copyInviteCode);

document.getElementById('menuAddBtn').addEventListener('click', () => {
  const input = document.getElementById('menuItemInput');
  const val = input.value.trim();
  if (!val) return;
  const items = (currentDay?.menu.items || []).concat(val);
  input.value = '';
  saveMenu(items, document.getElementById('menuNotesInput').value);
});
document.getElementById('menuItemInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('menuAddBtn').click(); }
});
let menuNotesTimer = null;
document.getElementById('menuNotesInput').addEventListener('input', () => {
  clearTimeout(menuNotesTimer);
  menuNotesTimer = setTimeout(() => {
    saveMenu(currentDay?.menu.items || [], document.getElementById('menuNotesInput').value);
  }, 700);
});

document.getElementById('dutyQuickAdd').querySelectorAll('[data-duty]').forEach(btn => {
  btn.addEventListener('click', () => addTask(btn.dataset.duty, null));
});
document.getElementById('dutyCustomAddBtn').addEventListener('click', () => {
  const input = document.getElementById('dutyCustomInput');
  addTask(input.value, null);
  input.value = '';
});
document.getElementById('dutyCustomInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('dutyCustomAddBtn').click(); }
});

document.getElementById('dayDateInput').addEventListener('change', (e) => loadDay(e.target.value));
document.getElementById('dayPrevBtn').addEventListener('click', () => shiftDay(-1));
document.getElementById('dayNextBtn').addEventListener('click', () => shiftDay(1));
document.getElementById('dayTodayBtn').addEventListener('click', () => loadDay(todayStr()));
function shiftDay(delta) {
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  loadDay(d.toISOString().slice(0, 10));
}

document.getElementById('summaryFromInput').addEventListener('change', loadSummary);
document.getElementById('summaryToInput').addEventListener('change', loadSummary);

document.getElementById('fundTargetSaveBtn').addEventListener('click', saveFundTarget);
document.getElementById('fundNewRoundBtn').addEventListener('click', startNewRound);
document.getElementById('paymentForm').addEventListener('submit', submitPaymentForm);
document.getElementById('paymentModalClose').addEventListener('click', () => closeModal('paymentModalOverlay'));
document.getElementById('paymentCancelBtn').addEventListener('click', () => closeModal('paymentModalOverlay'));

// Close any open modal on backdrop click, same pattern as other pages
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// Default summary range = this month so far
(function initSummaryDates() {
  const to = todayStr();
  document.getElementById('summaryFromInput').value = to.slice(0, 8) + '01';
  document.getElementById('summaryToInput').value = to;
})();

initMessPage();
