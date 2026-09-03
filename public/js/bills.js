const API = '/api/bills';
const CATEGORIES_API = '/api/bills/categories';

// ===== Elements =====
const pendingBillsList = document.getElementById('pendingBillsList');
const billsGrid = document.getElementById('billsGrid');
const billCatFilter = document.getElementById('billCatFilter');

const modalOverlay = document.getElementById('modalOverlay');
const billForm = document.getElementById('billForm');
const billCategorySelect = document.getElementById('billCategory');
const newCatBox = document.getElementById('newCatBox');
const newCatLabel = document.getElementById('newCatLabel');
const newCatPreviewIcon = document.getElementById('newCatPreviewIcon');
const newCatPreviewLabel = document.getElementById('newCatPreviewLabel');

const credSectionHeader = document.getElementById('credSectionHeader');
const credSectionBody = document.getElementById('credSectionBody');
const portalPwToggle = document.getElementById('portalPwToggle');
const portalPasswordInput = document.getElementById('portalPassword');

const payModalOverlay = document.getElementById('payModalOverlay');
const payForm = document.getElementById('payForm');

const credModalOverlay = document.getElementById('credModalOverlay');
const credModalBody = document.getElementById('credModalBody');
const credEditBtn = document.getElementById('credEditBtn');

const historyModalOverlay = document.getElementById('historyModalOverlay');
const historyBody = document.getElementById('historyBody');
const historyModalTitle = document.getElementById('historyModalTitle');

let CATEGORIES = [];
let BILLS = [];
let activeCategoryFilter = '';
let credModalBillId = null;

// ===== Auto icon/colour matching for new bill types (mirrors expenses.js) =====
const KEYWORD_ICON_MAP = [
  [['electric', 'bijli', 'power'], 'ti-bolt'],
  [['internet', 'wifi', 'broadband', 'fiber'], 'ti-wifi'],
  [['water', 'pani'], 'ti-droplet'],
  [['gas', 'sui'], 'ti-flame'],
  [['mobile', 'sim', 'phone', 'postpaid'], 'ti-device-mobile'],
  [['tv', 'cable', 'streaming', 'netflix', 'subscription'], 'ti-device-tv'],
  [['insurance', 'takaful'], 'ti-shield-check'],
  [['loan', 'emi', 'installment'], 'ti-credit-card'],
  [['maintenance', 'society', 'building'], 'ti-building-community'],
  [['other', 'misc'], 'ti-file-invoice'],
];
const ICON_POOL = [
  'ti-file-invoice', 'ti-receipt', 'ti-tag', 'ti-bulb', 'ti-router', 'ti-satellite',
  'ti-plug', 'ti-antenna', 'ti-battery', 'ti-server', 'ti-building', 'ti-home-bolt',
];
const COLOR_PALETTE = [
  '#d4a24e', '#2dd4bf', '#f2a93b', '#7c9eff', '#e5484d', '#c084fc', '#4ade80', '#f472b6',
  '#38bdf8', '#fb923c', '#a3e635', '#f87171', '#60a5fa', '#e879f9', '#facc15', '#34d399',
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function autoIconFor(label) {
  const text = String(label).toLowerCase();
  for (const [keywords, icon] of KEYWORD_ICON_MAP) {
    if (keywords.some(k => text.includes(k))) return icon;
  }
  return ICON_POOL[hashString(text) % ICON_POOL.length];
}
function autoColorFor(label) {
  return COLOR_PALETTE[hashString(String(label).toLowerCase()) % COLOR_PALETTE.length];
}

let selectedIcon = ICON_POOL[0];
let selectedColor = COLOR_PALETTE[0];

// ===== Categories =====
async function loadCategories() {
  try {
    const res = await fetch(CATEGORIES_API);
    if (!res.ok) throw new Error('Failed to load bill categories');
    CATEGORIES = await res.json();
  } catch (err) {
    CATEGORIES = [
      { key: 'electricity', label: 'Electricity', icon: 'ti-bolt', color: '#f2a93b', is_default: true },
      { key: 'internet', label: 'Internet', icon: 'ti-wifi', color: '#7c9eff', is_default: true },
      { key: 'others', label: 'Others', icon: 'ti-file-invoice', color: '#6b6960', is_default: true },
    ];
  }
  renderCategorySelect();
  renderCategoryFilter();
}

function renderCategorySelect(selectValue) {
  const options = CATEGORIES.map(c => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
  billCategorySelect.innerHTML = options + `<option value="__new__">+ Add new bill type…</option>`;
  if (selectValue) billCategorySelect.value = selectValue;
}

function renderCategoryFilter() {
  const chips = CATEGORIES.map(c => `
    <button type="button" class="bill-cat-chip ${activeCategoryFilter === c.key ? 'active' : ''}" data-filter="${c.key}" style="--cat-color:${c.color}">
      <i class="ti ${c.icon}"></i> ${escapeHtml(c.label)}
    </button>
  `).join('');
  billCatFilter.innerHTML = `
    <button type="button" class="bill-cat-chip ${activeCategoryFilter === '' ? 'active' : ''}" data-filter="">
      <i class="ti ti-apps"></i> All
    </button>
    ${chips}
  `;
  billCatFilter.querySelectorAll('.bill-cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategoryFilter = btn.dataset.filter;
      renderCategoryFilter();
      renderBillsGrid();
    });
  });
}

newCatLabel.addEventListener('input', updateNewCatPreview);
function updateNewCatPreview() {
  const label = newCatLabel.value.trim();
  selectedIcon = label ? autoIconFor(label) : ICON_POOL[0];
  selectedColor = label ? autoColorFor(label) : COLOR_PALETTE[0];
  newCatPreviewIcon.innerHTML = `<i class="ti ${selectedIcon}"></i>`;
  newCatPreviewIcon.style.setProperty('--preview-color', selectedColor);
  newCatPreviewLabel.textContent = label || 'Your new bill type';
}

billCategorySelect.addEventListener('change', () => {
  const isNew = billCategorySelect.value === '__new__';
  newCatBox.classList.toggle('open', isNew);
  if (isNew) {
    newCatLabel.value = '';
    updateNewCatPreview();
    setTimeout(() => newCatLabel.focus(), 50);
  }
});

async function createCategory(label, icon, color) {
  const res = await fetch(CATEGORIES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, icon, color }),
  });
  if (!res.ok) throw new Error('Failed to create bill type');
  const created = await res.json();
  CATEGORIES.push(created);
  return created;
}

function categoryMeta(key) {
  return CATEGORIES.find(c => c.key === key) || { label: key, icon: 'ti-file-invoice', color: '#6b6960' };
}

// ===== Load bills =====
async function loadBills() {
  try {
    const res = await fetch(API);
    if (res.status === 403) {
      billsGrid.innerHTML = `<div class="empty-state"><i class="ti ti-lock"></i><span>Bills is disabled for your account — contact your admin</span></div>`;
      pendingBillsList.innerHTML = '';
      return;
    }
    if (!res.ok) throw new Error('Request failed');
    BILLS = await res.json();
    renderStats();
    renderPending();
    renderBillsGrid();
  } catch (err) {
    console.error(err);
    billsGrid.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database. Check your .env and that SQL Server is running.</span></div>`;
    pendingBillsList.innerHTML = '';
  }
}

function isOverdue(dueDate) {
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function renderStats() {
  const pending = BILLS.filter(b => b.current && b.current.status === 'pending' && b.is_active);
  const paid = BILLS.filter(b => b.current && b.current.status === 'paid' && b.is_active);
  const overdue = pending.filter(b => isOverdue(b.current.due_date));

  document.getElementById('statPendingCount').textContent = pending.length;
  const pendingTotal = pending.reduce((s, b) => s + (b.current.amount !== null ? b.current.total : 0), 0);
  document.getElementById('statPendingAmt').textContent = `Rs ${pendingTotal.toLocaleString()} known so far`;

  const paidTotal = paid.reduce((s, b) => s + b.current.total, 0);
  document.getElementById('statPaidAmt').textContent = `Rs ${paidTotal.toLocaleString()}`;

  document.getElementById('statOverdueCount').textContent = overdue.length;
}

function renderPending() {
  const pending = BILLS.filter(b => b.current && b.current.status === 'pending' && b.is_active)
    .sort((a, b) => new Date(a.current.due_date) - new Date(b.current.due_date));

  if (pending.length === 0) {
    pendingBillsList.innerHTML = `<div class="empty-state"><i class="ti ti-circle-check"></i><span>No pending bills — you're all caught up</span></div>`;
    return;
  }

  pendingBillsList.innerHTML = pending.map(b => {
    const cat = categoryMeta(b.category_key);
    const overdue = isOverdue(b.current.due_date);
    const days = Math.ceil((new Date(b.current.due_date) - new Date(new Date().toDateString())) / 86400000);
    const sub = overdue
      ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} · due ${formatDate(b.current.due_date)}`
      : days === 0 ? `Due today` : `Due in ${days} day${days === 1 ? '' : 's'} · ${formatDate(b.current.due_date)}`;

    return `
      <div class="bill-pending-row ${overdue ? 'overdue' : ''}">
        <span class="bill-pending-icon" style="--cat-color:${cat.color}"><i class="ti ${cat.icon}"></i></span>
        <div class="bill-pending-text">
          <span class="bill-pending-name">${escapeHtml(b.biller_name)}</span>
          <span class="bill-pending-sub">${escapeHtml(cat.label)} · ${sub}</span>
        </div>
        ${b.current.amount !== null
          ? `<span class="bill-pending-amt">Rs ${b.current.total.toLocaleString()}</span>`
          : `<span class="bill-pending-amt unset">Amount not set</span>`}
        <div class="bill-pending-actions">
          <button class="btn btn-pill" data-pay="${b.current.payment_id}" data-amount="${b.current.amount ?? ''}" data-extra="${b.current.extra_charges}">Mark paid</button>
        </div>
      </div>
    `;
  }).join('');

  pendingBillsList.querySelectorAll('[data-pay]').forEach(btn => {
    btn.addEventListener('click', () => openPayModal(btn.dataset.pay, btn.dataset.amount, btn.dataset.extra));
  });
}

function renderBillsGrid() {
  const filtered = activeCategoryFilter ? BILLS.filter(b => b.category_key === activeCategoryFilter) : BILLS;

  if (filtered.length === 0) {
    billsGrid.innerHTML = `<div class="empty-state"><i class="ti ti-file-invoice"></i><span>No bills yet — click "Add a bill" to start tracking one</span></div>`;
    return;
  }

  billsGrid.innerHTML = filtered.map(b => {
    const cat = categoryMeta(b.category_key);
    const statusBadge = !b.current ? ''
      : b.current.status === 'paid'
        ? `<span class="badge badge-success">Paid</span>`
        : isOverdue(b.current.due_date) ? `<span class="badge badge-danger">Overdue</span>` : `<span class="badge badge-warning">Pending</span>`;

    return `
      <div class="bill-card ${b.is_active ? '' : 'inactive'}">
        <div class="bill-card-top">
          <span class="bill-card-icon" style="--cat-color:${cat.color}"><i class="ti ${cat.icon}"></i></span>
          <div class="bill-card-title">
            <span class="bill-card-name">${escapeHtml(b.biller_name)}</span>
            <span class="bill-card-cat">${escapeHtml(cat.label)}${b.is_fixed_amount ? ' · <i class="ti ti-repeat" title="Same amount every month"></i> Fixed' : ''}</span>
          </div>
          <div class="bill-card-menu">
            <div class="actions-dropdown">
              <button class="icon-btn actions-trigger" title="Actions">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
              </button>
              <div class="actions-menu">
                <button onclick="closeActionMenus(); openEdit(${b.id})">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  Edit
                </button>
                <button onclick="closeActionMenus(); openCredentials(${b.id})">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Credentials
                </button>
                <button onclick="closeActionMenus(); openHistory(${b.id})">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
                  History
                </button>
                <button class="danger" onclick="closeActionMenus(); deleteBill(${b.id})">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="bill-card-row">
          <span class="label">Due every month</span>
          <span class="value">${ordinal(b.due_day)}</span>
        </div>
        <div class="bill-card-row">
          <span class="label">This month</span>
          <span class="value">${statusBadge || '—'}</span>
        </div>
        <div class="bill-card-row">
          <span class="label">Amount</span>
          <span class="value">${b.current && b.current.amount !== null ? `Rs ${b.current.total.toLocaleString()}` : '—'}</span>
        </div>
        ${b.has_credentials ? `<div class="bill-cred-flag"><i class="ti ti-lock"></i> Credentials saved</div>` : ''}

        <div class="bill-card-footer">
          ${b.current && b.current.status === 'pending'
            ? `<button class="btn btn-primary" data-pay="${b.current.payment_id}" data-amount="${b.current.amount ?? ''}" data-extra="${b.current.extra_charges}">Mark paid</button>`
            : `<button class="btn btn-ghost" onclick="openHistory(${b.id})">View history</button>`}
        </div>
      </div>
    `;
  }).join('');

  billsGrid.querySelectorAll('[data-pay]').forEach(btn => {
    btn.addEventListener('click', () => openPayModal(btn.dataset.pay, btn.dataset.amount, btn.dataset.extra));
  });
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ===== Add / Edit bill modal =====
document.getElementById('addBillBtn').addEventListener('click', openAdd);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

credSectionHeader.addEventListener('click', () => {
  credSectionHeader.classList.toggle('open');
  credSectionBody.classList.toggle('open');
});

portalPwToggle.addEventListener('click', () => {
  const showing = portalPasswordInput.type === 'text';
  portalPasswordInput.type = showing ? 'password' : 'text';
  portalPwToggle.innerHTML = showing ? '<i class="ti ti-eye"></i>' : '<i class="ti ti-eye-off"></i>';
});

function resetCredFields() {
  ['givenEmail', 'givenPhone', 'givenDate', 'portalEmail', 'portalPhone', 'portalPassword'].forEach(id => {
    document.getElementById(id).value = '';
  });
  credSectionHeader.classList.remove('open');
  credSectionBody.classList.remove('open');
}

function updateDefaultAmountLabel() {
  const fixed = document.getElementById('isFixedAmount').checked;
  document.getElementById('defaultAmountLabel').textContent = fixed
    ? 'Monthly amount'
    : 'First month charges (optional)';
  document.getElementById('defaultAmount').placeholder = fixed
    ? 'Same amount every month'
    : 'If you already know it';
}
document.getElementById('isFixedAmount').addEventListener('change', updateDefaultAmountLabel);

function openAdd() {
  billForm.reset();
  document.getElementById('billId').value = '';
  document.getElementById('modalTitle').textContent = 'Add a bill';
  newCatBox.classList.remove('open');
  renderCategorySelect();
  resetCredFields();
  document.getElementById('isFixedAmount').checked = false;
  updateDefaultAmountLabel();
  modalOverlay.classList.add('open');
}

async function openEdit(id) {
  const bill = BILLS.find(b => b.id === id);
  if (!bill) return;

  document.getElementById('billId').value = bill.id;
  document.getElementById('modalTitle').textContent = 'Edit bill';
  renderCategorySelect(bill.category_key);
  newCatBox.classList.remove('open');
  document.getElementById('billerName').value = bill.biller_name;
  document.getElementById('dueDay').value = bill.due_day;
  document.getElementById('defaultAmount').value = bill.default_amount ?? '';
  document.getElementById('billNotes').value = bill.notes || '';
  document.getElementById('isFixedAmount').checked = !!bill.is_fixed_amount;
  updateDefaultAmountLabel();
  resetCredFields();

  // Prefill credentials (decrypted) if any exist, so editing doesn't wipe them.
  if (bill.has_credentials) {
    try {
      const res = await fetch(`${API}/${bill.id}/credentials`);
      if (res.ok) {
        const c = await res.json();
        document.getElementById('givenEmail').value = c.given_email || '';
        document.getElementById('givenPhone').value = c.given_phone || '';
        document.getElementById('givenDate').value = c.given_date ? c.given_date.slice(0, 10) : '';
        document.getElementById('portalEmail').value = c.portal_email || '';
        document.getElementById('portalPhone').value = c.portal_phone || '';
        document.getElementById('portalPassword').value = c.portal_password || '';
      }
    } catch (err) { /* non-fatal — user can just re-enter */ }
  }

  modalOverlay.classList.add('open');
}
window.openEdit = openEdit;

function closeModal() {
  modalOverlay.classList.remove('open');
}

billForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('billId').value;
  const saveBtn = billForm.querySelector('button[type="submit"]');
  let categoryKey = billCategorySelect.value;

  if (categoryKey === '__new__') {
    const label = newCatLabel.value.trim();
    if (!label) { alert('Please name the new bill type.'); newCatLabel.focus(); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Creating bill type…';
    try {
      const created = await createCategory(label, selectedIcon, selectedColor);
      categoryKey = created.key;
      renderCategoryFilter();
    } catch (err) {
      alert('Could not create the new bill type. Please try again.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }
    saveBtn.textContent = 'Save';
  }

  const hasCreds = ['givenEmail', 'givenPhone', 'givenDate', 'portalEmail', 'portalPhone', 'portalPassword']
    .some(fid => document.getElementById(fid).value.trim());

  const payload = {
    category_key: categoryKey,
    biller_name: document.getElementById('billerName').value.trim(),
    due_day: parseInt(document.getElementById('dueDay').value, 10),
    default_amount: document.getElementById('defaultAmount').value || undefined,
    is_fixed_amount: document.getElementById('isFixedAmount').checked,
    notes: document.getElementById('billNotes').value.trim(),
  };
  if (hasCreds) {
    payload.credentials = {
      given_email: document.getElementById('givenEmail').value.trim(),
      given_phone: document.getElementById('givenPhone').value.trim(),
      given_date: document.getElementById('givenDate').value || null,
      portal_email: document.getElementById('portalEmail').value.trim(),
      portal_phone: document.getElementById('portalPhone').value.trim(),
      portal_password: document.getElementById('portalPassword').value,
    };
  }

  saveBtn.disabled = true;
  try {
    const res = await fetch(id ? `${API}/${id}` : API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }
    closeModal();
    loadBills();
  } catch (err) {
    alert(err.message);
  } finally {
    saveBtn.disabled = false;
  }
});

async function deleteBill(id) {
  if (!confirm('Delete this bill? Its full payment history will be deleted too.')) return;
  await fetch(`${API}/${id}`, { method: 'DELETE' });
  loadBills();
}
window.deleteBill = deleteBill;

// ===== Mark as paid modal =====
document.getElementById('payModalClose').addEventListener('click', closePayModal);
document.getElementById('payCancelBtn').addEventListener('click', closePayModal);
payModalOverlay.addEventListener('click', (e) => { if (e.target === payModalOverlay) closePayModal(); });

function openPayModal(paymentId, amount, extra) {
  document.getElementById('payPaymentId').value = paymentId;
  document.getElementById('payAmount').value = amount || '';
  document.getElementById('payExtra').value = extra && extra !== '0' ? extra : '';
  document.getElementById('paidOn').value = new Date().toISOString().slice(0, 10);
  document.getElementById('paidThrough').value = '';
  payModalOverlay.classList.add('open');
}
function closePayModal() {
  payModalOverlay.classList.remove('open');
}

payForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const paymentId = document.getElementById('payPaymentId').value;
  const payload = {
    amount: document.getElementById('payAmount').value,
    extra_charges: document.getElementById('payExtra').value || 0,
    paid_on: document.getElementById('paidOn').value,
    paid_through: document.getElementById('paidThrough').value,
  };
  try {
    const res = await fetch(`${API}/payments/${paymentId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Could not mark this bill as paid');
    closePayModal();
    loadBills();
  } catch (err) {
    alert(err.message);
  }
});

// ===== Credentials modal =====
document.getElementById('credModalClose').addEventListener('click', closeCredModal);
document.getElementById('credCloseBtn').addEventListener('click', closeCredModal);
credModalOverlay.addEventListener('click', (e) => { if (e.target === credModalOverlay) closeCredModal(); });

async function openCredentials(id) {
  credModalBillId = id;
  credModalBody.innerHTML = `<div class="empty-state"><i class="ti ti-loader-2"></i><span>Decrypting…</span></div>`;
  credModalOverlay.classList.add('open');

  try {
    const res = await fetch(`${API}/${id}/credentials`);
    if (!res.ok) throw new Error('Failed to load credentials');
    const c = await res.json();

    const row = (label, value, mono = true) => `
      <div class="cred-view-row">
        <span class="cred-view-label">${label}</span>
        <span class="cred-view-value ${value ? '' : 'empty'}" ${mono ? '' : 'style="font-family:var(--font-body)"'}>${value ? escapeHtml(value) : 'Not set'}</span>
      </div>
    `;

    credModalBody.innerHTML = `
      ${row('Email given to them', c.given_email)}
      ${row('Phone given to them', c.given_phone)}
      ${row('Date given', c.given_date ? formatDate(c.given_date) : '', false)}
      ${row('Portal login email', c.portal_email)}
      ${row('Portal login phone', c.portal_phone)}
      ${row('Portal password', c.portal_password)}
    `;
  } catch (err) {
    credModalBody.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't load credentials</span></div>`;
  }
}
window.openCredentials = openCredentials;

function closeCredModal() {
  credModalOverlay.classList.remove('open');
  credModalBillId = null;
}

credEditBtn.addEventListener('click', () => {
  if (credModalBillId === null) return;
  closeCredModal();
  openEdit(credModalBillId).then(() => {
    credSectionHeader.classList.add('open');
    credSectionBody.classList.add('open');
  });
});

// ===== Payment history modal =====
document.getElementById('historyModalClose').addEventListener('click', closeHistoryModal);
document.getElementById('historyCloseBtn').addEventListener('click', closeHistoryModal);
historyModalOverlay.addEventListener('click', (e) => { if (e.target === historyModalOverlay) closeHistoryModal(); });

async function openHistory(id) {
  const bill = BILLS.find(b => b.id === id);
  historyModalTitle.textContent = bill ? `Payment history — ${bill.biller_name}` : 'Payment history';
  historyBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading…</span></div></td></tr>`;
  historyModalOverlay.classList.add('open');

  try {
    const res = await fetch(`${API}/${id}/history`);
    if (!res.ok) throw new Error('Failed to load history');
    const rows = await res.json();

    if (rows.length === 0) {
      historyBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No payments recorded yet</span></div></td></tr>`;
      return;
    }

    historyBody.innerHTML = rows.map(r => `
      <tr>
        <td>${formatMonth(r.month_year)}</td>
        <td>${r.amount !== null ? `Rs ${r.amount.toLocaleString()}` : '—'}</td>
        <td>${r.extra_charges ? `Rs ${r.extra_charges.toLocaleString()}` : '—'}</td>
        <td class="amount-cell">Rs ${r.total.toLocaleString()}</td>
        <td>${formatDate(r.due_date)}</td>
        <td>${r.status === 'paid' ? `<span class="badge badge-success">Paid</span>` : `<span class="badge badge-warning">Pending</span>`}</td>
        <td style="color:var(--text-secondary)">${r.paid_on ? formatDate(r.paid_on) : '—'}</td>
        <td style="color:var(--text-secondary)">${r.paid_through ? escapeHtml(r.paid_through) : '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    historyBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't load history</span></div></td></tr>`;
  }
}
window.openHistory = openHistory;

function closeHistoryModal() {
  historyModalOverlay.classList.remove('open');
}

// ===== Shared helpers =====
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatMonth(my) {
  const [y, m] = my.split('-');
  return new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ===== Init =====
loadCategories().then(loadBills);
