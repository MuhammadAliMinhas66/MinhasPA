const API = '/api/expenses';
const CATEGORIES_API = '/api/categories';

const expensesBody = document.getElementById('expensesBody');
const railList = document.getElementById('categoryRailList');
const railLoading = document.getElementById('railLoading');
const modalOverlay = document.getElementById('modalOverlay');
const expenseForm = document.getElementById('expenseForm');
const paidBySelect = document.getElementById('paidBy');
const payerNameWrap = document.getElementById('payerNameWrap');
const payerNameInput = document.getElementById('payerName');
const categorySelect = document.getElementById('category');
const newCatBox = document.getElementById('newCatBox');
const newCatLabel = document.getElementById('newCatLabel');
const newCatPreviewIcon = document.getElementById('newCatPreviewIcon');
const newCatPreviewLabel = document.getElementById('newCatPreviewLabel');
const statusSelect = document.getElementById('status');

const dateFilter = document.getElementById('dateFilter');
const dateFilterBtn = document.getElementById('dateFilterBtn');
const dateFilterLabel = document.getElementById('dateFilterLabel');
const datePresets = document.getElementById('datePresets');
const monthPicker = document.getElementById('monthPicker');
const dayPicker = document.getElementById('dayPicker');

let currentCategory = '';
let chart;
let lastChartSummary = null;

// ===== Categories (dynamic — includes custom ones the user creates) =====
let CATEGORIES = [];               // raw list from the API
let CATEGORY_MAP = {};             // key -> {label, icon, color}

// ===== Auto icon + colour matching =====
// The user never picks these manually. When they type a category name we
// match it against a large keyword → icon table (falling back to a
// deterministic pick from a big icon pool so every name still gets a
// sensible, distinct-looking icon), and the colour is picked the same way
// from a wide palette — always consistent for the same name.

const KEYWORD_ICON_MAP = [
  [['mobile', 'sim', 'topup', 'top up', 'balance'], 'ti-device-mobile'],
  [['internet', 'wifi', 'broadband'], 'ti-wifi'],
  [['electric', 'bijli', 'power'], 'ti-bolt'],
  [['water', 'pani'], 'ti-droplet'],
  [['gas', 'sui'], 'ti-flame'],
  [['fuel', 'petrol', 'diesel'], 'ti-gas-station'],
  [['rent', 'house', 'home'], 'ti-home-2'],
  [['grocery', 'groceries', 'ration'], 'ti-shopping-cart'],
  [['meal', 'food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'dining'], 'ti-tools-kitchen-2'],
  [['coffee', 'tea', 'chai'], 'ti-cup'],
  [['snack', 'sweet', 'bakery', 'cake'], 'ti-cookie'],
  [['travel', 'trip', 'vacation', 'holiday'], 'ti-plane'],
  [['flight', 'airline', 'airport'], 'ti-plane-departure'],
  [['taxi', 'cab', 'uber', 'careem', 'rickshaw'], 'ti-car'],
  [['bus', 'coach'], 'ti-bus'],
  [['train', 'railway'], 'ti-train'],
  [['bike', 'motorcycle', 'bicycle'], 'ti-bike'],
  [['car', 'vehicle', 'auto'], 'ti-car'],
  [['parking'], 'ti-parking-circle'],
  [['family', 'kids', 'children'], 'ti-users'],
  [['baby'], 'ti-baby-carriage'],
  [['pet', 'dog', 'cat', 'vet'], 'ti-paw'],
  [['kameti', 'committee'], 'ti-coins'],
  [['loan', 'emi', 'installment', 'debt'], 'ti-credit-card'],
  [['saving', 'invest'], 'ti-moneybag'],
  [['tax', 'zakat'], 'ti-receipt-tax'],
  [['insurance', 'takaful'], 'ti-shield-check'],
  [['gym', 'fitness', 'workout', 'exercise'], 'ti-barbell'],
  [['sport', 'football', 'cricket', 'game'], 'ti-ball-football'],
  [['health', 'medical', 'doctor', 'hospital', 'clinic'], 'ti-stethoscope'],
  [['medicine', 'pharmacy', 'pill', 'drug'], 'ti-pill'],
  [['dentist', 'dental', 'tooth'], 'ti-dental'],
  [['salon', 'haircut', 'barber', 'beauty', 'spa'], 'ti-scissors'],
  [['cloth', 'clothes', 'dress', 'apparel', 'fashion'], 'ti-shirt'],
  [['shoe', 'footwear'], 'ti-shoe'],
  [['shopping', 'mall', 'store'], 'ti-shopping-bag'],
  [['gift', 'present'], 'ti-gift'],
  [['charity', 'donation', 'sadqa', 'sadaqah'], 'ti-heart-handshake'],
  [['wedding', 'shaadi', 'marriage'], 'ti-heart'],
  [['party', 'celebration', 'event'], 'ti-confetti'],
  [['movie', 'cinema', 'film'], 'ti-device-tv'],
  [['music', 'song'], 'ti-music'],
  [['game', 'gaming', 'playstation', 'xbox'], 'ti-device-gamepad-2'],
  [['book', 'study', 'course', 'tuition', 'education', 'school', 'college', 'university'], 'ti-school'],
  [['stationery', 'stationary', 'pen', 'notebook'], 'ti-pencil'],
  [['subscription', 'netflix', 'streaming', 'membership'], 'ti-device-tv-old'],
  [['phone', 'call'], 'ti-phone'],
  [['laptop', 'computer', 'pc'], 'ti-device-laptop'],
  [['repair', 'maintenance', 'fix', 'mechanic'], 'ti-tool'],
  [['furniture', 'appliance'], 'ti-armchair'],
  [['plant', 'garden', 'flower'], 'ti-plant-2'],
  [['office', 'work', 'business'], 'ti-briefcase'],
  [['tip', 'bakhshish'], 'ti-hand-stop'],
  [['other', 'misc', 'general'], 'ti-dots'],
];

const ICON_POOL = [
  'ti-tag', 'ti-star', 'ti-heart', 'ti-gift', 'ti-briefcase', 'ti-paw', 'ti-car', 'ti-book-2',
  'ti-shopping-bag', 'ti-cup', 'ti-plane', 'ti-bike', 'ti-home-2', 'ti-bolt', 'ti-droplet',
  'ti-flame', 'ti-users', 'ti-coins', 'ti-shield-check', 'ti-barbell', 'ti-stethoscope',
  'ti-pill', 'ti-scissors', 'ti-shirt', 'ti-gift-card', 'ti-confetti', 'ti-music',
  'ti-device-gamepad-2', 'ti-school', 'ti-pencil', 'ti-phone', 'ti-device-laptop', 'ti-tool',
  'ti-plant-2', 'ti-camera', 'ti-map-pin', 'ti-ticket', 'ti-cookie', 'ti-fish', 'ti-egg',
];

const COLOR_PALETTE = [
  '#d4a24e', '#2dd4bf', '#f2a93b', '#7c9eff', '#e5484d', '#c084fc', '#4ade80', '#f472b6',
  '#38bdf8', '#fb923c', '#a3e635', '#f87171', '#60a5fa', '#e879f9', '#facc15', '#34d399',
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
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

async function loadCategories() {
  try {
    const res = await fetch(CATEGORIES_API);
    if (!res.ok) throw new Error('Failed to load categories');
    CATEGORIES = await res.json();
  } catch (err) {
    // Fall back to the original built-in set so the page still works if
    // the categories table/route isn't set up yet.
    CATEGORIES = [
      { key: 'mobile', label: 'Mobile package', icon: 'ti-device-mobile', color: '#d4a24e', is_default: true },
      { key: 'meals', label: 'Meals', icon: 'ti-tools-kitchen-2', color: '#2dd4bf', is_default: true },
      { key: 'grocery', label: 'Grocery', icon: 'ti-shopping-cart', color: '#f2a93b', is_default: true },
      { key: 'travel', label: 'Travel', icon: 'ti-plane', color: '#7c9eff', is_default: true },
      { key: 'family', label: 'Family', icon: 'ti-users', color: '#e5484d', is_default: true },
      { key: 'kameti', label: 'Kameti / committee', icon: 'ti-coins', color: '#c084fc', is_default: true },
      { key: 'others', label: 'Others', icon: 'ti-dots', color: '#6b6960', is_default: true },
    ];
  }
  CATEGORY_MAP = {};
  CATEGORIES.forEach(c => { CATEGORY_MAP[c.key] = c; });
  renderRail();
  renderCategorySelect();
}

function renderRail() {
  railLoading?.remove();
  const items = CATEGORIES.map(c => `
    <button class="rail-item" data-filter="${c.key}" style="--cat-color:${c.color}">
      <span class="rail-dot"><i class="ti ${c.icon}"></i></span>
      <span class="rail-label">${escapeHtml(c.label)}</span>
    </button>
  `).join('');
  // Keep the existing "All" button (first child), append the rest.
  const allBtn = railList.querySelector('.rail-item[data-filter=""]');
  railList.innerHTML = '';
  if (allBtn) railList.appendChild(allBtn);
  railList.insertAdjacentHTML('beforeend', items);
}

function renderCategorySelect(selectValue) {
  const options = CATEGORIES.map(c => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
  categorySelect.innerHTML = options + `<option value="__new__">+ Add new category…</option>`;
  if (selectValue) categorySelect.value = selectValue;
}

// Re-match the icon/colour on every keystroke — the user just names the
// category and the preview shows what will be used automatically.
newCatLabel.addEventListener('input', updateNewCatPreview);

function updateNewCatPreview() {
  const label = newCatLabel.value.trim();
  selectedIcon = label ? autoIconFor(label) : ICON_POOL[0];
  selectedColor = label ? autoColorFor(label) : COLOR_PALETTE[0];
  newCatPreviewIcon.innerHTML = `<i class="ti ${selectedIcon}"></i>`;
  newCatPreviewIcon.style.setProperty('--preview-color', selectedColor);
  newCatPreviewLabel.textContent = label || 'Your new category';
}

categorySelect.addEventListener('change', () => {
  const isNew = categorySelect.value === '__new__';
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
  if (!res.ok) throw new Error('Failed to create category');
  const created = await res.json();
  CATEGORIES.push(created);
  CATEGORY_MAP[created.key] = created;
  renderRail();
  renderCategorySelect();
  return created;
}

// ===== Date filter (navbar calendar popover) =====
// currentMonth / currentDate / currentYear are mutually exclusive — the
// most specific one set wins. Empty means "all time".
let currentMonth = '';
let currentDate = '';
let currentYear = '';

function thisMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function lastMonthValue() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function applyPreset(preset) {
  currentDate = '';
  currentMonth = '';
  currentYear = '';
  dayPicker.value = '';

  if (preset === 'month') {
    currentMonth = thisMonthValue();
    monthPicker.value = currentMonth;
    dateFilterLabel.textContent = 'This month';
  } else if (preset === 'last-month') {
    currentMonth = lastMonthValue();
    monthPicker.value = currentMonth;
    const d = new Date(`${currentMonth}-01T00:00:00`);
    dateFilterLabel.textContent = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } else if (preset === 'year') {
    currentYear = String(new Date().getFullYear());
    monthPicker.value = '';
    dateFilterLabel.textContent = currentYear;
  } else if (preset === 'all') {
    monthPicker.value = '';
    dateFilterLabel.textContent = 'All time';
  }

  datePresets.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
  loadExpenses();
}

datePresets.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  applyPreset(btn.dataset.preset);
});

dateFilterBtn.addEventListener('click', () => {
  dateFilter.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!dateFilter.contains(e.target)) dateFilter.classList.remove('open');
});

document.getElementById('applyDateFilter').addEventListener('click', () => {
  datePresets.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

  if (dayPicker.value) {
    currentDate = dayPicker.value;
    currentMonth = '';
    currentYear = '';
    dateFilterLabel.textContent = new Date(`${currentDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } else if (monthPicker.value) {
    currentMonth = monthPicker.value;
    currentDate = '';
    currentYear = '';
    const d = new Date(`${currentMonth}-01T00:00:00`);
    dateFilterLabel.textContent = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } else {
    currentMonth = '';
    currentDate = '';
    currentYear = '';
    dateFilterLabel.textContent = 'All time';
    datePresets.querySelector('[data-preset="all"]').classList.add('active');
  }

  dateFilter.classList.remove('open');
  loadExpenses();
});

document.getElementById('clearDateFilter').addEventListener('click', () => {
  monthPicker.value = '';
  dayPicker.value = '';
  applyPreset('month');
  dateFilter.classList.remove('open');
});

// Picking an exact day auto-clears the month picker so it's obvious which
// one will actually be applied, and vice versa.
dayPicker.addEventListener('change', () => { if (dayPicker.value) monthPicker.value = ''; });
monthPicker.addEventListener('change', () => { if (monthPicker.value) dayPicker.value = ''; });

// Initialize to "this month"
monthPicker.value = thisMonthValue();
currentMonth = thisMonthValue();

// ===== Load + render expenses =====
async function loadExpenses() {
  expensesBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading expenses…</span></div></td></tr>`;

  const listParams = new URLSearchParams();
  const summaryParams = new URLSearchParams();

  if (currentDate) { listParams.set('date', currentDate); summaryParams.set('date', currentDate); }
  else if (currentMonth) { listParams.set('month', currentMonth); summaryParams.set('month', currentMonth); }
  else if (currentYear) { listParams.set('year', currentYear); summaryParams.set('year', currentYear); }

  if (currentCategory) listParams.set('category', currentCategory);

  let list, summary;

  try {
    const [listRes, summaryRes] = await Promise.all([
      fetch(`${API}?${listParams.toString()}`),
      fetch(`${API}/summary?${summaryParams.toString()}`)
    ]);
    if (!listRes.ok || !summaryRes.ok) throw new Error('Request failed');
    list = await listRes.json();
    summary = await summaryRes.json();
  } catch (err) {
    expensesBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database. Check your .env and that SQL Server is running.</span></div></td></tr>`;
    return;
  }

  renderExpenses(list);
  renderSummary(list, summary);

  try {
    renderChart(summary);
  } catch (err) {
    console.error('Chart render failed:', err);
    const ctx = document.getElementById('categoryChart');
    ctx.parentElement.innerHTML = `<div class="empty-state"><i class="ti ti-chart-bar"></i><span>Chart couldn't render — data above is still accurate</span></div>`;
  }

  try {
    renderStatusBreakdown(list);
  } catch (err) {
    console.error('Status breakdown render failed:', err);
  }
}

function renderExpenses(rows) {
  if (rows.length === 0) {
    expensesBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No expenses match this filter</span></div></td></tr>`;
    return;
  }

  let html = '';
  let lastGroup = null;

  // The API already orders "paid by someone else" first, then "paid by you"
  // — this just draws the divider whenever the group actually changes.
  rows.forEach(r => {
    const group = r.paid_by === 'other' ? 'other' : 'me';
    if (group !== lastGroup) {
      html += group === 'other'
        ? `<tr class="section-divider"><td colspan="7"><div class="section-divider-label by-other"><i class="ti ti-users"></i> Paid by someone else, for you</div></td></tr>`
        : `<tr class="section-divider"><td colspan="7"><div class="section-divider-label"><i class="ti ti-wallet"></i> Paid by you</div></td></tr>`;
      lastGroup = group;
    }
    html += expenseRowHtml(r);
  });

  expensesBody.innerHTML = html;
}

function categoryLabel(key) {
  return CATEGORY_MAP[key]?.label || key;
}
function categoryColor(key) {
  return CATEGORY_MAP[key]?.color || '#6b6960';
}
function categoryIcon(key) {
  return CATEGORY_MAP[key]?.icon || 'ti-tag';
}

function expenseRowHtml(r) {
  const isUnpaid = r.status === 'unpaid';
  return `
    <tr class="expense-row ${r.paid_by === 'other' ? 'paid-other' : ''} ${isUnpaid ? 'status-unpaid' : 'status-paid'}">
      <td>
        <span style="display:inline-flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${categoryColor(r.category)};display:inline-block"></span>
          ${escapeHtml(categoryLabel(r.category))}
        </span>
      </td>
      <td class="amount-cell">Rs ${Number(r.amount).toLocaleString()}</td>
      <td>${formatDate(r.expense_date)}</td>
      <td>${r.paid_by === 'other'
          ? `<span class="badge badge-warning" title="Paid by someone else">${escapeHtml(r.payer_name || 'Other')}</span>${r.linked_loan_id ? '<span class="linked-badge" title="Linked to a loan — settling one settles both"><i class="ti ti-link"></i> linked</span>' : ''}`
          : `<span style="color:var(--text-secondary)">Me</span>`}</td>
      <td style="color:var(--text-secondary)">${escapeHtml(r.note || '—')}</td>
      <td>
        <span class="status-pill ${isUnpaid ? 'unpaid' : 'paid'}">${isUnpaid ? 'Unpaid' : 'Paid'}</span>
      </td>
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
            <button class="danger" onclick="closeActionMenus(); deleteExpense('${r.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderSummary(rows, summary) {
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  document.getElementById('totalSpent').textContent = `Rs ${total.toLocaleString()}`;
  document.getElementById('entryCount').textContent = rows.length;

  const top = [...summary].sort((a, b) => b.total - a.total)[0];
  document.getElementById('topCategory').textContent = top ? categoryLabel(top.category) : '—';
}

function renderStatusBreakdown(rows) {
  const el = document.getElementById('statusBreakdown');
  if (!el) return;

  if (rows.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-mood-empty"></i><span>No data for this period yet</span></div>`;
    return;
  }

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const paid = rows.filter(r => r.status !== 'unpaid').reduce((s, r) => s + Number(r.amount), 0);

  // Unpaid, and you're on the hook for it directly (no one covered it).
  const oweDirect = rows.filter(r => r.status === 'unpaid' && r.paid_by !== 'other')
    .reduce((s, r) => s + Number(r.amount), 0);

  // Unpaid, and someone else covered it because you didn't have the cash —
  // this is money YOU owe THEM back, grouped by who it is.
  const oweBackRows = rows.filter(r => r.status === 'unpaid' && r.paid_by === 'other');
  const oweBackTotal = oweBackRows.reduce((s, r) => s + Number(r.amount), 0);
  const byPayer = {};
  oweBackRows.forEach(r => {
    const name = r.payer_name || 'Someone';
    byPayer[name] = (byPayer[name] || 0) + Number(r.amount);
  });
  const payerBreakdown = Object.entries(byPayer).sort((a, b) => b[1] - a[1]);
  const payerSubtext = payerBreakdown.length
    ? payerBreakdown.map(([name, amt]) => `${escapeHtml(name)}: Rs ${amt.toLocaleString()}`).join(' · ')
    : 'Someone covered these for you';

  const totalUnpaid = oweDirect + oweBackTotal;
  const pct = (x) => (total ? (x / total) * 100 : 0);

  el.innerHTML = `
    <div class="status-hero">
      <div class="status-hero-num" style="color:${totalUnpaid > 0 ? 'var(--danger)' : 'var(--success)'}">Rs ${totalUnpaid.toLocaleString()}</div>
      <div class="status-hero-label">${totalUnpaid > 0 ? 'total still unpaid this period' : 'all settled — nothing owed 🎉'}</div>
    </div>

    <div class="status-track" title="You need to pay Rs ${oweDirect.toLocaleString()} · You need to pay back Rs ${oweBackTotal.toLocaleString()} · Already settled Rs ${paid.toLocaleString()}">
      <div class="status-seg seg-direct" data-w="${pct(oweDirect)}" style="width:0%"></div>
      <div class="status-seg seg-back" data-w="${pct(oweBackTotal)}" style="width:0%"></div>
      <div class="status-seg seg-paid" data-w="${pct(paid)}" style="width:0%"></div>
    </div>

    <div class="status-cards">
      <div class="status-card sc-direct">
        <span class="status-card-dot"></span>
        <div class="status-card-text">
          <span class="status-card-label">You need to pay</span>
          <span class="status-card-sub">Expenses you haven't paid for yet</span>
        </div>
        <span class="status-card-amt">Rs ${oweDirect.toLocaleString()}</span>
      </div>
      <div class="status-card sc-back">
        <span class="status-card-dot"></span>
        <div class="status-card-text">
          <span class="status-card-label">You need to pay back</span>
          <span class="status-card-sub">${payerSubtext}</span>
        </div>
        <span class="status-card-amt">Rs ${oweBackTotal.toLocaleString()}</span>
      </div>
      <div class="status-card sc-paid">
        <span class="status-card-dot"></span>
        <div class="status-card-text">
          <span class="status-card-label">Already settled</span>
          <span class="status-card-sub">Nothing left to do here</span>
        </div>
        <span class="status-card-amt">Rs ${paid.toLocaleString()}</span>
      </div>
    </div>
  `;

  // Grow the bar segments in on the next frame instead of jumping straight
  // to full width — makes it read as alive rather than static.
  requestAnimationFrame(() => {
    el.querySelectorAll('.status-seg').forEach(seg => {
      seg.style.width = `${seg.dataset.w}%`;
    });
  });
}

// ===== Redesigned chart: donut with a live center total + custom legend =====
function renderChart(summary) {
  lastChartSummary = summary;
  const ctx = document.getElementById('categoryChart');
  const legendEl = document.getElementById('chartLegend');
  const centerValueEl = document.getElementById('chartCenterValue');

  const sorted = [...summary].sort((a, b) => Number(b.total) - Number(a.total));
  const labels = sorted.map(s => categoryLabel(s.category));
  const data = sorted.map(s => Number(s.total));
  const colors = sorted.map(s => categoryColor(s.category));
  const grandTotal = data.reduce((a, b) => a + b, 0);

  centerValueEl.textContent = `Rs ${grandTotal.toLocaleString()}`;

  if (chart) chart.destroy();

  if (sorted.length === 0) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    legendEl.innerHTML = `<div class="empty-state"><i class="ti ti-chart-donut-3"></i><span>No data for this period yet</span></div>`;
    return;
  }

  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: cssVar('--surface'), borderWidth: 3, hoverOffset: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { display: false } }
    }
  });

  legendEl.innerHTML = sorted.map((s, i) => {
    const pct = grandTotal ? (data[i] / grandTotal) * 100 : 0;
    return `
      <div class="legend-row" style="--lg-color:${colors[i]};animation-delay:${i * 0.04}s">
        <span class="legend-icon"><i class="ti ${categoryIcon(s.category)}"></i></span>
        <div class="legend-info">
          <div class="legend-top">
            <span class="legend-name">${escapeHtml(labels[i])}</span>
            <span class="legend-amount">Rs ${data[i].toLocaleString()}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="legend-bar-track" style="flex:1"><div class="legend-bar-fill" data-width="${pct}"></div></div>
            <span class="legend-pct">${pct.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Animate the bars in on the next frame instead of jumping straight to
  // full width, so the legend feels alive rather than static.
  requestAnimationFrame(() => {
    legendEl.querySelectorAll('.legend-bar-fill').forEach(el => {
      el.style.width = `${el.dataset.width}%`;
    });
  });
}

// ===== Category filter (sticky rail) =====
railList.addEventListener('click', (e) => {
  const item = e.target.closest('.rail-item');
  if (!item) return;
  document.querySelectorAll('.rail-item').forEach(c => c.classList.remove('active'));
  item.classList.add('active');
  currentCategory = item.dataset.filter;
  loadExpenses();
});

document.getElementById('railAddCategoryBtn').addEventListener('click', () => {
  openAdd();
  categorySelect.value = '__new__';
  categorySelect.dispatchEvent(new Event('change'));
});

// ===== Paid by / payer name =====
let currentLinkedLoanId = null;

paidBySelect.addEventListener('change', () => {
  togglePayerNameField();
  updateLinkLoanUI();
  if (paidBySelect.value === 'other') payerNameInput.focus();
});

statusSelect.addEventListener('change', updateLinkLoanUI);

function togglePayerNameField() {
  const isOther = paidBySelect.value === 'other';
  payerNameWrap.style.display = isOther ? '' : 'none';
  payerNameInput.required = isOther;
  if (!isOther) payerNameInput.value = '';
}

// Shows the "track as loan" checkbox for eligible new/unlinked expenses,
// or the "already linked" status strip if this one is linked — never both.
function updateLinkLoanUI() {
  const eligible = paidBySelect.value === 'other' && statusSelect.value === 'unpaid';
  const linkBox = document.getElementById('linkLoanBox');
  const statusBox = document.getElementById('linkLoanStatus');

  if (currentLinkedLoanId) {
    statusBox.style.display = eligible ? 'flex' : 'none';
    linkBox.style.display = 'none';
  } else {
    linkBox.style.display = eligible ? 'block' : 'none';
    statusBox.style.display = 'none';
  }
}

document.getElementById('unlinkLoanBtn').addEventListener('click', async () => {
  const id = document.getElementById('expenseId').value;
  if (!id) return;
  if (!confirm("Unlink this expense from its loan? The loan entry itself stays on the Loans page untouched.")) return;
  await fetch(`${API}/${id}/link-loan`, { method: 'DELETE' });
  currentLinkedLoanId = null;
  updateLinkLoanUI();
  loadExpenses();
});

// Enter confirms the payer name instead of submitting the form early.
payerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    payerNameInput.blur();
  }
});

// ===== Modal =====
document.getElementById('addExpenseBtn').addEventListener('click', openAdd);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

function openAdd() {
  expenseForm.reset();
  document.getElementById('expenseId').value = '';
  document.getElementById('modalTitle').textContent = 'Add an expense';
  document.getElementById('expenseDate').value = new Date().toISOString().slice(0, 10);
  paidBySelect.value = 'me';
  togglePayerNameField();
  statusSelect.value = 'paid';
  currentLinkedLoanId = null;
  document.getElementById('linkLoanCheckbox').checked = true;
  updateLinkLoanUI();
  newCatBox.classList.remove('open');
  renderCategorySelect();
  modalOverlay.classList.add('open');
}

async function openEdit(id) {
  const res = await fetch(API);
  const all = await res.json();
  const item = all.find(x => x.id === id);
  if (!item) return;

  document.getElementById('expenseId').value = item.id;
  document.getElementById('modalTitle').textContent = 'Edit expense';
  newCatBox.classList.remove('open');
  renderCategorySelect(item.category);
  document.getElementById('amount').value = item.amount;
  document.getElementById('expenseDate').value = item.expense_date.slice(0, 10);
  document.getElementById('note').value = item.note || '';
  paidBySelect.value = item.paid_by === 'other' ? 'other' : 'me';
  payerNameInput.value = item.payer_name || '';
  togglePayerNameField();
  statusSelect.value = item.status === 'unpaid' ? 'unpaid' : 'paid';

  currentLinkedLoanId = item.linked_loan_id || null;
  document.getElementById('linkLoanCheckbox').checked = true;
  if (currentLinkedLoanId) {
    try {
      const loansRes = await fetch('/api/loans');
      const loans = await loansRes.json();
      const loan = loans.find(l => l.id === currentLinkedLoanId);
      document.getElementById('linkLoanPerson').textContent = loan ? loan.person_name : (item.payer_name || 'them');
    } catch (err) {
      document.getElementById('linkLoanPerson').textContent = item.payer_name || 'them';
    }
  }
  updateLinkLoanUI();

  modalOverlay.classList.add('open');
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('expenseId').value;
  const saveBtn = document.getElementById('saveExpenseBtn');
  let categoryKey = categorySelect.value;

  if (categoryKey === '__new__') {
    const label = newCatLabel.value.trim();
    if (!label) {
      alert('Please name the new category.');
      newCatLabel.focus();
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Creating category…';
    try {
      const created = await createCategory(label, selectedIcon, selectedColor);
      categoryKey = created.key;
    } catch (err) {
      alert('Could not create the new category. Please try again.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save expense';
      return;
    }
    saveBtn.textContent = 'Save expense';
  }

  const payload = {
    category: categoryKey,
    amount: parseFloat(document.getElementById('amount').value),
    expense_date: document.getElementById('expenseDate').value,
    note: document.getElementById('note').value,
    paid_by: paidBySelect.value,
    payer_name: paidBySelect.value === 'other' ? payerNameInput.value.trim() : null,
    status: statusSelect.value === 'unpaid' ? 'unpaid' : 'paid',
  };

  if (payload.paid_by === 'other' && !payload.payer_name) {
    alert('Please enter who paid for this.');
    payerNameInput.focus();
    saveBtn.disabled = false;
    return;
  }

  try {
    saveBtn.disabled = true;
    const res = await fetch(id ? `${API}/${id}` : API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Save failed');
    const saved = await res.json();

    // If eligible and not already linked, and the user left the "track as
    // loan" box checked, create/attach the matching loan entry now.
    const wantsLink = document.getElementById('linkLoanBox').style.display !== 'none'
      && document.getElementById('linkLoanCheckbox').checked;
    if (wantsLink && !currentLinkedLoanId) {
      try {
        await fetch(`${API}/${saved.id}/link-loan`, { method: 'POST' });
      } catch (linkErr) {
        console.error('Auto-link to loan failed:', linkErr);
      }
    }

    closeModal();
    loadExpenses();
  } catch (err) {
    alert('Could not save the expense. Check your database connection.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save expense';
  }
});

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await fetch(`${API}/${id}`, { method: 'DELETE' });
  loadExpenses();
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadCategories().then(loadExpenses);

// Redraw the donut with the correct surface-border colour when the theme flips.
document.addEventListener('mpa-theme-change', () => {
  if (lastChartSummary) renderChart(lastChartSummary);
});
