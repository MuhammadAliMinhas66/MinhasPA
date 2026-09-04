const API = '/api/investments';
const MARKET_API = '/api/market';

const TYPE_META = {
  stocks:   { label: 'Stocks',    icon: 'ti-chart-candle',      color: '#5b8def' },
  crypto:   { label: 'Crypto',    icon: 'ti-currency-bitcoin',  color: '#f2a900' },
  gold:     { label: 'Gold',      icon: 'ti-diamond',           color: '#d4af37' },
  property: { label: 'Property',  icon: 'ti-building-estate',   color: '#6bb37a' },
  business: { label: 'Business',  icon: 'ti-briefcase',         color: '#c77dff' },
  vehicle:  { label: 'Vehicle',   icon: 'ti-car',                color: '#ef8354' },
  bonds:    { label: 'Bonds/FD',  icon: 'ti-certificate',       color: '#4fb0c6' },
  cash:     { label: 'Cash',      icon: 'ti-cash',              color: '#8d99ae' },
  other:    { label: 'Other',     icon: 'ti-category',          color: '#a3a3a3' },
};

const VALUATION_MODE_BY_TYPE = {
  stocks: 'MARKET', crypto: 'MARKET', gold: 'MARKET',
  bonds: 'CALCULATED',
  property: 'MANUAL', business: 'MANUAL', vehicle: 'MANUAL', cash: 'MANUAL', other: 'MANUAL',
};

let currentFilter = 'all';
let currentInvestments = [];
let chart = null;
let selectedType = 'stocks';
let selectedAsset = null; // { symbol, name, currency, provider } for MARKET types
let searchDebounce = null;

const invBody = document.getElementById('invBody');
const chipRow = document.getElementById('chipRow');
const modalOverlay = document.getElementById('modalOverlay');
const invForm = document.getElementById('invForm');
const invCountPill = document.getElementById('invCountPill');
const invStatusSelect = document.getElementById('invStatus');
const soldFields = document.getElementById('soldFields');
const typePicker = document.getElementById('typePicker');

const marketFields = document.getElementById('marketFields');
const calculatedFields = document.getElementById('calculatedFields');
const manualFields = document.getElementById('manualFields');
const goldUnitRow = document.getElementById('goldUnitRow');
const assetSearchRow = document.getElementById('assetSearchRow');
const assetSearchInput = document.getElementById('assetSearch');
const searchResultsEl = document.getElementById('searchResults');
const selectedAssetChip = document.getElementById('selectedAssetChip');
const assetSearchTypeLabel = document.getElementById('assetSearchTypeLabel');

const valueModalOverlay = document.getElementById('valueModalOverlay');
const valueForm = document.getElementById('valueForm');

// Compact currency for big numbers: 2,200,000 -> "2.2M", 950,000 -> "950K".
// The exact figure is still available via the `title` tooltip wherever this
// is used in a rendered cell.
function trimTrailingZero(s) {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function formatMoney(n, opts = {}) {
  const { showSign = false } = opts;
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  let magnitude;
  if (abs >= 1e9) magnitude = `${trimTrailingZero((abs / 1e9).toFixed(1))}B`;
  else if (abs >= 1e6) magnitude = `${trimTrailingZero((abs / 1e6).toFixed(1))}M`;
  else if (abs >= 1e3) magnitude = `${trimTrailingZero((abs / 1e3).toFixed(1))}K`;
  else magnitude = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const sign = showSign ? (num >= 0 ? '+' : '-') : (num < 0 ? '-' : '');
  return `${sign}Rs ${magnitude}`;
}

function exactMoney(n) {
  return `Rs ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ===== Fetch & render =====
async function loadInvestments() {
  invBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading investments…</span></div></td></tr>`;

  const params = new URLSearchParams();
  if (currentFilter === 'sold') {
    params.set('status', 'sold');
  } else if (currentFilter !== 'all') {
    params.set('type', currentFilter);
    params.set('status', 'active');
  }

  try {
    const res = await fetch(`${API}?${params.toString()}`);
    if (res.status === 403) { showPaywall(); return; }
    if (!res.ok) throw new Error('Request failed');
    const rows = await res.json();
    currentInvestments = rows;
    renderTable(rows);
    invCountPill.innerHTML = `<i class="ti ti-list-details" style="font-size:12px"></i> ${rows.length} holding${rows.length === 1 ? '' : 's'}`;
  } catch (err) {
    invBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database. Check your .env and that SQL Server is running.</span></div></td></tr>`;
  }
}

async function loadSummary() {
  try {
    const res = await fetch(`${API}/summary`);
    if (!res.ok) throw new Error('Request failed');
    const summary = await res.json();
    renderStats(summary);
    renderChart(summary.by_type);
    renderRealized(summary.realized);
  } catch (err) {
    console.error('Summary load failed:', err);
  }
}

function renderTable(rows) {
  if (rows.length === 0) {
    invBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-mood-empty"></i><span>No holdings match this filter</span></div></td></tr>`;
    return;
  }

  invBody.innerHTML = rows.map(inv => {
    const meta = TYPE_META[inv.type] || TYPE_META.other;
    const isSold = inv.status === 'sold';
    const gl = isSold ? Number(inv.sold_value || 0) - Number(inv.invested_amount) : Number(inv.gain_loss);
    const glPct = isSold
      ? (Number(inv.invested_amount) > 0 ? ((gl / Number(inv.invested_amount)) * 100) : null)
      : (inv.gain_loss_pct === null ? null : Number(inv.gain_loss_pct));
    const glClass = gl > 0 ? 'positive' : gl < 0 ? 'negative' : 'neutral';
    const mode = inv.valuation_mode || VALUATION_MODE_BY_TYPE[inv.type];

    const priceStatusBadge = !isSold && inv.price_status
      ? `<span class="price-status ${inv.price_status}"><i class="ti ti-circle-filled"></i>${inv.price_status}</span>`
      : '';
    const priceMeta = !isSold && mode === 'MARKET' && inv.price_updated_at
      ? `<div class="price-meta">Updated ${timeAgo(inv.price_updated_at)}</div>` : '';

    const canManualUpdate = !isSold && mode === 'MANUAL';
    const canRefresh = !isSold && mode === 'MARKET';

    return `
    <tr class="${isSold ? 'status-sold' : ''}" data-id="${inv.id}">
      <td>
        <div class="person-cell">
          ${escapeHtml(inv.name)}
          ${inv.quantity ? `<span style="color:var(--text-tertiary,var(--text-secondary));font-size:11.5px;margin-left:4px">(${formatQty(inv.quantity)} ${escapeHtml(inv.unit || '')})</span>` : ''}
          ${inv.symbol && mode === 'MARKET' ? `<span style="color:var(--text-tertiary,var(--text-secondary));font-size:11px;margin-left:4px">· ${escapeHtml(inv.symbol)}</span>` : ''}
        </div>
      </td>
      <td><span class="type-badge" style="--tb-bg:${hexToDim(meta.color)};--tb-color:${meta.color}"><i class="ti ${meta.icon}"></i>${meta.label}</span></td>
      <td class="amount-cell" title="${exactMoney(inv.invested_amount)}">${formatMoney(inv.invested_amount)}</td>
      <td>
        <div class="value-cell">
          <div>
            <div class="amount-cell" title="${exactMoney(isSold ? inv.sold_value || 0 : inv.current_value)}">${formatMoney(isSold ? inv.sold_value || 0 : inv.current_value)}</div>
            ${!isSold ? `<div style="margin-top:3px">${priceStatusBadge}</div>${priceMeta}` : ''}
          </div>
          ${canManualUpdate ? `<button class="value-update-btn" title="Update value" onclick="openValueUpdate('${inv.id}', '${escapeHtml(inv.name).replace(/'/g, "\\'")}', ${inv.current_value})"><i class="ti ti-pencil"></i></button>` : ''}
          ${canRefresh ? `<button class="value-update-btn" title="Refresh price" onclick="refreshOne('${inv.id}')"><i class="ti ti-refresh"></i></button>` : ''}
        </div>
      </td>
      <td>
        <div class="gl-cell">
          <span class="gl-amount ${glClass}" title="${exactMoney(Math.abs(gl))}">${formatMoney(gl, { showSign: true })}</span>
          ${glPct !== null ? `<span class="gl-pct">${glPct >= 0 ? '+' : ''}${glPct.toFixed(1)}%</span>` : ''}
        </div>
      </td>
      <td>${inv.purchase_date ? formatDate(inv.purchase_date) : '—'}</td>
      <td>${isSold ? '<span class="badge badge-warning">Sold</span>' : '<span class="badge badge-success">Active</span>'}</td>
      <td>
        <div class="actions-dropdown">
          <button class="icon-btn actions-trigger" title="Actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
          </button>
          <div class="actions-menu">
            <button onclick="closeActionMenus(); openEdit('${inv.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              Edit
            </button>
            <button class="danger" onclick="closeActionMenus(); deleteInvestment('${inv.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function renderStats(summary) {
  const investedEl = document.getElementById('statInvested');
  const currentEl = document.getElementById('statCurrent');
  investedEl.textContent = formatMoney(summary.total_invested);
  investedEl.title = exactMoney(summary.total_invested);
  currentEl.textContent = formatMoney(summary.total_current_value);
  currentEl.title = exactMoney(summary.total_current_value);
  document.getElementById('statHoldings').textContent = summary.holding_count;

  const glEl = document.getElementById('statGainLoss');
  const glPctEl = document.getElementById('statGainLossPct');
  const gl = summary.total_gain_loss;
  glEl.textContent = formatMoney(gl, { showSign: true });
  glEl.title = exactMoney(Math.abs(gl));
  glEl.className = `stat-value ${gl > 0 ? 'positive' : gl < 0 ? 'negative' : 'neutral'}`;
  glPctEl.textContent = summary.total_gain_loss_pct === null ? '—' : `${summary.total_gain_loss_pct >= 0 ? '+' : ''}${summary.total_gain_loss_pct}%`;
}

function renderRealized(realized) {
  const box = document.getElementById('realizedBox');
  if (!realized || realized.count === 0) {
    box.innerHTML = `<div class="empty-state"><i class="ti ti-mood-empty"></i><span>Nothing sold yet — realized gains will show up here</span></div>`;
    return;
  }
  const gl = realized.realized_gain_loss;
  const glClass = gl > 0 ? 'positive' : gl < 0 ? 'negative' : 'neutral';
  box.innerHTML = `
    <div class="realized-row">
      <div class="realized-label"><i class="ti ti-tags"></i> Items sold</div>
      <div class="realized-value">${realized.count}</div>
    </div>
    <div class="realized-row">
      <div class="realized-label"><i class="ti ti-coins"></i> Invested (of sold items)</div>
      <div class="realized-value" title="${exactMoney(realized.total_invested)}">${formatMoney(realized.total_invested)}</div>
    </div>
    <div class="realized-row">
      <div class="realized-label"><i class="ti ti-cash-banknote"></i> Sold for</div>
      <div class="realized-value" title="${exactMoney(realized.total_sold_value)}">${formatMoney(realized.total_sold_value)}</div>
    </div>
    <div class="realized-row">
      <div class="realized-label"><i class="ti ti-chart-arrows-vertical"></i> Realized gain/loss</div>
      <div class="realized-value gl-amount ${glClass}" title="${exactMoney(Math.abs(gl))}">${formatMoney(gl, { showSign: true })}</div>
    </div>
  `;
}

function renderChart(byType) {
  const ctx = document.getElementById('typeChart');
  const legendEl = document.getElementById('chartLegend');
  const centerValueEl = document.getElementById('chartCenterValue');

  const sorted = [...(byType || [])].sort((a, b) => Number(b.current_value) - Number(a.current_value));
  const labels = sorted.map(s => (TYPE_META[s.type] || TYPE_META.other).label);
  const data = sorted.map(s => Number(s.current_value));
  const colors = sorted.map(s => (TYPE_META[s.type] || TYPE_META.other).color);
  const grandTotal = data.reduce((a, b) => a + b, 0);

  centerValueEl.textContent = formatMoney(grandTotal);
  centerValueEl.title = exactMoney(grandTotal);

  if (chart) chart.destroy();

  if (sorted.length === 0) {
    legendEl.innerHTML = `<div class="empty-state"><i class="ti ti-chart-donut-3"></i><span>No active holdings yet</span></div>`;
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
    const meta = TYPE_META[s.type] || TYPE_META.other;
    return `
      <div class="legend-row" style="--lg-color:${colors[i]}">
        <span class="legend-icon"><i class="ti ${meta.icon}"></i></span>
        <div class="legend-info">
          <div class="legend-top">
            <span class="legend-name">${escapeHtml(labels[i])}</span>
            <span class="legend-amount" title="${exactMoney(data[i])}">${formatMoney(data[i])}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="legend-bar-track" style="flex:1"><div class="legend-bar-fill" style="width:${pct}%;background:${colors[i]}"></div></div>
            <span class="legend-pct">${pct.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Filters =====
chipRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  currentFilter = chip.dataset.filter;
  loadInvestments();
});

// ===== Refresh prices (bulk) =====
document.getElementById('refreshPricesBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshPricesBtn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader-2" style="font-size:15px"></i> Refreshing…`;
  try {
    const res = await fetch(`${API}/refresh-prices`, { method: 'POST' });
    if (!res.ok) throw new Error('Refresh failed');
    await loadInvestments();
    await loadSummary();
  } catch (err) {
    alert('Could not refresh prices. Check your API keys in .env and your internet connection.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
});

async function refreshOne(id) {
  try {
    const res = await fetch(`${API}/${id}/refresh`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Refresh failed');
    }
    loadInvestments();
    loadSummary();
  } catch (err) {
    alert(err.message || 'Could not refresh this price.');
  }
}

// ===== Add/edit modal =====
document.getElementById('addInvBtn').addEventListener('click', () => openAdd());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

typePicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-opt');
  if (!btn) return;
  document.querySelectorAll('.type-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedType = btn.dataset.value;
  applyFormMode();
});

invStatusSelect.addEventListener('change', () => {
  soldFields.style.display = invStatusSelect.value === 'sold' ? 'flex' : 'none';
});

function applyFormMode() {
  const mode = VALUATION_MODE_BY_TYPE[selectedType];
  marketFields.style.display = mode === 'MARKET' ? 'block' : 'none';
  calculatedFields.style.display = mode === 'CALCULATED' ? 'block' : 'none';
  manualFields.style.display = mode === 'MANUAL' ? 'block' : 'none';

  if (mode === 'MARKET') {
    document.getElementById('investedAmount').removeAttribute('required');
    document.getElementById('currentValue').removeAttribute('required');
    const isGold = selectedType === 'gold';
    goldUnitRow.style.display = isGold ? 'block' : 'none';
    assetSearchRow.style.display = isGold ? 'none' : 'block';
    assetSearchTypeLabel.textContent = selectedType === 'stocks' ? 'stocks' : selectedType === 'crypto' ? 'crypto' : '';
    if (isGold && !selectedAsset) {
      selectedAsset = { symbol: 'XAU', name: 'Gold', currency: 'USD', provider: 'goldapi' };
    }
  }
}

function clearAssetSearch() {
  selectedAsset = null;
  assetSearchInput.value = '';
  searchResultsEl.classList.remove('open');
  searchResultsEl.innerHTML = '';
  selectedAssetChip.style.display = 'none';
}

assetSearchInput.addEventListener('input', () => {
  const q = assetSearchInput.value.trim();
  clearTimeout(searchDebounce);
  if (q.length < 2) { searchResultsEl.classList.remove('open'); return; }

  searchDebounce = setTimeout(async () => {
    try {
      const endpoint = selectedType === 'stocks' ? 'stocks' : 'crypto';
      const res = await fetch(`${MARKET_API}/${endpoint}/search?q=${encodeURIComponent(q)}`);
      const results = res.ok ? await res.json() : [];
      renderSearchResults(results);
    } catch {
      renderSearchResults([]);
    }
  }, 350);
});

function renderSearchResults(results) {
  if (results.length === 0) {
    searchResultsEl.innerHTML = `<div class="search-result-empty">No matches — try a different search</div>`;
    searchResultsEl.classList.add('open');
    return;
  }
  searchResultsEl.innerHTML = results.map((r, i) => `
    <div class="search-result-item" data-index="${i}">
      <span class="search-result-name">${escapeHtml(r.name)}</span>
      <span class="search-result-symbol">${escapeHtml(r.symbol)}</span>
    </div>
  `).join('');
  searchResultsEl.classList.add('open');

  searchResultsEl.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const r = results[i];
      selectedAsset = {
        symbol: selectedType === 'crypto' ? r.id : r.symbol,
        name: r.name,
        currency: r.currency || 'USD',
        provider: selectedType === 'stocks' ? 'twelvedata' : 'coingecko',
      };
      assetSearchInput.value = `${r.name} (${r.symbol})`;
      selectedAssetChip.style.display = 'inline-flex';
      selectedAssetChip.innerHTML = `<i class="ti ti-check"></i> ${escapeHtml(r.name)} — ${escapeHtml(r.symbol)} <button type="button" onclick="clearAssetSearch()"><i class="ti ti-x"></i></button>`;
      searchResultsEl.classList.remove('open');
    });
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-combo')) searchResultsEl.classList.remove('open');
});

function openAdd() {
  invForm.reset();
  document.getElementById('invId').value = '';
  document.getElementById('modalTitle').textContent = 'Add an investment';
  selectedType = 'stocks';
  selectedAsset = null;
  clearAssetSearch();
  document.querySelectorAll('.type-opt').forEach(b => b.classList.toggle('active', b.dataset.value === 'stocks'));
  soldFields.style.display = 'none';
  applyFormMode();
  modalOverlay.classList.add('open');
}

function openEdit(id) {
  const inv = currentInvestments.find(i => i.id === id);
  if (!inv) return;

  document.getElementById('invId').value = inv.id;
  document.getElementById('modalTitle').textContent = 'Edit investment';
  document.getElementById('invName').value = inv.name;
  document.getElementById('invDescription').value = inv.description || '';
  document.getElementById('purchaseDate').value = inv.purchase_date ? inv.purchase_date.slice(0, 10) : '';
  document.getElementById('invStatus').value = inv.status;
  document.getElementById('soldValue').value = inv.sold_value || '';
  document.getElementById('soldDate').value = inv.sold_date ? inv.sold_date.slice(0, 10) : '';
  document.getElementById('invNotes').value = inv.notes || '';

  selectedType = inv.type;
  document.querySelectorAll('.type-opt').forEach(b => b.classList.toggle('active', b.dataset.value === inv.type));
  soldFields.style.display = inv.status === 'sold' ? 'flex' : 'none';

  const mode = VALUATION_MODE_BY_TYPE[inv.type];
  if (mode === 'MARKET') {
    selectedAsset = { symbol: inv.symbol, name: inv.name, currency: inv.purchase_currency || 'USD', provider: inv.provider };
    document.getElementById('marketQuantity').value = inv.quantity || '';
    document.getElementById('marketPurchasePrice').value = inv.purchase_price || '';
    if (inv.type === 'gold') {
      document.getElementById('goldUnit').value = inv.unit || 'gram';
    } else {
      assetSearchInput.value = `${inv.name} (${inv.symbol || ''})`;
      selectedAssetChip.style.display = 'inline-flex';
      selectedAssetChip.innerHTML = `<i class="ti ti-check"></i> ${escapeHtml(inv.name)} — ${escapeHtml(inv.symbol || '')} <button type="button" onclick="clearAssetSearch()"><i class="ti ti-x"></i></button>`;
    }
  } else if (mode === 'CALCULATED') {
    document.getElementById('principalAmount').value = inv.invested_amount || '';
    document.getElementById('interestRate').value = inv.interest_rate || '';
    document.getElementById('interestType').value = inv.interest_type || 'simple';
    document.getElementById('maturityDate').value = inv.maturity_date ? inv.maturity_date.slice(0, 10) : '';
  } else {
    document.getElementById('investedAmount').value = inv.invested_amount;
    document.getElementById('currentValue').value = inv.current_value;
  }

  applyFormMode();
  modalOverlay.classList.add('open');
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

invForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('invId').value;
  const mode = VALUATION_MODE_BY_TYPE[selectedType];

  const payload = {
    type: selectedType,
    name: document.getElementById('invName').value,
    description: document.getElementById('invDescription').value,
    purchase_date: document.getElementById('purchaseDate').value || null,
    status: document.getElementById('invStatus').value,
    sold_value: document.getElementById('soldValue').value ? parseFloat(document.getElementById('soldValue').value) : null,
    sold_date: document.getElementById('soldDate').value || null,
    notes: document.getElementById('invNotes').value,
  };

  if (mode === 'MARKET') {
    if (!selectedAsset) {
      alert(selectedType === 'gold' ? 'Something went wrong — try re-selecting the type.' : 'Please search and select an asset first.');
      return;
    }
    payload.symbol = selectedAsset.symbol;
    payload.provider = selectedAsset.provider;
    payload.name = selectedType === 'gold' ? payload.name : selectedAsset.name;
    payload.quantity = parseFloat(document.getElementById('marketQuantity').value) || 0;
    payload.purchase_price = parseFloat(document.getElementById('marketPurchasePrice').value) || 0;
    payload.purchase_currency = selectedType === 'gold' ? 'USD' : selectedAsset.currency;
    if (selectedType === 'gold') payload.unit = document.getElementById('goldUnit').value;
  } else if (mode === 'CALCULATED') {
    payload.invested_amount = parseFloat(document.getElementById('principalAmount').value) || 0;
    payload.interest_rate = parseFloat(document.getElementById('interestRate').value) || 0;
    payload.interest_type = document.getElementById('interestType').value;
    payload.maturity_date = document.getElementById('maturityDate').value || null;
  } else {
    payload.invested_amount = parseFloat(document.getElementById('investedAmount').value) || 0;
    payload.current_value = parseFloat(document.getElementById('currentValue').value);
  }

  try {
    const res = await fetch(id ? `${API}/${id}` : API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Save failed');
    }
    const saved = await res.json();
    closeModal();
    await loadInvestments();
    await loadSummary();
    // For a brand-new MARKET holding, fetch its live price right away so it
    // doesn't sit at "invested amount" until the next manual refresh.
    if (mode === 'MARKET' && saved && saved.id) {
      refreshOne(saved.id);
    }
  } catch (err) {
    alert(err.message || 'Could not save the investment. Check your database connection.');
  }
});

async function deleteInvestment(id) {
  if (!confirm('Delete this investment? This cannot be undone.')) return;
  await fetch(`${API}/${id}`, { method: 'DELETE' });
  loadInvestments();
  loadSummary();
}

// ===== Quick value-update modal (MANUAL types only) =====
function openValueUpdate(id, name, currentValue) {
  document.getElementById('valueInvId').value = id;
  document.getElementById('valueInvLabel').textContent = `New current value for ${name} (Rs)`;
  document.getElementById('valueInput').value = currentValue;
  valueModalOverlay.classList.add('open');
  setTimeout(() => document.getElementById('valueInput').focus(), 50);
}

document.getElementById('valueModalClose').addEventListener('click', closeValueModal);
document.getElementById('valueCancelBtn').addEventListener('click', closeValueModal);
valueModalOverlay.addEventListener('click', (e) => { if (e.target === valueModalOverlay) closeValueModal(); });

function closeValueModal() {
  valueModalOverlay.classList.remove('open');
}

valueForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('valueInvId').value;
  const current_value = parseFloat(document.getElementById('valueInput').value);

  try {
    const res = await fetch(`${API}/${id}/value`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_value }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Update failed');
    }
    closeValueModal();
    loadInvestments();
    loadSummary();
  } catch (err) {
    alert(err.message || 'Could not update the value.');
  }
});

// ===== Helpers =====
function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatQty(q) {
  const n = Number(q);
  return n % 1 === 0 ? n.toLocaleString() : n.toString();
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function hexToDim(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Premium gating =====
// Real enforcement is server-side (middleware/requirePremium.js on
// /api/investments and /api/market) — this just avoids showing the page
// (and firing API calls that would 403 anyway) for free-plan users.
function isPremiumUser() {
  const user = typeof getStoredUser === 'function' ? getStoredUser() : null;
  return Boolean(user && (user.role === 'super_admin' || user.plan === 'premium'));
}

function showPaywall() {
  document.getElementById('investmentsContent').style.display = 'none';
  document.getElementById('investmentsPaywall').style.display = 'block';
  document.getElementById('addInvBtn').style.display = 'none';
  document.getElementById('refreshPricesBtn').style.display = 'none';
}

function initPage() {
  const contentEl = document.getElementById('investmentsContent');
  const paywallEl = document.getElementById('investmentsPaywall');
  const addBtn = document.getElementById('addInvBtn');
  const refreshBtn = document.getElementById('refreshPricesBtn');

  if (!isPremiumUser()) {
    showPaywall();
    return;
  }

  applyFormMode();
  loadInvestments();
  loadSummary();
}

initPage();
