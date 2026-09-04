const API = '/api/loans';

let currentFilter = 'all';
let currentMonth = ''; // 'YYYY-MM' or '' for all months — filters by date_taken
let direction = 'taken'; // for the add/edit form segmented control
let currentLoans = []; // last loaded page of loans, used for select-mode + edit lookups
let selectMode = false;
let selectedIds = new Set();

const loansBody = document.getElementById('loansBody');
const loansTable = document.getElementById('loansTable');
const chipRow = document.getElementById('chipRow');
const modalOverlay = document.getElementById('modalOverlay');
const loanForm = document.getElementById('loanForm');
const loansCountPill = document.getElementById('loansCountPill');
const selectModeBtn = document.getElementById('selectModeBtn');
const exitSelectBtn = document.getElementById('exitSelectBtn');
const clearSelectBtn = document.getElementById('clearSelectBtn');
const selectSumBar = document.getElementById('selectSumBar');
const selectAllLoans = document.getElementById('selectAllLoans');

// ===== Calendar month filter =====
const calFilter = document.getElementById('calFilter');
const calFilterBtn = document.getElementById('calFilterBtn');
const calFilterLabel = document.getElementById('calFilterLabel');
const calPopup = document.getElementById('calPopup');
const calYearLabel = document.getElementById('calYearLabel');
const calPrevYear = document.getElementById('calPrevYear');
const calNextYear = document.getElementById('calNextYear');
const calMonthGrid = document.getElementById('calMonthGrid');
const calAllMonths = document.getElementById('calAllMonths');

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const THIS_YEAR = new Date().getFullYear();
const THIS_MONTH_INDEX = new Date().getMonth(); // 0-based
let calYear = THIS_YEAR;

function renderCalPopup() {
  calYearLabel.textContent = calYear;
  calNextYear.disabled = calYear >= THIS_YEAR;

  calMonthGrid.innerHTML = MONTH_NAMES.map((name, i) => {
    const value = `${calYear}-${String(i + 1).padStart(2, '0')}`;
    const isActive = currentMonth === value;
    const isFuture = calYear === THIS_YEAR && i > THIS_MONTH_INDEX;
    return `<button type="button" class="cal-month-btn ${isActive ? 'active' : ''} ${isFuture ? 'future' : ''}" data-value="${value}">${name}</button>`;
  }).join('');

  calAllMonths.classList.toggle('active', currentMonth === '');
}

function updateCalLabel() {
  if (!currentMonth) {
    calFilterLabel.textContent = 'All months';
    return;
  }
  const [y, m] = currentMonth.split('-');
  calFilterLabel.textContent = new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function closeCalPopup() {
  calFilter.classList.remove('open');
}

calFilterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const opening = !calFilter.classList.contains('open');
  calFilter.classList.toggle('open', opening);
  if (opening) {
    calYear = currentMonth ? Number(currentMonth.split('-')[0]) : THIS_YEAR;
    renderCalPopup();
  }
});

calPrevYear.addEventListener('click', () => { calYear--; renderCalPopup(); });
calNextYear.addEventListener('click', () => { if (calYear < THIS_YEAR) { calYear++; renderCalPopup(); } });

calMonthGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.cal-month-btn');
  if (!btn) return;
  currentMonth = btn.dataset.value;
  updateCalLabel();
  closeCalPopup();
  loadLoans();
});

calAllMonths.addEventListener('click', () => {
  currentMonth = '';
  updateCalLabel();
  closeCalPopup();
  loadLoans();
});

document.addEventListener('click', (e) => {
  if (!calFilter.contains(e.target)) closeCalPopup();
});

// ===== Fetch & render =====
async function loadLoans() {
  loansBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading loans…</span></div></td></tr>`;

  const params = new URLSearchParams();
  if (currentMonth) params.set('month', currentMonth);

  if (currentFilter === 'taken' || currentFilter === 'given') params.set('direction', currentFilter);
  if (currentFilter === 'pending' || currentFilter === 'done') params.set('status', currentFilter);
  if (currentFilter === 'critical') params.set('critical', 'true');

  try {
    const res = await fetch(`${API}?${params.toString()}`);
    if (!res.ok) throw new Error('Request failed');
    const loans = await res.json();
    currentLoans = loans;
    // Drop selections for entries that scrolled out of the current filter.
    const visibleIds = new Set(loans.map(l => l.id));
    selectedIds.forEach(id => { if (!visibleIds.has(id)) selectedIds.delete(id); });
    renderLoans(loans);
    renderSummary(loans);
    updateSelectionUI();
  } catch (err) {
    loansBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database. Check your .env and that SQL Server is running.</span></div></td></tr>`;
  }
}

function renderLoans(loans) {
  if (loans.length === 0) {
    loansBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No loans match this filter</span></div></td></tr>`;
    return;
  }

  loansBody.innerHTML = loans.map(loan => `
    <tr class="${selectedIds.has(loan.id) ? 'row-selected' : ''}" data-id="${loan.id}">
      <td class="select-col"><input type="checkbox" class="row-check" data-id="${loan.id}" ${selectedIds.has(loan.id) ? 'checked' : ''}></td>
      <td>
        <div class="person-cell">
          <span class="direction-dot ${loan.direction}"></span>
          ${escapeHtml(loan.person_name)}
        </div>
      </td>
      <td style="color:var(--text-secondary)">${escapeHtml(loan.description || '—')}</td>
      <td class="amount-cell">Rs ${Number(loan.amount).toLocaleString()}</td>
      <td>${formatDate(loan.date_taken)}</td>
      <td>${loan.due_date ? formatDate(loan.due_date) : '—'}</td>
      <td>${statusBadge(loan)}</td>
      <td>
        <div class="actions-dropdown">
          <button class="icon-btn actions-trigger" title="Actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
          </button>
          <div class="actions-menu">
            <button onclick="closeActionMenus(); openEdit('${loan.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              Edit
            </button>
            <button onclick="closeActionMenus(); toggleStatus('${loan.id}', '${loan.status}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ${loan.status === 'done' ? 'Mark undone' : 'Mark done'}
            </button>
            <button class="danger" onclick="closeActionMenus(); deleteLoan('${loan.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

function statusBadge(loan) {
  if (loan.status === 'done') return `<span class="badge badge-success">Done</span>`;
  if (loan.is_critical) return `<span class="badge badge-danger">Critical</span>`;
  return `<span class="badge badge-warning">Undone</span>`;
}

function renderSummary(loans) {
  const sumTaken = loans.filter(l => l.direction === 'taken' && l.status === 'pending')
    .reduce((s, l) => s + Number(l.amount), 0);
  const sumGiven = loans.filter(l => l.direction === 'given' && l.status === 'pending')
    .reduce((s, l) => s + Number(l.amount), 0);
  const criticalCount = loans.filter(l => l.is_critical).length;

  document.getElementById('sumTaken').textContent = `Rs ${sumTaken.toLocaleString()}`;
  document.getElementById('sumGiven').textContent = `Rs ${sumGiven.toLocaleString()}`;
  document.getElementById('sumCritical').textContent = criticalCount;

  loansCountPill.innerHTML = `<i class="ti ti-list-details" style="font-size:12px"></i> ${loans.length} record${loans.length === 1 ? '' : 's'}`;
}

// ===== Select mode: click "Select", tick entries, see the running sum =====
selectModeBtn.addEventListener('click', () => {
  selectMode = true;
  selectedIds.clear();
  loansTable.classList.add('selecting');
  selectModeBtn.classList.add('active');
  document.body.classList.add('has-select-bar');
  renderLoans(currentLoans);
  updateSelectionUI();
});

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  loansTable.classList.remove('selecting');
  selectModeBtn.classList.remove('active');
  document.body.classList.remove('has-select-bar');
  renderLoans(currentLoans);
  updateSelectionUI();
}

exitSelectBtn.addEventListener('click', exitSelectMode);
clearSelectBtn.addEventListener('click', () => {
  selectedIds.clear();
  renderLoans(currentLoans);
  updateSelectionUI();
});

selectAllLoans.addEventListener('change', () => {
  const checked = selectAllLoans.checked;
  document.querySelectorAll('#loansBody .row-check').forEach(cb => {
    cb.checked = checked;
    const row = cb.closest('tr[data-id]');
    const id = row.dataset.id;
    if (checked) selectedIds.add(id); else selectedIds.delete(id);
    row.classList.toggle('row-selected', checked);
  });
  updateSelectionUI();
});

// Checkbox toggles are handled via 'change' (fires reliably *after* the
// browser's own checked-state flip, so we're never reading a stale value —
// this was the cause of the "can't uncheck" bug). We update just the one
// row's class instead of re-rendering the whole table, so nothing about
// the click can get lost mid-repaint.
loansBody.addEventListener('change', (e) => {
  if (!e.target.classList.contains('row-check')) return;
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const id = row.dataset.id;

  if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
  row.classList.toggle('row-selected', e.target.checked);
  updateSelectionUI();
});

// Clicking anywhere else on a row (while in select mode) toggles that
// row's checkbox for you, so you don't have to aim for it precisely.
loansBody.addEventListener('click', (e) => {
  if (!selectMode) return;
  if (e.target.closest('.actions-dropdown')) return;
  if (e.target.classList.contains('row-check')) return; // native checkbox click already handled via 'change'

  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const checkbox = row.querySelector('.row-check');
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
});

function updateSelectionUI() {
  const selected = currentLoans.filter(l => selectedIds.has(l.id));
  const total = selected.reduce((s, l) => s + Number(l.amount), 0);
  const taken = selected.filter(l => l.direction === 'taken').reduce((s, l) => s + Number(l.amount), 0);
  const given = selected.filter(l => l.direction === 'given').reduce((s, l) => s + Number(l.amount), 0);

  document.getElementById('selectCount').textContent = selected.length;
  document.getElementById('selectSumTaken').textContent = `Rs ${taken.toLocaleString()}`;
  document.getElementById('selectSumGiven').textContent = `Rs ${given.toLocaleString()}`;
  document.getElementById('selectSumTotal').textContent = `Rs ${total.toLocaleString()}`;

  selectSumBar.classList.toggle('open', selectMode && selected.length > 0);
  selectAllLoans.checked = currentLoans.length > 0 && selected.length === currentLoans.length;
}

// ===== Filters =====
chipRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  currentFilter = chip.dataset.filter;
  loadLoans();
});

// ===== Modal =====
document.getElementById('addLoanBtn').addEventListener('click', () => openAdd());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    direction = btn.dataset.value;
    updateDateLabel();
  });
});

function updateDateLabel() {
  document.getElementById('dateTakenLabel').textContent =
    direction === 'given' ? 'Date given' : 'Date taken';
}

function openAdd() {
  loanForm.reset();
  document.getElementById('loanId').value = '';
  document.getElementById('modalTitle').textContent = 'Add a loan';
  direction = 'taken';
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === 'taken'));
  document.getElementById('dateTaken').value = new Date().toISOString().slice(0, 10);
  updateDateLabel();
  modalOverlay.classList.add('open');
}

async function openEdit(id) {
  const res = await fetch(`${API}?`); // fetch all, find by id (simple approach for now)
  const all = await res.json();
  const loan = all.find(l => l.id === id);
  if (!loan) return;

  document.getElementById('loanId').value = loan.id;
  document.getElementById('modalTitle').textContent = 'Edit loan';
  document.getElementById('personName').value = loan.person_name;
  document.getElementById('amount').value = loan.amount;
  document.getElementById('description').value = loan.description || '';
  document.getElementById('dateTaken').value = loan.date_taken.slice(0, 10);
  document.getElementById('dueDate').value = loan.due_date ? loan.due_date.slice(0, 10) : '';
  document.getElementById('status').value = loan.status;

  direction = loan.direction;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === loan.direction));
  updateDateLabel();

  modalOverlay.classList.add('open');
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

loanForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('loanId').value;
  const payload = {
    direction,
    person_name: document.getElementById('personName').value,
    amount: parseFloat(document.getElementById('amount').value),
    description: document.getElementById('description').value,
    date_taken: document.getElementById('dateTaken').value,
    due_date: document.getElementById('dueDate').value || null,
    status: document.getElementById('status').value,
  };

  try {
    const res = await fetch(id ? `${API}/${id}` : API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Save failed');
    closeModal();
    loadLoans();
  } catch (err) {
    alert('Could not save the loan. Check your database connection.');
  }
});

async function toggleStatus(id, currentStatus) {
  const res = await fetch(`${API}?`);
  const all = await res.json();
  const loan = all.find(l => l.id === id);
  if (!loan) return;

  await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...loan, status: currentStatus === 'done' ? 'pending' : 'done' }),
  });
  loadLoans();
}

async function deleteLoan(id) {
  if (!confirm('Delete this loan entry?')) return;
  await fetch(`${API}/${id}`, { method: 'DELETE' });
  loadLoans();
}

function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadLoans();
