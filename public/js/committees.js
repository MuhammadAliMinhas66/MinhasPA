const API = '/api/savings/committees';
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const thisMonthValue = new Date().toISOString().slice(0, 7);

let committees = [];
let expandedIds = new Set();
let reimburseFormOpen = null; // "committeeId:month" of the row currently showing the inline date picker

function paymentKey(cid, month) { return `${cid}:${month}`; }

const committeeModalOverlay = document.getElementById('committeeModalOverlay');
const committeeForm = document.getElementById('committeeForm');
const paymentModalOverlay = document.getElementById('paymentModalOverlay');
const paymentForm = document.getElementById('paymentForm');

// ===== Colour per committee — deterministic, same name always same colour =====
const COLOR_POOL = ['#d4a24e','#2dd4bf','#f2a93b','#7c9eff','#e5484d','#c084fc','#4ade80','#f472b6','#60a5fa','#fb923c'];
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function colorFor(name) { return COLOR_POOL[hashString(name) % COLOR_POOL.length]; }

function formatMonthYear(my) {
  if (!my) return '';
  const [y, m] = my.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}
function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ===== Load =====
async function loadCommittees() {
  const el = document.getElementById('committeeGrid');
  try {
    const res = await fetch(API);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Show the real reason (feature disabled, not logged in, etc.)
      // instead of masking every non-200 response as a DB outage.
      const msg = data.error || `Request failed (${res.status})`;
      el.innerHTML = `<div class="empty-state"><i class="ti ti-lock"></i><span>${escapeHtml(msg)}</span></div>`;
      return;
    }

    committees = Array.isArray(data) ? data : [];
    renderStats();
    renderGrid();
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

function renderStats() {
  const active = committees.filter(c => c.status !== 'completed');
  const monthly = active.reduce((s, c) => s + Number(c.monthly_amount), 0);
  const paidTotal = committees.reduce((s, c) => s + Number(c.total_paid), 0);
  const paidThisMonth = active.filter(c => c.paid_this_month);
  const paidThisMonthAmt = paidThisMonth.reduce((s, c) => s + Number(c.monthly_amount), 0);
  const duePanel = document.getElementById('dueThisMonthPanel');
  const dueCommittees = active.filter(c => !c.paid_this_month);

  document.getElementById('statMonthly').textContent = `Rs ${monthly.toLocaleString()}`;
  document.getElementById('statPaidTotal').textContent = `Rs ${paidTotal.toLocaleString()}`;

  document.getElementById('heroThisMonthValue').innerHTML = `Rs ${paidThisMonthAmt.toLocaleString()} <span id="heroThisMonthOf">of Rs ${monthly.toLocaleString()}</span>`;
  const heroSub = document.getElementById('heroThisMonthSub');
  if (active.length === 0) {
    heroSub.textContent = 'No active committees yet';
  } else if (dueCommittees.length === 0) {
    heroSub.innerHTML = `<i class="ti ti-circle-check" style="color:var(--success)"></i> All ${active.length} paid this month — you're done`;
  } else {
    heroSub.innerHTML = `<i class="ti ti-alert-triangle" style="color:var(--danger)"></i> ${dueCommittees.length} of ${active.length} still due this month`;
  }

  if (dueCommittees.length === 0) {
    duePanel.style.display = 'none';
  } else {
    duePanel.style.display = 'block';
    document.getElementById('dueList').innerHTML = dueCommittees.map(c => `
      <div class="due-item">
        <span class="due-item-dot" style="background:${colorFor(c.name)}"></span>
        <span class="due-item-name">${escapeHtml(c.name)}</span>
        <span class="due-item-amt">Rs ${Number(c.monthly_amount).toLocaleString()}</span>
        <button class="due-item-btn" data-id="${c.id}"><i class="ti ti-circle-plus"></i> Pay now</button>
      </div>
    `).join('');
    document.getElementById('dueList').querySelectorAll('.due-item-btn').forEach(btn => {
      btn.addEventListener('click', () => openPaymentModal(btn.dataset.id));
    });
  }
}

function renderGrid() {
  const el = document.getElementById('committeeGrid');

  if (committees.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-users-group"></i><span>No committees yet</span><span class="empty-state-hint">Add one above to start tracking payments, methods, and dates</span></div>`;
    return;
  }

  el.innerHTML = committees.map((c, idx) => {
    const color = colorFor(c.name);
    const initials = c.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const rounds = c.members || null;
    const roundPct = rounds ? Math.min(100, (c.months_paid / rounds) * 100) : null;
    const isExpanded = expandedIds.has(c.id);

    return `
      <div class="committee-card ${c.status === 'completed' ? 'completed' : ''}" style="animation-delay:${idx * 60}ms">
        <div class="committee-card-top">
          <span class="committee-avatar" style="--avatar-color:${color}">${escapeHtml(initials)}</span>
          <div class="committee-card-title">
            <span class="committee-card-name">${escapeHtml(c.name)}</span>
            <span class="committee-card-sub">Rs ${Number(c.monthly_amount).toLocaleString()}/month${c.members ? ` · ${c.members} members` : ''}</span>
          </div>
          ${c.status === 'completed' ? '<span class="badge" style="background:var(--surface-3);color:var(--text-secondary)">Completed</span>' : ''}
          <div class="actions-dropdown">
            <button class="icon-btn actions-trigger" title="Actions">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
            <div class="actions-menu">
              <button onclick="closeActionMenus(); openEditCommittee(${c.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                Edit
              </button>
              <button class="danger" onclick="closeActionMenus(); deleteCommittee(${c.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
          </div>
        </div>

        ${rounds ? `
          <div class="committee-progress">
            <div class="committee-progress-top">
              <span>Round ${Math.min(c.months_paid + 1, rounds)} of ${rounds}</span>
              <span>${Math.round(roundPct)}%</span>
            </div>
            <div class="committee-progress-track"><div class="committee-progress-fill" data-w="${roundPct}" style="width:0%;background:${color}"></div></div>
          </div>
        ` : ''}

        <div class="committee-card-meta">
          ${c.started_date ? `<span><i class="ti ti-calendar-event"></i> Started ${formatDate(c.started_date)}</span>` : ''}
          ${c.payout_month ? `<span><i class="ti ti-gift"></i> Your payout: ${formatMonthYear(c.payout_month)}</span>` : ''}
          <span><i class="ti ti-coins"></i> ${c.months_paid} paid · Rs ${Number(c.total_paid).toLocaleString()}</span>
        </div>

        <div class="committee-card-actions">
          <button class="committee-pay-btn ${c.paid_this_month ? 'paid' : ''}" data-id="${c.id}">
            <i class="ti ${c.paid_this_month ? 'ti-circle-check' : 'ti-circle-plus'}"></i>
            ${c.paid_this_month ? 'Paid this month' : "Record this month's payment"}
          </button>
          ${c.payments.length > 0 ? `
            <button class="committee-history-toggle" data-id="${c.id}">
              <i class="ti ti-chevron-${isExpanded ? 'up' : 'down'}"></i> ${isExpanded ? 'Hide' : 'Show'} history (${c.payments.length})
            </button>
          ` : ''}
        </div>

        ${isExpanded ? `
          <div class="payment-timeline">
            ${c.payments.map((p, i) => `
              <div class="timeline-item" style="animation-delay:${i * 50}ms">
                <span class="timeline-dot" style="background:${color}"></span>
                <div class="timeline-body">
                  <div class="timeline-top">
                    <span class="timeline-month">${formatMonthYear(p.month_year)}</span>
                    <button class="timeline-undo" data-cid="${c.id}" data-month="${p.month_year}" title="Undo this payment"><i class="ti ti-x"></i></button>
                  </div>
                  <div class="timeline-sub">
                    ${p.paid_date ? `<span><i class="ti ti-calendar"></i> ${p.paid_by_other ? 'Given' : 'Paid'} ${formatDate(p.paid_date)}</span>` : ''}
                    ${p.payment_method ? `<span><i class="ti ti-credit-card"></i> ${escapeHtml(p.payment_method)}</span>` : '<span class="dim">Method not specified</span>'}
                  </div>
                  ${p.paid_by_other ? `
                    <div class="timeline-owe ${p.reimbursed ? 'settled' : ''}">
                      <i class="ti ti-user-dollar"></i>
                      <span>${escapeHtml(p.payer_name || 'Someone')} paid this for you${p.reimbursed
                        ? ` — returned ${formatDate(p.reimbursed_date)}`
                        : ' — you owe them back'}</span>
                      ${!p.reimbursed ? `<button class="timeline-reimburse-btn" data-cid="${c.id}" data-month="${p.month_year}">Mark returned</button>` : ''}
                    </div>
                    ${!p.reimbursed && reimburseFormOpen === paymentKey(c.id, p.month_year) ? `
                      <div class="reimburse-inline-form">
                        <input type="date" class="reimburse-date-input" value="${new Date().toISOString().slice(0, 10)}">
                        <button class="reimburse-confirm-btn" data-cid="${c.id}" data-month="${p.month_year}"><i class="ti ti-check"></i> Confirm</button>
                        <button class="reimburse-close-btn" title="Cancel"><i class="ti ti-x"></i></button>
                      </div>
                    ` : ''}
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Animate progress bars in
  requestAnimationFrame(() => {
    el.querySelectorAll('.committee-progress-fill').forEach(bar => { bar.style.width = `${bar.dataset.w}%`; });
  });

  el.querySelectorAll('.committee-pay-btn').forEach(btn => {
    btn.addEventListener('click', () => openPaymentModal(btn.dataset.id));
  });
  el.querySelectorAll('.committee-history-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
      renderGrid();
    });
  });
  el.querySelectorAll('.timeline-undo').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this payment record?')) return;
      await fetch(`${API}/${btn.dataset.cid}/payments/${btn.dataset.month}`, { method: 'DELETE' });
      loadCommittees();
    });
  });
  el.querySelectorAll('.timeline-reimburse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      reimburseFormOpen = paymentKey(btn.dataset.cid, btn.dataset.month);
      renderGrid();
    });
  });
  el.querySelectorAll('.reimburse-close-btn').forEach(btn => {
    btn.addEventListener('click', () => { reimburseFormOpen = null; renderGrid(); });
  });
  el.querySelectorAll('.reimburse-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.reimburse-inline-form');
      const date = row.querySelector('.reimburse-date-input').value;
      btn.disabled = true;
      await fetch(`${API}/${btn.dataset.cid}/payments/${btn.dataset.month}/reimburse`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursed_date: date }),
      });
      reimburseFormOpen = null;
      loadCommittees();
    });
  });
}

// ===== Add / edit committee =====
document.getElementById('addCommitteeBtn').addEventListener('click', () => {
  committeeForm.reset();
  document.getElementById('committeeId').value = '';
  document.getElementById('committeeModalTitle').textContent = 'Add a committee';
  committeeModalOverlay.classList.add('open');
});

window.openEditCommittee = function (id) {
  const c = committees.find(x => x.id === id);
  if (!c) return;
  document.getElementById('committeeId').value = c.id;
  document.getElementById('committeeName').value = c.name;
  document.getElementById('committeeAmount').value = c.monthly_amount;
  document.getElementById('committeeMembers').value = c.members || '';
  document.getElementById('committeeStarted').value = c.started_date ? c.started_date.slice(0, 10) : '';
  document.getElementById('committeePayout').value = c.payout_month || '';
  document.getElementById('committeeModalTitle').textContent = 'Edit committee';
  committeeModalOverlay.classList.add('open');
};

window.deleteCommittee = async function (id) {
  if (!confirm('Delete this committee? Its payment history will be removed too.')) return;
  await fetch(`${API}/${id}`, { method: 'DELETE' });
  loadCommittees();
};

function closeCommitteeModal() { committeeModalOverlay.classList.remove('open'); }
document.getElementById('committeeModalClose').addEventListener('click', closeCommitteeModal);
document.getElementById('committeeCancelBtn').addEventListener('click', closeCommitteeModal);
committeeModalOverlay.addEventListener('click', (e) => { if (e.target === committeeModalOverlay) closeCommitteeModal(); });

committeeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('committeeId').value;
  const payload = {
    name: document.getElementById('committeeName').value.trim(),
    monthly_amount: Number(document.getElementById('committeeAmount').value),
    members: document.getElementById('committeeMembers').value ? Number(document.getElementById('committeeMembers').value) : null,
    started_date: document.getElementById('committeeStarted').value || null,
    payout_month: document.getElementById('committeePayout').value || null,
  };
  if (!payload.name || !payload.monthly_amount) return;

  await fetch(id ? `${API}/${id}` : API, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  closeCommitteeModal();
  loadCommittees();
});

// ===== Record a payment =====
const paidByOtherCheckbox = document.getElementById('paidByOtherCheckbox');
const payerNameField = document.getElementById('payerNameField');

paidByOtherCheckbox.addEventListener('change', () => {
  payerNameField.style.display = paidByOtherCheckbox.checked ? 'block' : 'none';
  document.getElementById('paymentDateLabel').textContent = paidByOtherCheckbox.checked ? 'Date given' : 'Date paid';
});

function openPaymentModal(committeeId) {
  paymentForm.reset();
  document.getElementById('paymentCommitteeId').value = committeeId;
  document.getElementById('paymentMonth').value = thisMonthValue;
  document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10);
  payerNameField.style.display = 'none';
  document.getElementById('paymentDateLabel').textContent = 'Date paid';
  paymentModalOverlay.classList.add('open');
}

function closePaymentModal() { paymentModalOverlay.classList.remove('open'); }
document.getElementById('paymentModalClose').addEventListener('click', closePaymentModal);
document.getElementById('paymentCancelBtn').addEventListener('click', closePaymentModal);
paymentModalOverlay.addEventListener('click', (e) => { if (e.target === paymentModalOverlay) closePaymentModal(); });

paymentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('paymentCommitteeId').value;
  const paidByOther = paidByOtherCheckbox.checked;
  const payload = {
    month_year: document.getElementById('paymentMonth').value,
    paid_date: document.getElementById('paymentDate').value,
    payment_method: document.getElementById('paymentMethod').value || null,
    paid_by_other: paidByOther,
    payer_name: paidByOther ? document.getElementById('paymentPayerName').value.trim() : null,
  };
  if (paidByOther && !payload.payer_name) {
    alert('Enter who paid it for you.');
    return;
  }
  await fetch(`${API}/${id}/payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  closePaymentModal();
  loadCommittees();
});

loadCommittees();
