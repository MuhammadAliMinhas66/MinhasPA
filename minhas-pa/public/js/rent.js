const API = '/api/rent';

const rentBody = document.getElementById('rentBody');
const modalOverlay = document.getElementById('modalOverlay');
const rentForm = document.getElementById('rentForm');
const paidBySelect = document.getElementById('paidBy');
const loanNameWrap = document.getElementById('loanNameWrap');
const loanNameInput = document.getElementById('loanName');
const statusSelect = document.getElementById('status');
const paidDateWrap = document.getElementById('paidDateWrap');
const paidDateInput = document.getElementById('paidDate');

async function loadRent() {
  rentBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading rent history…</span></div></td></tr>`;

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Request failed');
    const rows = await res.json();
    renderRent(rows);
    renderSummary(rows);
  } catch (err) {
    rentBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database. Check your .env and that SQL Server is running.</span></div></td></tr>`;
  }
}

function renderRent(rows) {
  if (rows.length === 0) {
    rentBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No rent recorded yet — click "Record a month" to start</span></div></td></tr>`;
    return;
  }

  rentBody.innerHTML = rows.map(r => `
    <tr>
      <td>${formatMonth(r.month_year)}</td>
      <td class="amount-cell">Rs ${Number(r.amount).toLocaleString()}</td>
      <td>${formatDate(r.due_date)}</td>
      <td>${r.status === 'paid'
          ? `<span class="badge badge-success">Paid</span>`
          : `<span class="badge badge-danger">Unpaid</span>`}</td>
      <td style="color:var(--text-secondary)">${r.paid_date ? formatDate(r.paid_date) : '—'}</td>
      <td>${r.paid_by === 'loan'
          ? `<span class="badge badge-warning" title="Loan">${escapeHtml(r.loan_name || 'Loan')}</span>`
          : `<span style="color:var(--text-secondary)">Me</span>`}</td>
      <td>
        <div class="actions-dropdown">
          <button class="icon-btn actions-trigger" title="Actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
          </button>
          <div class="actions-menu">
            <button onclick="closeActionMenus(); openEdit('${r.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              Edit
            </button>
            <button onclick="closeActionMenus(); toggleStatus('${r.id}', '${r.status}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ${r.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
            </button>
            <button class="danger" onclick="closeActionMenus(); deleteRent('${r.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderSummary(rows) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = rows.find(r => r.month_year === currentMonth);
  document.getElementById('thisMonthStatus').textContent = thisMonth
    ? (thisMonth.status === 'paid' ? 'Paid ✓' : 'Unpaid')
    : 'Not recorded';

  const currentYear = new Date().getFullYear().toString();
  const paidThisYear = rows
    .filter(r => r.month_year.startsWith(currentYear) && r.status === 'paid')
    .reduce((s, r) => s + Number(r.amount), 0);
  document.getElementById('paidThisYear').textContent = `Rs ${paidThisYear.toLocaleString()}`;

  const unpaidCount = rows.filter(r => r.status === 'unpaid').length;
  document.getElementById('unpaidCount').textContent = unpaidCount;
}

// ===== Status / paid date =====
statusSelect.addEventListener('change', togglePaidDateField);

function togglePaidDateField() {
  const isPaid = statusSelect.value === 'paid';
  paidDateWrap.style.display = isPaid ? '' : 'none';
  if (!isPaid) paidDateInput.value = '';
}

// ===== Paid by / loan name =====
paidBySelect.addEventListener('change', () => {
  toggleLoanNameField();
  if (paidBySelect.value === 'loan') loanNameInput.focus();
});

function toggleLoanNameField() {
  const isLoan = paidBySelect.value === 'loan';
  loanNameWrap.style.display = isLoan ? '' : 'none';
  loanNameInput.required = isLoan;
  if (!isLoan) loanNameInput.value = '';
}

// Pressing Enter in the loan-name field just confirms the value and moves on,
// instead of submitting the whole form early.
loanNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loanNameInput.blur();
  }
});

// ===== Modal =====
document.getElementById('addRentBtn').addEventListener('click', openAdd);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

function openAdd() {
  rentForm.reset();
  document.getElementById('rentId').value = '';
  document.getElementById('modalTitle').textContent = "Record a month's rent";
  document.getElementById('monthYear').value = new Date().toISOString().slice(0, 7);
  paidBySelect.value = 'me';
  toggleLoanNameField();
  togglePaidDateField();
  modalOverlay.classList.add('open');
}

async function openEdit(id) {
  const res = await fetch(API);
  const all = await res.json();
  const r = all.find(x => x.id === id);
  if (!r) return;

  document.getElementById('rentId').value = r.id;
  document.getElementById('modalTitle').textContent = 'Edit rent record';
  document.getElementById('monthYear').value = r.month_year;
  document.getElementById('amount').value = r.amount;
  document.getElementById('dueDate').value = r.due_date.slice(0, 10);
  document.getElementById('status').value = r.status;
  document.getElementById('notes').value = r.notes || '';
  paidDateInput.value = r.paid_date ? r.paid_date.slice(0, 10) : '';
  togglePaidDateField();
  paidBySelect.value = r.paid_by === 'loan' ? 'loan' : 'me';
  loanNameInput.value = r.loan_name || '';
  toggleLoanNameField();

  modalOverlay.classList.add('open');
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

rentForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('rentId').value;
  const status = document.getElementById('status').value;
  const payload = {
    month_year: document.getElementById('monthYear').value,
    amount: parseFloat(document.getElementById('amount').value),
    due_date: document.getElementById('dueDate').value,
    status,
    paid_date: status === 'paid' ? (paidDateInput.value || new Date().toISOString().slice(0, 10)) : null,
    notes: document.getElementById('notes').value,
    paid_by: paidBySelect.value,
    loan_name: paidBySelect.value === 'loan' ? loanNameInput.value.trim() : null,
  };

  if (payload.paid_by === 'loan' && !payload.loan_name) {
    alert('Please enter the loan name.');
    loanNameInput.focus();
    return;
  }

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
    loadRent();
  } catch (err) {
    alert(err.message);
  }
});

async function toggleStatus(id, currentStatus) {
  const res = await fetch(API);
  const all = await res.json();
  const r = all.find(x => x.id === id);
  if (!r) return;

  await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...r, status: currentStatus === 'paid' ? 'unpaid' : 'paid' }),
  });
  loadRent();
}

async function deleteRent(id) {
  if (!confirm('Delete this rent record?')) return;
  await fetch(`${API}/${id}`, { method: 'DELETE' });
  loadRent();
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatMonth(my) {
  const [y, m] = my.split('-');
  return new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

loadRent();
