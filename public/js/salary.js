const API = '/api/salary';
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let currentPlan = null;
let currentItems = [];
let saveDebounce;

const salaryMonth = document.getElementById('salaryMonth');
const salaryInput = document.getElementById('salaryInput');
const allocAddForm = document.getElementById('allocAddForm');
const allocLabelInput = document.getElementById('allocLabel');
const allocAmountInput = document.getElementById('allocAmount');

// ===== Month picker =====
function monthValue(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}`; }

function populateMonths() {
  const now = new Date();
  let html = '';
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = monthValue(d.getFullYear(), d.getMonth());
    html += `<option value="${value}">${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}</option>`;
  }
  salaryMonth.innerHTML = html;
  salaryMonth.value = monthValue(now.getFullYear(), now.getMonth());
}

salaryMonth.addEventListener('change', loadPlan);

// ===== Auto icon + colour matching for allocation labels =====
const KEYWORD_ICON_MAP = [
  [['rent', 'house', 'home'], ['ti-home-2', '#d4a24e']],
  [['saving', 'invest'], ['ti-moneybag', '#4ade80']],
  [['grocery', 'groceries', 'ration', 'food'], ['ti-shopping-cart', '#f2a93b']],
  [['bill', 'utility', 'electric', 'gas', 'water', 'internet', 'wifi'], ['ti-bolt', '#facc15']],
  [['loan', 'debt', 'emi', 'installment'], ['ti-arrows-exchange', '#e5484d']],
  [['family', 'kids', 'children', 'parents'], ['ti-users', '#7c9eff']],
  [['transport', 'fuel', 'petrol', 'car', 'bike', 'taxi', 'uber'], ['ti-car', '#60a5fa']],
  [['health', 'medical', 'doctor', 'medicine'], ['ti-stethoscope', '#f87171']],
  [['education', 'school', 'course', 'fee', 'tuition'], ['ti-school', '#c084fc']],
  [['shopping', 'clothes', 'shoe'], ['ti-shopping-bag', '#f472b6']],
  [['entertainment', 'movie', 'subscription', 'netflix'], ['ti-device-tv', '#38bdf8']],
  [['gift', 'charity', 'donation'], ['ti-gift', '#fb923c']],
  [['need', 'necessit'], ['ti-shield-check', '#4ade80']],
  [['want', 'lifestyle'], ['ti-sparkles', '#f2a93b']],
];
const ICON_POOL = ['ti-tag','ti-star','ti-briefcase','ti-coin','ti-wallet','ti-receipt','ti-cup','ti-plane'];
const COLOR_POOL = ['#d4a24e','#2dd4bf','#f2a93b','#7c9eff','#e5484d','#c084fc','#4ade80','#f472b6'];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function autoMatch(label) {
  const text = label.toLowerCase();
  for (const [keywords, val] of KEYWORD_ICON_MAP) {
    if (keywords.some(k => text.includes(k))) return { icon: val[0], color: val[1] };
  }
  const h = hashString(text);
  return { icon: ICON_POOL[h % ICON_POOL.length], color: COLOR_POOL[h % COLOR_POOL.length] };
}

// ===== Quick presets =====
const PRESETS = [
  { label: 'Rent', icon: 'ti-home-2', color: '#d4a24e' },
  { label: 'Savings', icon: 'ti-moneybag', color: '#4ade80' },
  { label: 'Groceries', icon: 'ti-shopping-cart', color: '#f2a93b' },
  { label: 'Bills', icon: 'ti-bolt', color: '#facc15' },
  { label: 'Loan repayment', icon: 'ti-arrows-exchange', color: '#e5484d' },
  { label: 'Family', icon: 'ti-users', color: '#7c9eff' },
];

document.getElementById('quickPresets').innerHTML = PRESETS.map(p => `
  <button type="button" class="preset-chip" data-label="${p.label}" style="--chip-color:${p.color}">
    <i class="ti ${p.icon}"></i> ${p.label}
  </button>
`).join('');

document.getElementById('quickPresets').addEventListener('click', (e) => {
  const chip = e.target.closest('.preset-chip');
  if (!chip) return;
  allocLabelInput.value = chip.dataset.label;
  allocAmountInput.focus();
});

// ===== 50/30/20 rule =====
document.getElementById('ruleBtn').addEventListener('click', async () => {
  const salary = Number(salaryInput.value);
  if (!salary || salary <= 0) {
    alert('Enter your salary first.');
    salaryInput.focus();
    return;
  }
  if (currentItems.length > 0 && !confirm("This adds 3 allocations — Needs (50%), Wants (30%), Savings (20%) — on top of what's already there. Continue?")) return;

  const rule = [
    { label: 'Needs (50%)', amount: Math.round(salary * 0.5) },
    { label: 'Wants (30%)', amount: Math.round(salary * 0.3) },
    { label: 'Savings (20%)', amount: Math.round(salary * 0.2) },
  ];

  for (const item of rule) {
    const meta = autoMatch(item.label);
    // eslint-disable-next-line no-await-in-loop
    await addItem(item.label, item.amount, meta.icon, meta.color);
  }
  loadPlan();
});

// ===== Load / save =====
async function loadPlan() {
  const month = salaryMonth.value;
  try {
    const res = await fetch(`${API}?month=${month}`);
    const data = await res.json();
    currentPlan = data.plan;
    currentItems = data.items;
    salaryInput.value = Number(currentPlan.salary) || '';
    render();
  } catch (err) {
    console.error('Failed to load salary plan:', err);
    document.getElementById('allocList').innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
  loadSyncPreview();
  loadHistory();
}

salaryInput.addEventListener('input', () => {
  render(); // instant visual feedback
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(saveSalary, 500);
});

async function saveSalary() {
  const month = salaryMonth.value;
  const salary = Number(salaryInput.value) || 0;
  try {
    await fetch(API, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, salary }),
    });
  } catch (err) {
    console.error('Failed to save salary:', err);
  }
}

async function addItem(label, amount, icon, color) {
  const month = salaryMonth.value;
  const res = await fetch(`${API}/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, label, amount, icon, color }),
  });
  return res.json();
}

allocAddForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const label = allocLabelInput.value.trim();
  const amount = Number(allocAmountInput.value);
  if (!label || !amount) return;

  const meta = autoMatch(label);
  const item = await addItem(label, amount, meta.icon, meta.color);
  currentItems.push(item);
  allocAddForm.reset();
  render();
});

async function deleteItem(id) {
  await fetch(`${API}/items/${id}`, { method: 'DELETE' });
  currentItems = currentItems.filter(i => i.id !== id);
  render();
}

// ===== Render everything =====
function render() {
  const salary = Number(salaryInput.value) || 0;
  const allocated = currentItems.reduce((s, i) => s + Number(i.amount), 0);
  const remaining = salary - allocated;
  const pctRemaining = salary > 0 ? Math.max(0, Math.min(100, (remaining / salary) * 100)) : 0;

  renderRing(remaining, pctRemaining, salary);
  renderTrackAndLegend(salary, allocated, remaining);
  renderList(salary);
}

function animateCountUp(el, from, to, prefix, duration = 500) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (to - from) * eased);
    el.textContent = `${prefix}${val.toLocaleString()}`;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

let lastRemaining = null;
function renderRing(remaining, pctRemaining, salary) {
  const ring = document.getElementById('ringFill');
  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (pctRemaining / 100) * circumference;

  ring.style.strokeDasharray = `${circumference}`;
  if (lastRemaining === null) ring.style.strokeDashoffset = `${circumference}`;
  requestAnimationFrame(() => { ring.style.strokeDashoffset = `${offset}`; });

  ring.classList.remove('good', 'warn', 'over');
  if (remaining < 0) ring.classList.add('over');
  else if (salary > 0 && remaining / salary < 0.3) ring.classList.add('warn');
  else ring.classList.add('good');

  const valueEl = document.getElementById('remainingValue');
  valueEl.style.color = remaining < 0 ? 'var(--danger)' : 'var(--success)';
  animateCountUp(valueEl, lastRemaining ?? 0, remaining, remaining < 0 ? '−Rs ' : 'Rs ');
  lastRemaining = Math.abs(remaining);

  const pctEl = document.getElementById('remainingPct');
  pctEl.textContent = salary > 0 ? `${Math.round((remaining / salary) * 100)}% of salary left` : 'Enter your salary';
}

function renderTrackAndLegend(salary, allocated, remaining) {
  const track = document.getElementById('allocTrack');
  const legend = document.getElementById('allocLegend');

  if (salary <= 0) {
    track.innerHTML = '';
    legend.innerHTML = `<div class="empty-state"><i class="ti ti-calculator"></i><span>Enter your salary to see the breakdown</span></div>`;
    return;
  }

  const pct = (amt) => Math.max(0, Math.min(100, (amt / salary) * 100));

  track.innerHTML = currentItems.map(i => `
    <div class="alloc-seg" data-w="${pct(i.amount)}" style="width:0%;background:${i.color}" title="${escapeHtml(i.label)}: Rs ${Number(i.amount).toLocaleString()}"></div>
  `).join('') + `<div class="alloc-seg alloc-seg-remaining ${remaining < 0 ? 'over' : ''}" data-w="${pct(Math.max(0, remaining))}" style="width:0%" title="Remaining: Rs ${remaining.toLocaleString()}"></div>`;

  requestAnimationFrame(() => {
    track.querySelectorAll('.alloc-seg').forEach(seg => { seg.style.width = `${seg.dataset.w}%`; });
  });

  legend.innerHTML = currentItems.map(i => `
    <div class="legend-chip">
      <span class="legend-dot" style="background:${i.color}"></span>
      ${escapeHtml(i.label)} <b>${Math.round(pct(i.amount))}%</b>
    </div>
  `).join('') + `
    <div class="legend-chip">
      <span class="legend-dot" style="background:${remaining < 0 ? 'var(--danger)' : 'var(--surface-3)'}"></span>
      Remaining <b>${Math.round(pct(Math.max(0, remaining)))}%</b>
    </div>`;
}

function renderList(salary) {
  const el = document.getElementById('allocList');
  if (currentItems.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-list-details"></i><span>No allocations yet — add one above, or try a quick preset</span></div>`;
    return;
  }

  const pct = (amt) => salary > 0 ? Math.round((amt / salary) * 100) : 0;

  el.innerHTML = currentItems.map(i => `
    <div class="alloc-row">
      <span class="alloc-row-icon" style="--icon-color:${i.color}"><i class="ti ${i.icon}"></i></span>
      <div class="alloc-row-body">
        <div class="alloc-row-top">
          <span class="alloc-row-label">${escapeHtml(i.label)}${i.source === 'loans_critical' ? '<span class="alloc-row-critical-badge"><i class="ti ti-alert-triangle"></i> Critical</span>' : ''}</span>
          <span class="alloc-row-amt">Rs ${Number(i.amount).toLocaleString()}</span>
        </div>
        <div class="alloc-row-track"><div class="alloc-row-fill" style="width:${pct(i.amount)}%;background:${i.color}"></div></div>
        ${i.detail ? `<div class="alloc-row-detail">${escapeHtml(i.detail)}</div>` : ''}
      </div>
      <button class="alloc-row-del" data-id="${i.id}" title="Remove"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');

  el.querySelectorAll('.alloc-row-del').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function showToast(message, tone = 'default') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  const border = tone === 'success' ? 'var(--success)' : tone === 'error' ? 'var(--danger)' : 'var(--border-strong)';
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--surface-2);border:1px solid ${border};border-radius:10px;padding:12px 16px;font-size:13px;color:var(--text-primary);box-shadow:0 12px 28px -8px rgba(0,0,0,0.5);z-index:80;max-width:340px;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3400);
}

// ===== Smart sync (Loans Critical / Rent / Bills / Committees) =====
const SYNC_CARDS = [
  { source: 'loans_critical', title: 'Loans Critical', icon: 'ti-alert-triangle', color: '#e5484d', sub: 'Loans due within 7 days' },
  { source: 'rent', title: 'Rent', icon: 'ti-home-2', color: '#d4a24e', sub: 'This month, if unpaid' },
  { source: 'bills', title: 'Bills', icon: 'ti-bolt', color: '#facc15', sub: 'Pending bills this month' },
  { source: 'committees', title: 'Committees', icon: 'ti-users-group', color: '#c084fc', sub: 'Kameti dues this month' },
];

let lastSyncPreview = null;

async function loadSyncPreview() {
  const month = salaryMonth.value;
  const grid = document.getElementById('syncGrid');
  try {
    const res = await fetch(`${API}/sync-preview?month=${month}`);
    const data = await res.json();
    lastSyncPreview = data;
    renderSyncGrid(data);
    renderQuickRentForm(data.rent);
  } catch (err) {
    console.error('Failed to load sync preview:', err);
    grid.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't check Loans/Rent/Bills/Committees</span></div>`;
  }
}

function isSynced(source) {
  return currentItems.some(i => i.source === source);
}

function renderSyncGrid(data) {
  const grid = document.getElementById('syncGrid');
  grid.innerHTML = SYNC_CARDS.map(card => {
    const info = data[card.source] || { amount: 0, detail: '' };
    const due = Number(info.amount) > 0;
    const synced = isSynced(card.source);
    const isCritical = card.source === 'loans_critical' && due;

    return `
      <div class="sync-card ${due ? 'due' : ''} ${isCritical ? 'critical' : ''}" style="--sc-color:${card.color}">
        <div class="sync-card-top">
          <span class="sync-card-icon"><i class="ti ${card.icon}"></i></span>
          <div>
            <div class="sync-card-title">${card.title}</div>
            <div class="sync-card-sub">${card.source === 'rent' && info.status === 'paid' ? 'Already paid this month' : card.sub}</div>
          </div>
        </div>
        <div class="sync-card-amount">Rs ${Number(info.amount || 0).toLocaleString()}</div>
        <div class="sync-card-detail">${escapeHtml(info.detail || (due ? '' : 'Nothing due right now'))}</div>
        <button type="button" class="sync-card-btn ${synced ? 'synced' : ''}" data-source="${card.source}" ${!due && !synced ? 'disabled' : ''}>
          <i class="ti ${synced ? 'ti-check' : 'ti-arrow-down-to-arc'}"></i> ${synced ? 'Synced — tap to refresh' : 'Sync to plan'}
        </button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.sync-card-btn').forEach(btn => {
    btn.addEventListener('click', () => syncSource(btn.dataset.source));
  });
}

async function syncSource(source) {
  const month = salaryMonth.value;
  try {
    const res = await fetch(`${API}/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, source }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sync failed');

    // Refresh the plan's items so the new/updated/removed row shows up.
    const planRes = await fetch(`${API}?month=${month}`);
    const planData = await planRes.json();
    currentItems = planData.items;
    render();

    if (data.item) {
      showToast(`${SYNC_CARDS.find(c => c.source === source).title} synced — Rs ${Number(data.item.amount).toLocaleString()} added to your plan.`, 'success');
    } else {
      showToast(`Nothing due for ${SYNC_CARDS.find(c => c.source === source).title} — removed from your plan if it was there.`);
    }
    renderSyncGrid(lastSyncPreview);
  } catch (err) {
    console.error('Sync failed:', err);
    showToast('Could not sync — please try again.', 'error');
  }
}

// ===== Quick "add rent for this month" =====
const quickRentForm = document.getElementById('quickRentForm');

function renderQuickRentForm(rentInfo) {
  if (!rentInfo || rentInfo.status !== 'none') {
    quickRentForm.classList.remove('visible');
    return;
  }
  quickRentForm.classList.add('visible');
  const month = salaryMonth.value;
  const dueInput = document.getElementById('quickRentDue');
  if (!dueInput.value || !dueInput.value.startsWith(month)) {
    dueInput.value = `${month}-05`; // sensible default, editable
  }
}

quickRentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const month = salaryMonth.value;
  const amount = Number(document.getElementById('quickRentAmount').value);
  const due_date = document.getElementById('quickRentDue').value;
  if (!amount || !due_date) return;

  const btn = quickRentForm.querySelector('button');
  btn.disabled = true;
  try {
    const res = await fetch('/api/rent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month_year: month, amount, due_date, status: 'unpaid' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not add rent');
    quickRentForm.reset();
    showToast('Rent recorded for this month.', 'success');
    await loadSyncPreview();
    await syncSource('rent');
  } catch (err) {
    console.error('Quick rent add failed:', err);
    showToast(err.message || 'Could not add rent — please try again.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ===== Calculate & Save =====
document.getElementById('calcSaveBtn').addEventListener('click', async () => {
  const btn = document.getElementById('calcSaveBtn');
  const month = salaryMonth.value;
  const salary = Number(salaryInput.value) || 0;
  if (!salary) {
    showToast('Enter your salary first.', 'error');
    salaryInput.focus();
    return;
  }

  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.7s linear infinite"></i> Calculating…';
  try {
    await fetch(API, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, salary, calculate: true }),
    });
    const allocated = currentItems.reduce((s, i) => s + Number(i.amount), 0);
    const remaining = salary - allocated;
    const monthLabel = MONTH_NAMES_FULL[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4);
    showToast(
      `This month's (${monthLabel}) salary of Rs ${salary.toLocaleString()} has been calculated & saved — Rs ${remaining.toLocaleString()} remaining.`,
      remaining < 0 ? 'error' : 'success'
    );
    loadHistory();
  } catch (err) {
    console.error('Calculate & save failed:', err);
    showToast('Could not save — please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

// ===== Salary history =====
async function loadHistory() {
  const el = document.getElementById('historyList');
  try {
    const res = await fetch(`${API}/history`);
    const rows = await res.json();
    renderHistory(rows);
  } catch (err) {
    console.error('Failed to load salary history:', err);
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't load history</span></div>`;
  }
}

function renderHistory(rows) {
  const el = document.getElementById('historyList');
  if (!rows || rows.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-history"></i><span>No months calculated yet — hit "Calculate &amp; Save" above</span></div>`;
    return;
  }

  const monthLabel = (my) => {
    const [y, m] = my.split('-');
    return `${MONTH_NAMES_FULL[Number(m) - 1]} ${y}`;
  };

  el.innerHTML = `
    <div class="table-scroll">
      <table class="history-table">
        <thead>
          <tr><th>Month</th><th>Salary</th><th>Allocated</th><th>Remaining</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${r.month_year === salaryMonth.value ? 'current-row' : ''}">
              <td>${monthLabel(r.month_year)}</td>
              <td>Rs ${r.salary.toLocaleString()}</td>
              <td>Rs ${r.allocated.toLocaleString()}</td>
              <td class="${r.remaining < 0 ? 'history-amt-neg' : 'history-amt-pos'}">Rs ${r.remaining.toLocaleString()}</td>
              <td><span class="history-badge ${r.calculated_at ? '' : 'draft'}">${r.calculated_at ? 'Calculated' : 'Draft'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ===== Init =====
populateMonths();
loadPlan();
