const DASH = '/api/dashboard';
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let calYear, calMonthIdx; // calendar's own navigable month (independent of the header month filter)
let categoriesCache = [];

// ===== Month filter (drives summary, budgets, calendar) =====
const dashMonth = document.getElementById('dashMonth');

function monthValue(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}`; }

function populateMonthOptions() {
  const now = new Date();
  let html = '';
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = monthValue(d.getFullYear(), d.getMonth());
    html += `<option value="${value}">${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}</option>`;
  }
  dashMonth.innerHTML = html;
  dashMonth.value = monthValue(now.getFullYear(), now.getMonth());
}

dashMonth.addEventListener('change', () => {
  loadEverythingForMonth();
});

// ===== Load everything scoped to the selected month =====
async function loadEverythingForMonth() {
  const month = dashMonth.value;
  await Promise.all([
    loadSummaryAndHero(month),
    loadBudgets(month),
    loadGlance(month),
  ]);
  calYear = Number(month.split('-')[0]);
  calMonthIdx = Number(month.split('-')[1]) - 1;
  loadCalendar();
}

// ===== This month at a glance — reuses the Salary Calculator's Smart Sync
// preview endpoint so the dashboard shows the exact same Loans Critical /
// Rent / Bills / Committees numbers without duplicating any logic. =====
const GLANCE_CARDS = [
  { source: 'loans_critical', title: 'Loans Critical', icon: 'ti-alert-triangle', color: '#e5484d', sub: 'Due within 7 days' },
  { source: 'rent', title: 'Rent', icon: 'ti-home-2', color: '#d4a24e', sub: 'This month, if unpaid' },
  { source: 'bills', title: 'Bills', icon: 'ti-bolt', color: '#facc15', sub: 'Pending bills this month' },
  { source: 'committees', title: 'Committees', icon: 'ti-users-group', color: '#c084fc', sub: 'Kameti dues this month' },
];

async function loadGlance(month) {
  const grid = document.getElementById('glanceGrid');
  const totalEl = document.getElementById('glanceTotal');
  try {
    const res = await fetch(`/api/salary/sync-preview?month=${month}`);
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();

    const total = GLANCE_CARDS.reduce((s, c) => s + Number((data[c.source] || {}).amount || 0), 0);
    totalEl.innerHTML = total > 0
      ? `<i class="ti ti-alert-circle"></i> <span>Rs ${total.toLocaleString()}</span> due across these four this month`
      : `<i class="ti ti-circle-check"></i> Nothing critical due right now — you're clear`;
    totalEl.className = `glance-total ${total > 0 ? 'due' : 'clear'}`;

    grid.innerHTML = GLANCE_CARDS.map(card => {
      const info = data[card.source] || { amount: 0, detail: '' };
      const amount = Number(info.amount || 0);
      const due = amount > 0;
      const isCritical = card.source === 'loans_critical' && due;
      const sub = card.source === 'rent' && info.status === 'paid' ? 'Already paid this month' : card.sub;

      return `
        <div class="glance-card ${due ? 'due' : ''} ${isCritical ? 'critical' : ''}" style="--gc-color:${card.color}">
          <div class="glance-card-top">
            <span class="glance-card-icon"><i class="ti ${card.icon}"></i></span>
            <div>
              <div class="glance-card-title">${card.title}</div>
              <div class="glance-card-sub">${sub}</div>
            </div>
          </div>
          <div class="glance-card-amount">Rs ${amount.toLocaleString()}</div>
          <div class="glance-card-detail">${escapeHtml(info.detail || (due ? '' : 'Nothing due right now'))}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load glance:', err);
    totalEl.innerHTML = '';
    grid.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach Salary Calculator's Smart Sync</span></div>`;
  }
}

// ===== Summary + Net position hero =====
async function loadSummaryAndHero(month) {
  try {
    const [summaryRes, expensesRes, loansRes] = await Promise.all([
      fetch(`${DASH}/summary?month=${month}`),
      fetch(`/api/expenses`), // all-time, so unpaid tracking isn't stuck to one month
      fetch(`/api/loans`),
    ]);
    const summary = await summaryRes.json();
    const allExpenses = await expensesRes.json();
    const allLoans = await loansRes.json();

    document.getElementById('statYouOwe').textContent = `Rs ${summary.you_owe.toLocaleString()}`;
    document.getElementById('statOwedToYou').textContent = `Rs ${summary.owed_to_you.toLocaleString()}`;
    document.getElementById('statSpent').textContent = `Rs ${summary.spent_this_month.toLocaleString()}`;

    const rentEl = document.getElementById('statRent');
    const rentSubEl = document.getElementById('statRentSub');
    if (summary.rent) {
      rentEl.textContent = `Rs ${summary.rent.amount.toLocaleString()}`;
      rentSubEl.textContent = summary.rent.status === 'paid' ? 'Paid this month' : 'Still unpaid';
      rentEl.className = `stat-value ${summary.rent.status === 'paid' ? 'positive' : 'negative'}`;
    } else {
      rentEl.textContent = '—';
      rentSubEl.textContent = 'No rent entry this month';
      rentEl.className = 'stat-value neutral';
    }

    // Net position: everything owed to you, minus everything you owe —
    // loans plus expenses someone covered for you or you haven't paid yet.
    // Linked expenses are excluded here since that same debt is already
    // counted once via `you_owe` from dbo.loans — counting it again here
    // would double it.
    const unpaidDirect = allExpenses.filter(e => e.status === 'unpaid' && e.paid_by !== 'other')
      .reduce((s, e) => s + Number(e.amount), 0);
    const unpaidBack = allExpenses.filter(e => e.status === 'unpaid' && e.paid_by === 'other' && !e.linked_loan_id)
      .reduce((s, e) => s + Number(e.amount), 0);
    const net = summary.owed_to_you - summary.you_owe - unpaidDirect - unpaidBack;

    const heroEl = document.getElementById('netHero');
    heroEl.innerHTML = `
      <div class="net-hero-main">
        <div class="net-hero-label"><i class="ti ti-scale" style="margin-right:4px"></i>Your net position — across loans and unpaid expenses</div>
        <div class="net-hero-value" style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${net >= 0 ? '+' : '−'}Rs ${Math.abs(net).toLocaleString()}</div>
        <div class="net-hero-sub">${net >= 0 ? "You're net ahead — more is owed to you than you owe" : "You're net behind — you owe more than is owed to you"}</div>
      </div>
      <div class="net-hero-breakdown">
        <div class="net-hero-item">
          <span class="net-hero-item-label">Owed to you</span>
          <span class="net-hero-item-value" style="color:var(--success)">+Rs ${summary.owed_to_you.toLocaleString()}</span>
        </div>
        <div class="net-hero-item">
          <span class="net-hero-item-label">You owe (loans)</span>
          <span class="net-hero-item-value" style="color:var(--danger)">−Rs ${summary.you_owe.toLocaleString()}</span>
        </div>
        <div class="net-hero-item">
          <span class="net-hero-item-label">Unpaid expenses</span>
          <span class="net-hero-item-value" style="color:var(--danger)">−Rs ${(unpaidDirect + unpaidBack).toLocaleString()}</span>
        </div>
      </div>
    `;

    renderVerdict(summary, allLoans);
  } catch (err) {
    console.error('Summary/hero failed:', err);
    document.getElementById('netHero').innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

// ===== Monthly verdict — one synthesized sentence, not raw numbers =====
async function renderVerdict(summary, allLoans) {
  const el = document.getElementById('verdictText');
  try {
    const trendRes = await fetch(`${DASH}/trend?months=2`);
    const trend = await trendRes.json();
    const [prev, current] = trend;

    const pendingCount = allLoans.filter(l => l.status === 'pending').length;
    let spendLine = '';
    if (prev && prev.spent > 0) {
      const change = ((current.spent - prev.spent) / prev.spent) * 100;
      if (Math.abs(change) < 3) {
        spendLine = `your spending is about the same as last month`;
      } else if (change > 0) {
        spendLine = `you've spent <span class="up">${change.toFixed(0)}% more</span> than last month`;
      } else {
        spendLine = `you've spent <span class="down">${Math.abs(change).toFixed(0)}% less</span> than last month`;
      }
    } else {
      spendLine = `you've spent Rs ${current.spent.toLocaleString()} so far`;
    }

    const rentLine = summary.rent
      ? (summary.rent.status === 'paid' ? 'rent is settled' : `rent (Rs ${summary.rent.amount.toLocaleString()}) is still unpaid`)
      : 'no rent entry logged yet';

    const loanLine = pendingCount > 0
      ? `you have <b>${pendingCount}</b> open loan${pendingCount === 1 ? '' : 's'}`
      : 'no open loans';

    el.innerHTML = `This month, ${spendLine}, ${rentLine}, and ${loanLine}.`;
  } catch (err) {
    el.textContent = "Couldn't generate this month's summary — check your database connection.";
  }
}

// ===== Action center / alerts =====
async function loadAlerts() {
  const el = document.getElementById('alertsList');
  try {
    const [res, budgetsRes] = await Promise.all([
      fetch(`${DASH}/alerts`),
      fetch(`${DASH}/budgets?month=${dashMonth.value}`),
    ]);
    const data = await res.json();
    const budgets = await budgetsRes.json();
    const items = [];

    // Action Center only exists for things with real time pressure — the
    // People panel already covers "who you owe, in total" as a running
    // ledger, so this only shows the subset that's actually urgent (overdue
    // or within 3 days) instead of repeating every open loan a second time.
    let laterLoans = 0;
    data.loans_due.forEach(l => {
      if (!l.due_date) return; // no deadline — that's People's job, not this panel's
      const days = Math.ceil((new Date(l.due_date) - new Date()) / 86400000);
      if (days > 3) { laterLoans += 1; return; }
      items.push({
        severity: days <= 1 ? 'high' : 'mid',
        sortKey: days,
        icon: 'ti-arrows-exchange', kind: 'loan',
        title: `${l.direction === 'taken' ? 'Pay' : 'Collect from'} ${escapeHtml(l.person_name)}`,
        sub: days < 0 ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
        amount: Number(l.amount),
        action: () => markLoanDone(l.id),
      });
    });

    data.unpaid_expenses.forEach(e => {
      items.push({
        severity: e.age_days >= 10 ? 'high' : 'mid',
        sortKey: -e.age_days,
        icon: 'ti-receipt', kind: 'expense',
        title: e.paid_by === 'other' ? `Pay back ${escapeHtml(e.payer_name || 'someone')}` : `Pay ${escapeHtml(categoryLabelFallback(e.category))}`,
        sub: `Unpaid for ${e.age_days} day${e.age_days === 1 ? '' : 's'}`,
        amount: Number(e.amount),
        action: () => markExpensePaid(e.id),
      });
    });

    if (data.rent_due) {
      const r = data.rent_due;
      const days = Math.ceil((new Date(r.due_date) - new Date()) / 86400000);
      items.push({
        severity: days <= 3 ? 'high' : 'mid',
        sortKey: days - 5000, // rent always floats near the top
        icon: 'ti-home-2', kind: 'rent',
        title: `Pay rent — ${r.month_year}`,
        sub: days < 0 ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : `Due in ${days} day${days === 1 ? '' : 's'}`,
        amount: Number(r.amount),
        action: () => markRentPaid(r.id),
      });
    }

    // Budget overruns — this data lives nowhere else on the dashboard.
    // No single "mark done" action makes sense here, so it just links
    // down to the Budget goals panel instead of a checkmark.
    budgets.forEach(b => {
      if (!b.monthly_limit) return;
      const pct = (b.spent / b.monthly_limit) * 100;
      if (pct < 80) return;
      items.push({
        severity: pct >= 100 ? 'high' : 'mid',
        sortKey: -pct - 6000, // budget warnings float to the very top
        icon: 'ti-chart-donut-3', kind: 'budget',
        title: `${escapeHtml(categoryLabelFor(b.category))} is ${pct >= 100 ? 'over budget' : 'close to its limit'}`,
        sub: `Rs ${b.spent.toLocaleString()} of Rs ${b.monthly_limit.toLocaleString()} (${Math.round(pct)}%)`,
        amount: Number(b.spent),
        action: null,
      });
    });

    if (items.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-confetti"></i>
          <span>Nothing urgent right now</span>
          <span class="empty-state-hint">Loans due within 3 days, unpaid rent, expenses unpaid 3+ days, and budgets you're close to blowing show up here${laterLoans > 0 ? `. You still have <a href="loans.html">${laterLoans} loan${laterLoans === 1 ? '' : 's'} due later</a> — see full balances on the Loans page.` : ''}</span>
        </div>`;
      return;
    }

    items.sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1) || a.sortKey - b.sortKey);

    const SHOWN = 6;
    const visible = items.slice(0, SHOWN);
    const overflow = items.length - visible.length;

    el.innerHTML = visible.map((it, i) => `
      <div class="alert-item severity-${it.severity}">
        <div class="alert-icon"><i class="ti ${it.icon}"></i></div>
        <div class="alert-text">
          <div class="alert-title">${it.title}</div>
          <div class="alert-sub">${it.sub}</div>
        </div>
        <div class="alert-amt">Rs ${it.amount.toLocaleString()}</div>
        ${it.action ? `<button class="alert-action" data-idx="${i}" title="Mark done"><i class="ti ti-check"></i></button>` : `<a href="expenses.html" class="alert-action alert-action-link" title="View in Expenses"><i class="ti ti-arrow-up-right"></i></a>`}
      </div>
    `).join('')
      + (overflow > 0 ? `<a href="loans.html" class="alert-more">+${overflow} more urgent — view all in Loans</a>` : '')
      + (laterLoans > 0 ? `<div class="alert-footnote">+${laterLoans} more loan${laterLoans === 1 ? '' : 's'} due later — see full balances on the <a href="loans.html">Loans</a> page</div>` : '');

    el.querySelectorAll('.alert-action:not(.alert-action-link)').forEach((btn, i) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await visible[i].action();
        loadAlerts();
        loadEverythingForMonth();
        loadTrend();
      });
    });
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

function categoryLabelFallback(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function markLoanDone(id) {
  const res = await fetch(`/api/loans`);
  const all = await res.json();
  const loan = all.find(l => l.id === id);
  if (!loan) return;
  await fetch(`/api/loans/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...loan, status: 'done' }),
  });
}

async function markExpensePaid(id) {
  const res = await fetch(`/api/expenses`);
  const all = await res.json();
  const exp = all.find(e => e.id === id);
  if (!exp) return;
  await fetch(`/api/expenses/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...exp, status: 'paid' }),
  });
}

async function markRentPaid(id) {
  const res = await fetch(`/api/rent`);
  const all = await res.json();
  const rent = all.find(r => r.id === id);
  if (!rent) return;
  await fetch(`/api/rent/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...rent, status: 'paid', paid_date: new Date().toISOString().slice(0, 10) }),
  });
}

// ===== Cash-flow trend — SVG histogram with an animated trend line =====
// Loans aren't in this chart on purpose: mixing "money you spent" with
// "money you borrowed" on the same axis is what made the old 4-line chart
// hard to read. Loans have their own home in Action Center and People.
async function loadTrend() {
  const el = document.getElementById('trendBars');
  try {
    const res = await fetch(`${DASH}/trend?months=6`);
    const data = await res.json();

    const totals = data.map(d => Number(d.spent) + Number(d.rent));
    const max = Math.max(...totals, 1);
    const peakIdx = totals.indexOf(Math.max(...totals));
    const thisMonthKey = monthValue(new Date().getFullYear(), new Date().getMonth());

    // ---- Geometry ----
    const W = 640, H = 260;
    const padL = 54, padR = 16, padT = 18, padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const n = data.length;
    const colW = plotW / n;
    const barW = Math.min(colW * 0.46, 34);

    // "Nice" gridline step (round to a clean number of steps)
    const niceMax = Math.ceil(max / 4 / 500) * 500 * 4 || max;
    const steps = 4;
    const gridLines = Array.from({ length: steps + 1 }, (_, i) => {
      const value = (niceMax / steps) * i;
      const y = padT + plotH - (value / niceMax) * plotH;
      return { value, y };
    });

    const points = data.map((d, i) => {
      const x = padL + colW * i + colW / 2;
      const y = padT + plotH - (totals[i] / niceMax) * plotH;
      return { x, y };
    });
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const barsSvg = data.map((d, i) => {
      const [y, m] = d.month.split('-');
      const label = `${MONTH_NAMES_FULL[Number(m) - 1].slice(0, 3)} '${y.slice(2)}`;
      const x = padL + colW * i + (colW - barW) / 2;
      const baseline = padT + plotH;
      const rentH = (Number(d.rent) / niceMax) * plotH;
      const expH = (Number(d.spent) / niceMax) * plotH;
      const isCurrent = d.month === thisMonthKey;
      const isPeak = i === peakIdx && totals[i] > 0;

      return `
        <g class="hist-col">
          <rect class="hist-bar rent" data-y="${(baseline - rentH).toFixed(1)}" data-h="${rentH.toFixed(1)}"
                x="${x.toFixed(1)}" y="${baseline}" width="${barW}" height="0" rx="2"></rect>
          <rect class="hist-bar expenses" data-y="${(baseline - rentH - expH).toFixed(1)}" data-h="${expH.toFixed(1)}"
                x="${x.toFixed(1)}" y="${(baseline - rentH).toFixed(1)}" width="${barW}" height="0" rx="2"></rect>
          <text class="hist-x-label ${isCurrent ? 'is-current' : ''}" x="${(x + barW / 2).toFixed(1)}" y="${H - 10}">${label}${isPeak ? ' ★' : ''}</text>
          <title>${label}: Rent Rs ${Number(d.rent).toLocaleString()} · Expenses Rs ${Number(d.spent).toLocaleString()} · Total Rs ${totals[i].toLocaleString()}</title>
        </g>
      `;
    }).join('');

    const gridSvg = gridLines.map(g => `
      <line class="hist-grid" x1="${padL}" x2="${W - padR}" y1="${g.y.toFixed(1)}" y2="${g.y.toFixed(1)}"></line>
      <text class="hist-y-label" x="${padL - 8}" y="${(g.y + 3.5).toFixed(1)}" text-anchor="end">Rs ${g.value >= 1000 ? `${(g.value / 1000).toFixed(g.value % 1000 ? 1 : 0)}k` : g.value.toFixed(0)}</text>
    `).join('');

    const dotsSvg = points.map((p, i) => `
      <circle class="hist-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="0"></circle>
    `).join('');

    el.innerHTML = `
      <svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${gridSvg}
        ${barsSvg}
        <path class="hist-line" d="${linePath}"></path>
        ${dotsSvg}
      </svg>
      <div class="trend-legend">
        <span class="trend-legend-item"><span class="dot expenses"></span> Expenses</span>
        <span class="trend-legend-item"><span class="dot rent"></span> Rent</span>
        <span class="trend-legend-item"><span class="dot line"></span> Total trend</span>
      </div>
    `;

    // ---- Animate: bars grow up, then the trend line draws itself in ----
    requestAnimationFrame(() => {
      const svg = el.querySelector('.trend-svg');
      svg.querySelectorAll('.hist-bar').forEach((bar, i) => {
        setTimeout(() => {
          bar.setAttribute('y', bar.dataset.y);
          bar.setAttribute('height', bar.dataset.h);
        }, Math.floor(i / 2) * 80);
      });

      const line = svg.querySelector('.hist-line');
      const len = line.getTotalLength();
      line.style.strokeDasharray = `${len}`;
      line.style.strokeDashoffset = `${len}`;
      setTimeout(() => { line.style.strokeDashoffset = '0'; }, 500);

      svg.querySelectorAll('.hist-dot').forEach((dot, i) => {
        setTimeout(() => { dot.setAttribute('r', '4'); }, 500 + 900 * (i / Math.max(n - 1, 1)));
      });
    });
  } catch (err) {
    console.error('Trend chart failed:', err);
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

// ===== Bills due — every pending bill instance, soonest due date first =====
async function loadBillsDue() {
  const el = document.getElementById('billsDueList');
  if (!el) return;
  try {
    const res = await fetch('/api/bills/pending');
    if (res.status === 403) {
      el.innerHTML = `<div class="empty-state"><i class="ti ti-lock"></i><span>Bills is disabled for your account</span></div>`;
      return;
    }
    const bills = await res.json();

    if (bills.length === 0) {
      el.innerHTML = `<div class="empty-state"><i class="ti ti-circle-check"></i><span>No pending bills — you're all caught up</span></div>`;
      return;
    }

    el.innerHTML = bills.map(b => {
      const days = Math.ceil((new Date(b.due_date) - new Date(new Date().toDateString())) / 86400000);
      const sub = b.overdue
        ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
        : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`;
      return `
        <div class="bill-due-row ${b.overdue ? 'overdue' : ''}">
          <span class="bill-due-icon" style="--cat-color:${b.category_color}"><i class="ti ${b.category_icon}"></i></span>
          <div class="bill-due-text">
            <span class="bill-due-name">${escapeHtml(b.biller_name)}</span>
            <span class="bill-due-sub">${escapeHtml(b.category_label)} · ${sub}</span>
          </div>
          <span class="bill-due-amt">${b.amount !== null ? `Rs ${b.total.toLocaleString()}` : 'Amount not set'}</span>
          <a href="bills.html" class="bill-due-action" title="Manage in Bills"><i class="ti ti-arrow-up-right"></i></a>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

// ===== Recent activity =====
async function loadActivity() {
  const el = document.getElementById('activityList');
  try {
    const res = await fetch(`${DASH}/activity?limit=8`);
    const items = await res.json();

    if (items.length === 0) {
      el.innerHTML = `<div class="empty-state"><i class="ti ti-history"></i><span>Nothing logged yet</span></div>`;
      return;
    }

    el.innerHTML = items.map(it => {
      let icon = 'ti-receipt', title = '', sub = '';
      if (it.type === 'loan') {
        icon = 'ti-arrows-exchange';
        title = `${it.direction === 'taken' ? 'Took from' : 'Gave to'} ${escapeHtml(it.person_name)}`;
        sub = escapeHtml(it.description || '') || (it.status === 'done' ? 'Settled' : 'Pending');
      } else if (it.type === 'expense') {
        icon = 'ti-receipt-2';
        title = categoryLabelFor(it.category);
        sub = it.paid_by === 'other' ? `Paid by ${escapeHtml(it.payer_name || 'someone')}` : (it.status === 'unpaid' ? 'Unpaid' : 'Paid');
      } else {
        icon = 'ti-home-2';
        title = `Rent — ${escapeHtml(it.month_year)}`;
        sub = it.status === 'paid' ? 'Paid' : 'Unpaid';
      }
      const when = timeAgo(it.created_at);
      return `
        <div class="activity-row">
          <span class="activity-icon ${it.type}"><i class="ti ${icon}"></i></span>
          <div class="activity-text">
            <span class="activity-title">${title}</span>
            <span class="activity-sub">${sub}</span>
          </div>
          <span class="activity-amt">Rs ${Number(it.amount).toLocaleString()}</span>
          <span class="activity-time">${when}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

// Counts a number up from 0 to its target over ~700ms with an ease-out
// curve — small touch that makes the chart feel alive instead of static.
function animateCountUp(el, target, duration = 700) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const value = Math.round(target * eased);
    el.textContent = `Rs ${value.toLocaleString()}`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ===== Budget goals =====
async function loadCategoriesForBudget() {
  try {
    const res = await fetch('/api/categories');
    categoriesCache = await res.json();
    const sel = document.getElementById('budgetCategory');
    sel.innerHTML = categoriesCache.map(c => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
  } catch (err) { /* categories are optional here */ }
}

function categoryLabelFor(key) {
  const c = categoriesCache.find(x => x.key === key);
  return c ? c.label : categoryLabelFallback(key);
}

function categoryMetaFor(key) {
  const c = categoriesCache.find(x => x.key === key);
  return { icon: c ? c.icon : 'ti-tag', color: c ? c.color : '#d4a24e' };
}

async function loadBudgets(month) {
  const el = document.getElementById('budgetList');
  try {
    const res = await fetch(`${DASH}/budgets?month=${month}`);
    const budgets = await res.json();

    if (budgets.length === 0) {
      el.innerHTML = `<div class="empty-state"><i class="ti ti-target-arrow"></i><span>No budgets set — add one below</span></div>`;
      return;
    }

    el.innerHTML = budgets.map(b => {
      const pct = b.monthly_limit ? (b.spent / b.monthly_limit) * 100 : 0;
      const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
      const meta = categoryMetaFor(b.category);
      const statusLabel = pct >= 100 ? 'Over budget' : pct >= 80 ? 'Getting close' : 'On track';
      return `
        <div class="budget-card">
          <span class="budget-card-icon" style="--cat-color:${meta.color}"><i class="ti ${meta.icon}"></i></span>
          <div class="budget-card-body">
            <div class="budget-card-top">
              <span class="budget-card-cat">${escapeHtml(categoryLabelFor(b.category))}</span>
              <span class="budget-card-status ${cls}">${statusLabel}</span>
            </div>
            <div class="budget-track"><div class="budget-fill ${cls}" data-w="${Math.min(pct, 100)}" style="width:0%"></div></div>
            <div class="budget-card-nums"><b>Rs ${b.spent.toLocaleString()}</b> of Rs ${b.monthly_limit.toLocaleString()} <span class="budget-card-pct">· ${Math.round(pct)}%</span></div>
          </div>
          <button class="budget-card-del" data-cat="${b.category}" title="Remove budget"><i class="ti ti-trash"></i></button>
        </div>
      `;
    }).join('');

    requestAnimationFrame(() => {
      el.querySelectorAll('.budget-fill').forEach(bar => { bar.style.width = `${bar.dataset.w}%`; });
    });

    el.querySelectorAll('.budget-card-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`${DASH}/budgets/${btn.dataset.cat}`, { method: 'DELETE' });
        loadBudgets(dashMonth.value);
      });
    });
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

document.getElementById('budgetAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = document.getElementById('budgetCategory').value;
  const monthly_limit = Number(document.getElementById('budgetLimit').value);
  if (!category || !monthly_limit) return;
  await fetch(`${DASH}/budgets`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, monthly_limit }),
  });
  document.getElementById('budgetLimit').value = '';
  loadBudgets(dashMonth.value);
});

// ===== Financial calendar =====
const calGrid = document.getElementById('calGrid');
const calMonthLabel = document.getElementById('calMonthLabel');

document.getElementById('calPrev').addEventListener('click', () => {
  calMonthIdx -= 1;
  if (calMonthIdx < 0) { calMonthIdx = 11; calYear -= 1; }
  loadCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  calMonthIdx += 1;
  if (calMonthIdx > 11) { calMonthIdx = 0; calYear += 1; }
  loadCalendar();
});

async function loadCalendar() {
  const month = monthValue(calYear, calMonthIdx);
  calMonthLabel.textContent = `${MONTH_NAMES_FULL[calMonthIdx]} ${calYear}`;

  try {
    const res = await fetch(`${DASH}/calendar?month=${month}`);
    const events = await res.json();

    const byDay = {};
    events.forEach(ev => {
      const day = new Date(ev.date).getDate();
      (byDay[day] = byDay[day] || []).push(ev);
    });

    const firstDow = new Date(calYear, calMonthIdx, 1).getDay();
    const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
    const today = new Date();
    const isThisMonth = today.getFullYear() === calYear && today.getMonth() === calMonthIdx;

    let html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => `<div class="calendar-dow">${d}</div>`).join('');
    for (let i = 0; i < firstDow; i += 1) html += `<div class="calendar-day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const evs = byDay[day] || [];
      const dots = evs.map(ev => `<span class="calendar-dot ${ev.type}"></span>`).join('');
      const isToday = isThisMonth && today.getDate() === day;
      const title = evs.map(ev => `${ev.label}: Rs ${Number(ev.amount).toLocaleString()} (${ev.status})`).join(' · ');
      html += `<div class="calendar-day ${isToday ? 'today' : ''}" ${title ? `title="${escapeHtml(title)}"` : ''}>${day}<div class="calendar-dots">${dots}</div></div>`;
    }
    calGrid.innerHTML = html;

    // Forecast strip: nearest upcoming due item from today onward.
    const forecastEl = document.getElementById('calForecast');
    const upcoming = events
      .filter(ev => ev.status !== 'paid' && ev.status !== 'done' && new Date(ev.date) >= new Date(new Date().toDateString()))
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

    if (upcoming) {
      const days = Math.ceil((new Date(upcoming.date) - new Date(new Date().toDateString())) / 86400000);
      document.getElementById('calForecastText').innerHTML = `Next up: <b>${escapeHtml(upcoming.label)}</b> — Rs ${Number(upcoming.amount).toLocaleString()}, ${days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`}`;
      forecastEl.style.display = 'flex';
    } else {
      forecastEl.style.display = 'none';
    }
  } catch (err) {
    console.error('Calendar failed:', err);
    calGrid.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't reach the database</span></div>`;
  }
}

// ===== Global search =====
const dashSearchInput = document.getElementById('dashSearchInput');
const searchResults = document.getElementById('searchResults');
let searchDebounce;

dashSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = dashSearchInput.value.trim();
  if (q.length < 2) { searchResults.classList.remove('open'); return; }
  searchDebounce = setTimeout(() => runSearch(q), 250);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dash-search')) searchResults.classList.remove('open');
});

async function runSearch(q) {
  try {
    const res = await fetch(`${DASH}/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const groups = [];

    if (data.loans.length) {
      groups.push(`<div class="search-group-label">Loans</div>` + data.loans.map(l => `
        <div class="search-result-row" onclick="location.href='loans.html'">
          <span>${escapeHtml(l.person_name)} <span class="search-result-sub">${escapeHtml(l.description || '')}</span></span>
          <span class="search-result-amt">Rs ${Number(l.amount).toLocaleString()}</span>
        </div>`).join(''));
    }
    if (data.expenses.length) {
      groups.push(`<div class="search-group-label">Expenses</div>` + data.expenses.map(e => `
        <div class="search-result-row" onclick="location.href='expenses.html'">
          <span>${escapeHtml(categoryLabelFallback(e.category))} <span class="search-result-sub">${escapeHtml(e.note || '')}</span></span>
          <span class="search-result-amt">Rs ${Number(e.amount).toLocaleString()}</span>
        </div>`).join(''));
    }
    if (data.rent.length) {
      groups.push(`<div class="search-group-label">Rent</div>` + data.rent.map(r => `
        <div class="search-result-row" onclick="location.href='rent.html'">
          <span>${escapeHtml(r.month_year)} <span class="search-result-sub">${escapeHtml(r.notes || '')}</span></span>
          <span class="search-result-amt">Rs ${Number(r.amount).toLocaleString()}</span>
        </div>`).join(''));
    }

    searchResults.innerHTML = groups.length
      ? groups.join('')
      : `<div class="empty-state" style="padding:20px"><i class="ti ti-mood-empty"></i><span>No matches</span></div>`;
    searchResults.classList.add('open');
  } catch (err) {
    console.error('Search failed:', err);
  }
}

// ===== Quick add: parse free text, preview it, and submit on demand =====
const quickAddForm = document.getElementById('quickAddForm');
const quickAddInput = document.getElementById('quickAddInput');
const quickAddPreview = document.getElementById('quickAddPreview');

function slugifyCategory(label) {
  return String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'others';
}

function parseQuickAdd(text) {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const amountMatch = raw.match(/(\d+(\.\d+)?)/);
  if (!amountMatch) return { error: 'Add an amount — e.g. "500 grocery"' };
  const amount = parseFloat(amountMatch[1]);

  const takenWords = ['took', 'borrowed', ' owe', 'loan from'];
  const givenWords = ['gave', 'lent', 'loaned'];
  const isTaken = takenWords.some(w => lower.includes(w));
  const isGiven = givenWords.some(w => lower.includes(w));

  if (isTaken || isGiven) {
    const direction = isGiven ? 'given' : 'taken';
    const personMatch = raw.match(/\b(?:from|to)\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?)/i);
    if (!personMatch) return { error: 'Who\'s it with? e.g. "took 2000 from Ahmed"' };
    const person = personMatch[1].trim();
    return {
      type: 'loan',
      payload: {
        direction, person_name: person, amount, description: raw,
        date_taken: new Date().toISOString().slice(0, 10), status: 'pending',
      },
      tags: [direction === 'taken' ? 'You took' : 'You gave', `Rs ${amount.toLocaleString()}`, person],
    };
  }

  if (lower.includes('rent')) {
    return { error: 'Rent needs a due date — add it from the Rent page' };
  }

  let category = raw
    .replace(amountMatch[0], '')
    .replace(/\b(rs|rupees|for|on|spent|paid|expense|today|yesterday)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!category) category = 'Others';

  return {
    type: 'expense',
    payload: {
      category: slugifyCategory(category), amount, expense_date: new Date().toISOString().slice(0, 10),
      note: raw, paid_by: 'me', status: 'paid',
    },
    tags: ['Expense', `Rs ${amount.toLocaleString()}`, category],
  };
}

function renderQuickAddPreview() {
  const parsed = parseQuickAdd(quickAddInput.value);
  if (!parsed) { quickAddPreview.innerHTML = ''; quickAddPreview.classList.remove('error'); return; }
  if (parsed.error) {
    quickAddPreview.innerHTML = parsed.error;
    quickAddPreview.classList.add('error');
    return;
  }
  quickAddPreview.classList.remove('error');
  quickAddPreview.innerHTML = parsed.tags.map(t => `<span class="qa-tag">${escapeHtml(t)}</span>`).join('<i class="ti ti-arrow-right" style="font-size:11px"></i>');
}

quickAddInput.addEventListener('input', renderQuickAddPreview);

// Example chips fill the input so a new user can see exactly what "worked"
// before typing their own — the fastest way to learn the format.
document.querySelectorAll('.quickadd-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    quickAddInput.value = chip.dataset.text;
    quickAddInput.focus();
    renderQuickAddPreview();
  });
});

// Help tooltip — explains the three formats it understands.
const quickAddHelpBtn = document.getElementById('quickAddHelpBtn');
const quickAddTooltip = document.getElementById('quickAddTooltip');
quickAddHelpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  quickAddTooltip.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.quickadd-tooltip') && !e.target.closest('#quickAddHelpBtn')) {
    quickAddTooltip.classList.remove('open');
  }
});

quickAddForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const parsed = parseQuickAdd(quickAddInput.value);
  if (!parsed || parsed.error) {
    quickAddPreview.innerHTML = parsed ? parsed.error : 'Type something first';
    quickAddPreview.classList.add('error');
    return;
  }

  const submitBtn = quickAddForm.querySelector('.quickadd-submit');
  submitBtn.disabled = true;
  try {
    if (parsed.type === 'loan') {
      await fetch('/api/loans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.payload) });
    } else {
      // Auto-create the category if it's new, same as the Expenses page does.
      const existing = categoriesCache.find(c => c.key === parsed.payload.category);
      if (!existing) {
        await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: parsed.payload.category.replace(/_/g, ' ') }) });
        await loadCategoriesForBudget();
      }
      await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.payload) });
    }
    quickAddInput.value = '';
    quickAddPreview.innerHTML = '<span style="color:var(--success)">Added ✓</span>';
    setTimeout(() => { quickAddPreview.innerHTML = ''; }, 1800);
    loadEverythingForMonth();
    loadAlerts();
    loadTrend();
  } catch (err) {
    quickAddPreview.innerHTML = 'Could not save — check your database connection';
    quickAddPreview.classList.add('error');
  } finally {
    submitBtn.disabled = false;
  }
});

// ===== Export — download this month's data as a spreadsheet =====
// A genuine necessity that doesn't exist anywhere else: one file with
// every loan, expense, and rent entry for the selected month, ready to
// open in Excel or share with family for record-keeping.
document.getElementById('exportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportBtn');
  const month = dashMonth.value;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite"></i> Exporting…`;

  try {
    // NOTE: loans are fetched with ?month=<selected month>, filtered by
    // date_taken — without this the "ALL ENTRIES THIS MONTH" section below
    // silently dumped every loan ever recorded (any month, any year) into
    // a section labelled "this month", which is the bug that was reported.
    const [loansRes, expensesRes, rentRes, summaryRes, billsRes, budgetsRes, trendRes, glanceRes] = await Promise.all([
      fetch(`/api/loans?month=${month}`),
      fetch(`/api/expenses?month=${month}`),
      fetch('/api/rent'),
      fetch(`${DASH}/summary?month=${month}`),
      fetch(`/api/bills?month=${month}`),
      fetch(`${DASH}/budgets?month=${month}`),
      fetch(`${DASH}/trend?months=6`),
      fetch(`/api/salary/sync-preview?month=${month}`),
    ]);

    // Every response is checked with .ok before parsing — previously a
    // single failed call (e.g. session hiccup) threw deep inside .json()
    // and the whole export silently bailed out with a generic error.
    const safeJson = async (res, fallback) => {
      if (!res.ok) return fallback;
      try { return await res.json(); } catch (e) { return fallback; }
    };

    const loans = await safeJson(loansRes, []);
    const expenses = await safeJson(expensesRes, []);
    const rentAll = await safeJson(rentRes, []);
    const rent = rentAll.filter(r => r.month_year === month);
    const summary = await safeJson(summaryRes, { you_owe: 0, owed_to_you: 0, spent_this_month: 0, rent: null });
    const bills = await safeJson(billsRes, []);
    const budgets = await safeJson(budgetsRes, []);
    const trend = await safeJson(trendRes, []);
    const glance = await safeJson(glanceRes, null);

    // Every timestamp gets both date and time, in local time, so the file
    // says exactly when something was logged — not just which day.
    const fmtDateTime = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };
    const fmtDate = (iso) => iso ? iso.slice(0, 10) : '';

    const sections = [];
    const monthLabel = document.querySelector(`#dashMonth option[value="${month}"]`)?.textContent || month;

    // --- Section 1: Dashboard snapshot (everything the widgets show) ---
    sections.push(['MINHAS PA — DASHBOARD EXPORT'], [`Month: ${monthLabel}`], [`Generated: ${fmtDateTime(new Date().toISOString())}`], []);

    sections.push(['SUMMARY']);
    sections.push(['Metric', 'Value']);
    sections.push(['You owe (loans)', summary.you_owe]);
    sections.push(['Owed to you', summary.owed_to_you]);
    sections.push(['Spent this month', summary.spent_this_month]);
    sections.push(['Rent this month', summary.rent ? summary.rent.amount : '']);
    sections.push(['Rent status', summary.rent ? summary.rent.status : 'No entry']);
    sections.push([]);

    if (glance) {
      sections.push(['THIS MONTH AT A GLANCE — SMART SYNC (from Salary Calculator)']);
      sections.push(['Source', 'Amount due', 'Details']);
      sections.push(['Loans Critical (due within 7 days)', glance.loans_critical.amount, glance.loans_critical.detail || 'Nothing due']);
      sections.push(['Rent', glance.rent.amount, glance.rent.detail || (glance.rent.status === 'paid' ? 'Already paid' : 'Nothing due')]);
      sections.push(['Bills', glance.bills.amount, glance.bills.detail || 'Nothing due']);
      sections.push(['Committees', glance.committees.amount, glance.committees.detail || 'Nothing due']);
      const glanceTotal = glance.loans_critical.amount + (glance.rent.amount || 0) + glance.bills.amount + glance.committees.amount;
      sections.push(['Total due this month', glanceTotal, '']);
      sections.push([]);
    }

    sections.push(['BILLS']);
    sections.push(['Biller', 'Type', 'Amount', 'Extra charges', 'Due date', 'Status', 'Paid on', 'Paid through']);
    bills.forEach(b => sections.push([
      b.biller_name, b.category_label,
      b.current ? b.current.amount : '', b.current ? b.current.extra_charges : '',
      b.current ? fmtDate(b.current.due_date) : '', b.current ? b.current.status : '',
      b.current && b.current.paid_on ? fmtDate(b.current.paid_on) : '', b.current ? (b.current.paid_through || '') : '',
    ]));
    sections.push([]);

    sections.push(['BUDGET GOALS']);
    sections.push(['Category', 'Spent', 'Limit', '% used']);
    budgets.forEach(b => sections.push([categoryLabelFor(b.category), b.spent, b.monthly_limit, b.monthly_limit ? `${Math.round((b.spent / b.monthly_limit) * 100)}%` : '']));
    sections.push([]);

    sections.push(['CASH-FLOW TREND — LAST 6 MONTHS']);
    sections.push(['Month', 'Rent', 'Expenses', 'Loans taken', 'Loans given', 'Total (Rent+Expenses)']);
    trend.forEach(t => sections.push([t.month, t.rent, t.spent, t.taken, t.given, Number(t.rent) + Number(t.spent)]));
    sections.push([]);

    // --- Section 2: every underlying entry, with full date + time ---
    sections.push(['ALL ENTRIES THIS MONTH']);
    sections.push(['Type', 'Description', 'Person / Category', 'Amount', 'Event Date', 'Logged At (Date & Time)', 'Status']);

    loans.forEach(l => sections.push([
      'Loan', l.direction === 'taken' ? 'You took' : 'You gave', l.person_name,
      l.amount, fmtDate(l.date_taken), fmtDateTime(l.created_at), l.status,
    ]));
    expenses.forEach(e => sections.push([
      'Expense', e.note || '', categoryLabelFor(e.category),
      e.amount, fmtDate(e.expense_date), fmtDateTime(e.created_at), e.status,
    ]));
    rent.forEach(r => sections.push([
      'Rent', r.month_year, '', r.amount, fmtDate(r.due_date), fmtDateTime(r.created_at), r.status,
    ]));

    const csv = sections.map(row => row.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minhas-pa-dashboard-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed:', err);
    alert("Couldn't export — check your database connection.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="ti ti-download"></i> Export`;
  }
});

// ===== Shared helpers =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ===== Init =====
populateMonthOptions();
loadCategoriesForBudget().then(loadEverythingForMonth);
loadAlerts();
loadTrend();
loadBillsDue();
loadActivity();
