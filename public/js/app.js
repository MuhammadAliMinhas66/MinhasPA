// ===== Theme toggle (light / dark) — persisted, shared across every page =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeToggleIcon');
  const label = document.getElementById('themeToggleLabel');
  if (icon) icon.className = `ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`;
  if (label) label.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
}

// Reads a design-token CSS variable off <html> at call time, so charts and
// canvas-based UI always match whichever theme (light/dark) is active.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// The <head> of every page already sets data-theme before first paint
// (see the inline snippet there) to avoid a flash of the wrong theme —
// this just syncs the toggle button's icon/label to match on load.
applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem('mpa-theme', next);
  applyTheme(next);
  // Let any page-level charts know they should redraw with the new palette.
  document.dispatchEvent(new CustomEvent('mpa-theme-change', { detail: { theme: next } }));
});

// ===== Mobile sidebar (off-canvas drawer under 640px) =====
// Injected here instead of hand-edited into every page's topbar, same
// reasoning as addAdminNavLink/addInvestmentsNavBadge below — one place
// to maintain instead of ten HTML files.
function setupMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  if (!sidebar || !topbar) return;

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'mobile-menu-btn';
  menuBtn.setAttribute('aria-label', 'Open menu');
  menuBtn.innerHTML = '<i class="ti ti-menu-2"></i>';
  topbar.insertBefore(menuBtn, topbar.firstChild);

  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  document.body.appendChild(backdrop);

  function openSidebar() {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('show');
    menuBtn.innerHTML = '<i class="ti ti-x"></i>';
  }
  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('show');
    menuBtn.innerHTML = '<i class="ti ti-menu-2"></i>';
  }

  menuBtn.addEventListener('click', () => {
    sidebar.classList.contains('mobile-open') ? closeSidebar() : openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

  // A real <a> nav link navigates to a new page anyway, but closing first
  // avoids a visible drawer-still-open frame during that navigation.
  sidebar.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => closeSidebar());
  });

  // The bottom tab bar's "More" button (see setupBottomTabBar) opens the
  // same drawer — wired here so both entry points share one open/close.
  document.getElementById('bottomTabMore')?.addEventListener('click', () => {
    sidebar.classList.contains('mobile-open') ? closeSidebar() : openSidebar();
  });

  // Resizing past the breakpoint (rotating a tablet, restoring a browser
  // window) should never leave the drawer stuck open with no backdrop.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 640) closeSidebar();
  });
}

// ===== Bottom tab bar (phones, ≤640px) =====
// Native-app-style fixed bottom navigation — the single most recognizable
// pattern in modern fintech mobile UI. Built from the same nav-items
// already in the sidebar so it stays in sync with them automatically,
// rather than being hand-duplicated into every page.
function setupBottomTabBar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // The four most-used "daily money" pages get their own tab; everything
  // else (Savings, Investments, Committees, Salary, Admin, Settings) lives
  // behind "More", which just opens the full drawer.
  const TAB_PAGES = ['dashboard', 'expenses', 'bills', 'loans'];
  const currentPage = document.querySelector('.nav-item.active')?.dataset.page;

  const bar = document.createElement('nav');
  bar.className = 'bottom-tab-bar';
  bar.setAttribute('aria-label', 'Primary');

  TAB_PAGES.forEach(page => {
    const sourceItem = sidebar.querySelector(`.nav-item[data-page="${page}"]`);
    if (!sourceItem) return;
    const icon = sourceItem.querySelector('i.ti')?.className || 'ti ti-circle';
    const label = sourceItem.querySelector('span')?.textContent || page;
    const href = sourceItem.tagName === 'A' ? sourceItem.getAttribute('href') : '#';
    const tab = document.createElement('a');
    tab.href = href;
    tab.className = 'bottom-tab' + (page === currentPage ? ' active' : '');
    tab.innerHTML = `<i class="${icon}"></i><span>${label.replace('Daily expenses', 'Expenses')}</span>`;
    bar.appendChild(tab);
  });

  const more = document.createElement('button');
  more.type = 'button';
  more.id = 'bottomTabMore';
  more.className = 'bottom-tab' + (TAB_PAGES.includes(currentPage) ? '' : ' active');
  more.innerHTML = '<i class="ti ti-dots"></i><span>More</span>';
  bar.appendChild(more);

  document.body.appendChild(bar);
}

// Build the tab bar first, then wire up the drawer — its "More" button
// (#bottomTabMore) needs to already exist in the DOM for setupMobileSidebar
// to find and bind it.
setupBottomTabBar();
setupMobileSidebar();

// Sidebar navigation
const navItems = document.querySelectorAll('.nav-item');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    // Real links (built pages, e.g. <a href="loans.html">) navigate normally.
    if (item.tagName === 'A') return;

    // Unbuilt pages are still plain <div>s — show a lightweight notice
    // instead of a jarring browser alert.
    e.preventDefault();
    showComingSoon(item.dataset.page);
  });
});

function showComingSoon(page){
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.background = 'var(--surface-2)';
  toast.style.border = '1px solid var(--border-strong)';
  toast.style.borderRadius = '10px';
  toast.style.padding = '12px 16px';
  toast.style.fontSize = '13px';
  toast.style.color = 'var(--text-primary)';
  toast.style.boxShadow = '0 12px 28px -8px rgba(0,0,0,0.5)';
  toast.style.zIndex = '50';
  toast.textContent = `"${page}" isn't built yet — coming in a future step.`;

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// Month filter (placeholder — will trigger a re-fetch once APIs exist)
document.getElementById('monthFilter')?.addEventListener('change', (e) => {
  console.log('Month filter changed to:', e.target.value);
});

// ===== Row action dropdowns (shared across Loans / Rent / Expenses tables) =====
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.actions-trigger');
  if (trigger) {
    const menu = trigger.nextElementSibling;
    const alreadyOpen = menu.classList.contains('open');
    closeActionMenus();
    if (!alreadyOpen) {
      positionActionMenu(trigger, menu);
      menu.classList.add('open');
    }
    e.stopPropagation();
    return;
  }
  closeActionMenus();
});

// Menus are position:fixed (viewport-relative), so a scrollable ancestor like
// .table-scroll can never clip or hide them — no more scrolling to reach the
// menu for the last row in a list. We compute exact coordinates from the
// trigger button and flip the menu above it when there isn't room below.
function positionActionMenu(trigger, menu) {
  const triggerRect = trigger.getBoundingClientRect();

  // Measure the menu's natural size without it flashing on-screen at the
  // wrong spot first.
  menu.style.visibility = 'hidden';
  menu.style.display = 'block';
  const menuRect = menu.getBoundingClientRect();
  menu.style.display = '';
  menu.style.visibility = '';

  const margin = 8;
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const openUpward = spaceBelow < menuRect.height + margin && triggerRect.top > menuRect.height;

  const top = openUpward
    ? triggerRect.top - menuRect.height - 6
    : triggerRect.bottom + 6;

  const left = Math.min(
    window.innerWidth - menuRect.width - margin,
    Math.max(margin, triggerRect.right - menuRect.width)
  );

  menu.style.top = `${Math.max(margin, top)}px`;
  menu.style.left = `${left}px`;
}

function closeActionMenus() {
  document.querySelectorAll('.actions-menu.open').forEach(m => m.classList.remove('open'));
}

// A scrolled trigger button would leave an open menu pointing at empty
// space, so close on any scroll (capture:true catches scroll events from
// .table-scroll containers too, since scroll doesn't bubble).
window.addEventListener('scroll', closeActionMenus, true);
window.addEventListener('resize', closeActionMenus);

// Reads the logged-in user straight from localStorage. Doesn't call
// auth.js's getStoredUser() on purpose — app.js loads BEFORE auth.js on
// every page, so that function doesn't exist yet when these IIFEs run.
function readStoredUserDirect() {
  try { return JSON.parse(localStorage.getItem('mpa-user') || 'null'); } catch (e) { return null; }
}

// ===== "Buy" badge on the Investments nav link for free-plan users =====
// Runs on every page (app.js is shared). super_admin / premium users never
// see this — it's purely a visual nudge for free users toward the paywall
// that already lives server-side in middleware/requirePremium.js.
function addInvestmentsNavBadge() {
  try {
    const user = readStoredUserDirect();
    if (!user) return;
    const isPremium = user.role === 'super_admin' || user.plan === 'premium';
    if (isPremium) return;

    const navLink = document.querySelector('.nav-item[data-page="investments"]');
    if (!navLink || navLink.querySelector('.nav-buy-badge')) return;

    const badge = document.createElement('span');
    badge.className = 'nav-buy-badge';
    badge.textContent = 'Buy';
    navLink.appendChild(badge);
  } catch (e) { /* non-critical UI nicety — never block page load over it */ }
}

// ===== Admin nav link — only super_admin sees it =====
// admin.html has the link hard-coded (with the "active" state already set);
// every other page injects it dynamically here so we don't have to hand-edit
// eight sidebars every time this changes.
function addAdminNavLink() {
  try {
    const user = readStoredUserDirect();
    if (!user || user.role !== 'super_admin') return;
    if (document.querySelector('.nav-item[data-page="admin"]')) return; // admin.html already has it

    const systemLabel = Array.from(document.querySelectorAll('.nav-label')).find(el => el.textContent.trim() === 'System');
    if (!systemLabel) return;

    const link = document.createElement('a');
    link.href = 'admin.html';
    link.className = 'nav-item';
    link.dataset.page = 'admin';
    link.innerHTML = '<i class="ti ti-shield-lock"></i><span>Admin</span>';
    systemLabel.insertAdjacentElement('afterend', link);
  } catch (e) { /* non-critical UI nicety */ }
}

// ===== Alerts bell — every page, badge count of what's actually urgent =====
// Reuses GET /api/dashboard/alerts (already powers the Dashboard's Action
// Center) so there's exactly one source of truth for "what's due" — this
// just surfaces it everywhere instead of only on the Dashboard page.
function addAlertsBell() {
  try {
    if (!readStoredUserDirect()) return;
    // Falls back to `.topbar` itself on the rare page that has no
    // `.topbar-right` container, so the bell never silently disappears —
    // this was actually happening on Admin until its topbar got one.
    const topbarRight = document.querySelector('.topbar-right') || document.querySelector('.topbar');
    if (!topbarRight || document.getElementById('alertsBellBtn')) return;

    const wrap = document.createElement('div');
    wrap.className = 'alerts-bell';
    wrap.innerHTML = `
      <button type="button" class="alerts-bell-btn" id="alertsBellBtn" title="Alerts" aria-label="Alerts">
        <i class="ti ti-bell"></i>
        <span class="alerts-bell-badge" id="alertsBellBadge" style="display:none">0</span>
      </button>
      <div class="alerts-bell-dropdown" id="alertsBellDropdown">
        <div class="alerts-bell-dropdown-header">Alerts</div>
        <div class="alerts-bell-dropdown-body" id="alertsBellBody">
          <div class="empty-state"><i class="ti ti-loader-2"></i><span>Loading…</span></div>
        </div>
      </div>
    `;
    topbarRight.insertBefore(wrap, topbarRight.firstChild);

    const btn = document.getElementById('alertsBellBtn');
    const dropdown = document.getElementById('alertsBellDropdown');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) dropdown.classList.remove('open');
    });

    // app.js runs BEFORE auth.js in every page's <script> order (auth.js is
    // what patches window.fetch to attach the Authorization header), so
    // calling fetch synchronously here would go out unauthenticated and
    // 401. Deferring to the next tick lets auth.js finish loading first —
    // it's a plain <script> tag, so it's guaranteed to run before any
    // timer queued during this same synchronous pass.
    setTimeout(refreshAlertsBell, 0);
    // Alerts age out day by day (an unpaid expense becomes "urgent" once it
    // hits 3 days old), so a periodic refresh keeps the badge honest even
    // on a tab left open for a while — not just at page load.
    setInterval(refreshAlertsBell, 5 * 60 * 1000);
  } catch (e) { /* non-critical UI nicety — never block page load over it */ }
}

async function refreshAlertsBell() {
  const badge = document.getElementById('alertsBellBadge');
  const body = document.getElementById('alertsBellBody');
  if (!badge || !body) return;

  try {
    const res = await fetch('/api/dashboard/alerts');
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();

    // Same urgency rule the Dashboard's Action Center uses: loans only
    // count here once they're due within 3 days (or overdue) — every
    // pending loan regardless of date is already covered on the Loans
    // page as a running ledger, not as an "alert".
    const items = [];
    (data.loans_due || []).forEach(l => {
      if (!l.due_date) return;
      const days = Math.ceil((new Date(l.due_date) - new Date()) / 86400000);
      if (days > 3) return;
      items.push({
        icon: 'ti-arrows-exchange',
        title: `${l.direction === 'taken' ? 'Pay' : 'Collect from'} ${l.person_name}`,
        sub: days < 0 ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
        amount: Number(l.amount),
        urgent: days <= 1,
      });
    });
    (data.unpaid_expenses || []).forEach(e => {
      items.push({
        icon: 'ti-receipt',
        // dashboard's own /api/dashboard/alerts doesn't return a friendly
        // category label (only the raw key, e.g. "mobile_bill") — Dashboard
        // itself resolves this against a categories cache it has loaded,
        // but this bell runs on every page and can't assume that cache
        // exists, so it title-cases the raw key the same way the fallback
        // path already does elsewhere in the app.
        title: e.paid_by === 'other' ? `Pay back ${e.payer_name || 'someone'}` : `Unpaid ${titleCaseKey(e.category)}`,
        sub: `Unpaid for ${e.age_days} day${e.age_days === 1 ? '' : 's'}`,
        amount: Number(e.amount),
        urgent: e.age_days >= 10,
      });
    });
    if (data.rent_due) {
      items.push({
        icon: 'ti-home-2',
        title: 'Rent unpaid',
        sub: data.rent_due.due_date ? `Due ${new Date(data.rent_due.due_date).toLocaleDateString()}` : 'No due date set',
        amount: Number(data.rent_due.amount),
        urgent: true,
      });
    }

    if (items.length === 0) {
      badge.style.display = 'none';
      body.innerHTML = `<div class="empty-state"><i class="ti ti-circle-check"></i><span>Nothing urgent — you're all caught up</span></div>`;
      return;
    }

    badge.style.display = 'flex';
    badge.textContent = items.length > 9 ? '9+' : String(items.length);
    body.innerHTML = items.map(it => `
      <div class="alerts-bell-item ${it.urgent ? 'urgent' : ''}">
        <span class="alerts-bell-item-icon"><i class="ti ${it.icon}"></i></span>
        <div class="alerts-bell-item-text">
          <div class="alerts-bell-item-title">${escapeHtmlGlobal(it.title)}</div>
          <div class="alerts-bell-item-sub">${escapeHtmlGlobal(it.sub)}</div>
        </div>
        <div class="alerts-bell-item-amt">Rs ${it.amount.toLocaleString()}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load alerts bell:', err);
    badge.style.display = 'none';
    body.innerHTML = `<div class="empty-state"><i class="ti ti-plug-connected-x"></i><span>Couldn't load alerts</span></div>`;
  }
}

// Local escape helper — app.js runs on every page and can't assume any
// page-specific script (like dashboard.js's escapeHtml) has loaded yet.
function escapeHtmlGlobal(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// "mobile_bill" -> "Mobile Bill" — same transform dashboard.js's own
// categoryLabelFallback uses, duplicated here since this file can't
// assume dashboard.js (or its categories cache) has loaded on this page.
function titleCaseKey(key) {
  if (!key) return 'expense';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Both run once, right here, at the bottom of app.js — by this point in the
// page every element above (including the sidebar) has already been parsed.
addInvestmentsNavBadge();
addAdminNavLink();
addAlertsBell();

// ===== Animated "big number" updates =====
// Every page renders its headline numbers (stat cards, hero totals,
// history amounts...) asynchronously after its own fetch resolves. Rather
// than wiring a count-up into every individual page script, watch these
// elements generically: whenever their text changes, give them a quick
// pop + brightness flash via the shared .value-pop class in style.css.
(function initValuePopWatcher() {
  const SELECTOR = [
    '.stat-value', '.committee-hero-value', '.committee-hero-stat-value',
    '.remaining-value', '.net-hero-value', '.net-hero-item-value',
    '.history-amt-pos', '.history-amt-neg', '.savings-hero-value',
    '.glance-total span', '.due-item-amt'
  ].join(', ');

  const pop = (el) => {
    el.classList.remove('value-pop');
    // Force reflow so re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add('value-pop');
  };

  const watched = new WeakSet();
  const textObserver = new MutationObserver((mutations) => {
    const seen = new Set();
    for (const m of mutations) {
      const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest(SELECTOR);
      if (el && !seen.has(el)) { seen.add(el); pop(el); }
    }
  });

  const watch = (el) => {
    if (watched.has(el)) return;
    watched.add(el);
    textObserver.observe(el, { childList: true, characterData: true, subtree: true });
  };

  document.querySelectorAll(SELECTOR).forEach(watch);

  // New matching elements can appear later (grids rendered client-side,
  // modals, etc) — keep scanning for them without re-observing the same node.
  const bodyObserver = new MutationObserver(() => {
    document.querySelectorAll(SELECTOR).forEach(watch);
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
})();
