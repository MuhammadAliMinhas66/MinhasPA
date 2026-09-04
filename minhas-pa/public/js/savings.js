let chart;
let lastChartData = null;

const now = new Date();
const currentMonth = now.toISOString().slice(0, 7);
const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const previousMonth = prevDate.toISOString().slice(0, 7);

const CATEGORY_LABELS = {
  mobile: 'Mobile package', meals: 'Meals', grocery: 'Grocery',
  travel: 'Travel', family: 'Family', kameti: 'Kameti / committee', others: 'Others'
};

async function loadInsights() {
  try {
    const [settingsRes, loansRes, rentRes, sumThisRes, sumPrevRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/loans?status=pending'),
      fetch('/api/rent'),
      fetch(`/api/expenses/summary?month=${currentMonth}`),
      fetch(`/api/expenses/summary?month=${previousMonth}`),
    ]);

    if (![settingsRes, loansRes, rentRes, sumThisRes, sumPrevRes].every(r => r.ok)) {
      throw new Error('Request failed');
    }

    const settings = await settingsRes.json();
    const loans = await loansRes.json();
    const rentRows = await rentRes.json();
    const sumThis = await sumThisRes.json();
    const sumPrev = await sumPrevRes.json();

    const income = parseFloat(settings.monthly_income) || 0;
    document.getElementById('incomeInput').value = income || '';

    const rentThisMonth = rentRows.find(r => r.month_year === currentMonth);
    const loansDue = loans.filter(l => l.direction === 'taken' && l.due_date && l.due_date.slice(0, 7) === currentMonth);
    const expensesTotalThis = sumThis.reduce((s, c) => s + Number(c.total), 0);

    const obligations = (rentThisMonth ? Number(rentThisMonth.amount) : 0)
      + loansDue.reduce((s, l) => s + Number(l.amount), 0)
      + expensesTotalThis;

    const savings = income - obligations;
    const rate = income > 0 ? (savings / income) * 100 : 0;

    renderStats(income, obligations, savings, rate);
    renderChart(sumThis, sumPrev);
    renderSuggestions({ income, obligations, savings, rate, sumThis, sumPrev, loans, rentThisMonth });
    renderCritical(loans, rentThisMonth);

  } catch (err) {
    document.getElementById('suggestionsList').innerHTML =
      `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database. Check your .env and that SQL Server is running.</span></div>`;
  }
}

function renderStats(income, obligations, savings, rate) {
  document.getElementById('statIncome').textContent = `Rs ${income.toLocaleString()}`;
  document.getElementById('statObligations').textContent = `Rs ${obligations.toLocaleString()}`;

  const savEl = document.getElementById('statSavings');
  savEl.textContent = `Rs ${savings.toLocaleString()}`;
  savEl.className = 'stat-value ' + (savings >= 0 ? 'positive' : 'negative');

  const rateEl = document.getElementById('statRate');
  rateEl.textContent = `${rate.toFixed(1)}%`;
  rateEl.className = 'stat-value ' + (rate >= 20 ? 'positive' : rate >= 0 ? 'neutral' : 'negative');
}

function renderChart(sumThis, sumPrev) {
  lastChartData = { sumThis, sumPrev };
  const categories = Object.keys(CATEGORY_LABELS);
  const thisData = categories.map(c => {
    const found = sumThis.find(s => s.category === c);
    return found ? Number(found.total) : 0;
  });
  const prevData = categories.map(c => {
    const found = sumPrev.find(s => s.category === c);
    return found ? Number(found.total) : 0;
  });

  const ctx = document.getElementById('trendChart');
  if (chart) chart.destroy();

  try {
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories.map(c => CATEGORY_LABELS[c]),
        datasets: [
          { label: 'Last month', data: prevData, backgroundColor: cssVar('--border-strong'), borderRadius: 4 },
          { label: 'This month', data: thisData, backgroundColor: cssVar('--accent'), borderRadius: 4 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: cssVar('--text-secondary'), font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: cssVar('--text-secondary') }, grid: { color: cssVar('--border') } }
        },
        plugins: {
          legend: { labels: { color: cssVar('--text-secondary'), font: { family: 'Inter', size: 12 } } }
        }
      }
    });
  } catch (err) {
    console.error('Chart render failed:', err);
    ctx.parentElement.innerHTML = `<div class="empty-state"><i class="ti ti-chart-bar"></i><span>Chart couldn't render — figures above are still accurate</span></div>`;
  }
}

function renderSuggestions({ income, obligations, savings, rate, sumThis, sumPrev, loans, rentThisMonth }) {
  const suggestions = [];

  if (income === 0) {
    suggestions.push(tip("Set your monthly income above to unlock accurate savings tracking — right now obligations are shown without anything to compare against."));
  }

  // Category growth vs last month
  sumThis.forEach(c => {
    const prevRow = sumPrev.find(p => p.category === c.category);
    const prevTotal = prevRow ? Number(prevRow.total) : 0;
    const thisTotal = Number(c.total);
    if (prevTotal > 0 && thisTotal > prevTotal * 1.2) {
      const pct = Math.round(((thisTotal - prevTotal) / prevTotal) * 100);
      suggestions.push(warn(`<strong>${CATEGORY_LABELS[c.category]}</strong> is up ${pct}% vs last month (Rs ${thisTotal.toLocaleString()} vs Rs ${prevTotal.toLocaleString()}) — worth a look.`));
    }
  });

  // Top category this month
  if (sumThis.length > 0) {
    const top = [...sumThis].sort((a, b) => b.total - a.total)[0];
    suggestions.push(tip(`<strong>${CATEGORY_LABELS[top.category]}</strong> was your biggest expense this month at Rs ${Number(top.total).toLocaleString()}.`));
  }

  // Critical loans
  const critical = loans.filter(l => l.is_critical);
  if (critical.length > 0) {
    const total = critical.reduce((s, l) => s + Number(l.amount), 0);
    suggestions.push(warn(`You have <strong>${critical.length} loan${critical.length > 1 ? 's' : ''}</strong> due within 7 days totaling <strong>Rs ${total.toLocaleString()}</strong> — settle these first.`));
  }

  // Unpaid rent
  if (rentThisMonth && rentThisMonth.status === 'unpaid') {
    suggestions.push(warn(`This month's rent of <strong>Rs ${Number(rentThisMonth.amount).toLocaleString()}</strong> is still unpaid.`));
  }

  // Overall savings verdict
  if (income > 0) {
    if (savings < 0) {
      suggestions.push(warn(`Your obligations exceed your income by <strong>Rs ${Math.abs(savings).toLocaleString()}</strong> this month — spending is outpacing what's coming in.`));
    } else if (rate >= 20) {
      suggestions.push(good(`You're saving about <strong>${rate.toFixed(0)}%</strong> of your income this month — a healthy rate. Consider setting aside the Rs ${savings.toLocaleString()} you have left.`));
    } else {
      suggestions.push(tip(`You're saving <strong>${rate.toFixed(0)}%</strong> this month, below the commonly cited 20% guideline — see if the categories above have room to trim.`));
    }
  }

  const list = document.getElementById('suggestionsList');
  list.innerHTML = suggestions.length > 0
    ? suggestions.join('')
    : `<div class="empty-state"><i class="ti ti-mood-smile"></i><span>Nothing urgent — add some loans, rent, or expenses to get tailored suggestions</span></div>`;
}

function warn(text) { return suggestionRow('warn', iconWarn(), text); }
function tip(text) { return suggestionRow('tip', iconTip(), text); }
function good(text) { return suggestionRow('good', iconGood(), text); }

function suggestionRow(cls, iconSvg, text) {
  return `<div class="suggestion ${cls}"><div class="sugg-icon">${iconSvg}</div><div>${text}</div></div>`;
}

function iconWarn() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}
function iconTip() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M15.09 14c.36-.51.66-.99.91-1.5A5.5 5.5 0 1 0 6 9.5c0 1.5.5 2.5 1 3 .25.51.55.99.91 1.5"/></svg>`;
}
function iconGood() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
}

function renderCritical(loans, rentThisMonth) {
  const container = document.getElementById('criticalList');
  const items = [];

  loans.filter(l => l.is_critical).forEach(l => {
    items.push({ label: `${l.person_name} — ${l.description || 'loan'}`, due: l.due_date, amount: l.amount });
  });

  if (rentThisMonth && rentThisMonth.status === 'unpaid') {
    items.push({ label: 'Room rent', due: rentThisMonth.due_date, amount: rentThisMonth.amount });
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-check"></i><span>Nothing critical right now</span></div>`;
    return;
  }

  items.sort((a, b) => new Date(a.due) - new Date(b.due));

  container.innerHTML = items.map(i => `
    <div class="crit-item">
      <span>${i.label}</span>
      <span style="display:flex;align-items:center;gap:10px">
        <span style="color:var(--text-secondary);font-family:var(--font-mono)">Rs ${Number(i.amount).toLocaleString()}</span>
        <span class="crit-tag">Due ${formatDate(i.due)}</span>
      </span>
    </div>
  `).join('');
}

document.getElementById('saveIncomeBtn').addEventListener('click', async () => {
  const value = document.getElementById('incomeInput').value;
  if (!value) return;

  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'monthly_income', value }),
    });
    loadInsights();
  } catch (err) {
    alert('Could not save income. Check your database connection.');
  }
});

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

loadInsights();

// ===== My Savings & Committees — real, tracked data (separate from the
// "estimated" insights above, which is income minus obligations) =====
const SAV_API = '/api/savings';
const savingsAddForm = document.getElementById('savingsAddForm');
const thisMonthValue = new Date().toISOString().slice(0, 7);

document.getElementById('savingsMonth').value = thisMonthValue;

async function loadSavingsSummary() {
  try {
    const res = await fetch(`${SAV_API}/summary`);
    const s = await res.json();
    animateSavingsTotal(s.actual_savings_total);
  } catch (err) {
    console.error('Failed to load savings summary:', err);
  }
}

let lastSavingsTotal = 0;
function animateSavingsTotal(to) {
  const el = document.getElementById('statActualSavings');
  const from = lastSavingsTotal;
  const start = performance.now();
  const duration = 700;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `Rs ${Math.round(from + (to - from) * eased).toLocaleString()}`;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  lastSavingsTotal = to;
}

async function loadSavingsEntries() {
  const el = document.getElementById('savingsEntryList');
  try {
    const res = await fetch(`${SAV_API}/entries`);
    const entries = await res.json();

    renderSavingsMiniChart(entries);

    if (entries.length === 0) {
      el.innerHTML = `<div class="empty-state"><i class="ti ti-moneybag"></i><span>No savings logged yet — add this month's above</span></div>`;
      return;
    }

    el.innerHTML = entries.map((e, i) => `
      <div class="savings-entry-card" style="animation-delay:${i * 40}ms">
        <span class="savings-entry-icon"><i class="ti ti-moneybag"></i></span>
        <div class="savings-entry-body">
          <span class="savings-entry-month">${formatMonthYear(e.month_year)}</span>
          ${e.note ? `<span class="savings-entry-note">${escapeHtmlSav(e.note)}</span>` : ''}
        </div>
        <span class="savings-entry-amt">Rs ${Number(e.amount).toLocaleString()}</span>
        <button class="savings-entry-del" data-id="${e.id}" title="Remove"><i class="ti ti-trash"></i></button>
      </div>
    `).join('');

    el.querySelectorAll('.savings-entry-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`${SAV_API}/entries/${btn.dataset.id}`, { method: 'DELETE' });
        loadSavingsEntries();
        loadSavingsSummary();
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

// Small animated bar chart — last 6 logged months, most recent on the right.
function renderSavingsMiniChart(entries) {
  const el = document.getElementById('savingsMiniChart');
  const recent = [...entries].sort((a, b) => a.month_year.localeCompare(b.month_year)).slice(-6);

  if (recent.length === 0) {
    el.innerHTML = '';
    return;
  }

  const max = Math.max(...recent.map(e => Number(e.amount)), 1);
  el.innerHTML = recent.map(e => `
    <div class="mini-bar-col">
      <div class="mini-bar-track"><div class="mini-bar-fill" data-h="${(Number(e.amount) / max) * 100}" style="height:0%"></div></div>
      <span class="mini-bar-label">${formatMonthYear(e.month_year).slice(0, 3)}</span>
    </div>
  `).join('');

  requestAnimationFrame(() => {
    el.querySelectorAll('.mini-bar-fill').forEach(bar => { bar.style.height = `${bar.dataset.h}%`; });
  });
}

savingsAddForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const month_year = document.getElementById('savingsMonth').value;
  const amount = Number(document.getElementById('savingsAmount').value);
  const note = document.getElementById('savingsNote').value.trim();
  if (!month_year || !amount) return;

  await fetch(`${SAV_API}/entries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month_year, amount, note }),
  });
  document.getElementById('savingsAmount').value = '';
  document.getElementById('savingsNote').value = '';
  loadSavingsEntries();
  loadSavingsSummary();
});

function formatMonthYear(my) {
  const [y, m] = my.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[Number(m) - 1]} ${y}`;
}

function escapeHtmlSav(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

loadSavingsSummary();
loadSavingsEntries();

// Redraw the trend chart with correct axis/legend colours when theme flips.
document.addEventListener('mpa-theme-change', () => {
  if (lastChartData) renderChart(lastChartData.sumThis, lastChartData.sumPrev);
});
