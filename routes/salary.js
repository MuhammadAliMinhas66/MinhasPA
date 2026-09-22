const express = require('express');
const router = express.Router();
const { SalaryPlan, SalaryItem, Loan, Rent, BillPayment, Bill, Committee, CommitteePayment } = require('../models');

// Source-tagged rows the auto-sync feature manages. One row per source per
// plan — syncing again updates the existing row instead of duplicating it,
// and removes it automatically once nothing is due.
const SYNC_META = {
  loans_critical: { label: 'Loans Critical', icon: 'ti-alert-triangle', color: '#e5484d' },
  rent:           { label: 'Rent',           icon: 'ti-home-2',         color: '#d4a24e' },
  bills:          { label: 'Bills',          icon: 'ti-bolt',           color: '#facc15' },
  committees:     { label: 'Committees',     icon: 'ti-users-group',    color: '#c084fc' },
};

async function upsertSyncedItem(userId, plan, source, amount, detail) {
  const meta = SYNC_META[source];
  const current = await SalaryItem.findOne({ plan: plan._id, user: userId, source });

  // Nothing due this month — remove any previously-synced row so the
  // allocation list doesn't show a stale critical-loan or bill amount.
  if (!amount || amount <= 0) {
    if (current) await SalaryItem.deleteOne({ _id: current._id, user: userId });
    return null;
  }

  if (current) {
    current.amount = amount;
    current.detail = detail || null;
    await current.save();
    return current;
  }

  const count = await SalaryItem.countDocuments({ plan: plan._id, user: userId });

  return SalaryItem.create({
    user: userId, plan: plan._id, label: meta.label, amount, icon: meta.icon, color: meta.color,
    sort_order: count, source, detail: detail || null,
  });
}

// Pulls together how much is due for each syncable source, for a given
// month, without writing anything — used both to preview and to sync.
async function computeSyncAmounts(userId, month) {
  const out = {
    loans_critical: { amount: 0, count: 0, detail: '' },
    rent: { amount: 0, status: 'none', due_date: null, detail: '' },
    bills: { amount: 0, count: 0, detail: '' },
    committees: { amount: 0, count: 0, detail: '' },
  };

  // Each block is independent and self-guarding — same shape as the old
  // "table might not exist yet" guard, kept here as a try/catch so one
  // failing source (e.g. a provider hiccup) never breaks the others.

  try {
    const loans = await Loan.find({
      user: userId, status: 'pending', due_date: { $ne: null, $lte: new Date(Date.now() + 7 * 86400000) },
    });
    const owed = loans.filter(r => r.direction === 'taken');
    out.loans_critical = {
      amount: owed.reduce((s, r) => s + Number(r.amount), 0),
      count: owed.length,
      detail: owed.map(r => `${r.person_name}: Rs ${Number(r.amount).toLocaleString()}`).join(', '),
    };
  } catch (err) { console.error('sync loans_critical failed:', err.message); }

  try {
    const rentRow = await Rent.findOne({ user: userId, month_year: month });
    out.rent = {
      amount: rentRow && rentRow.status === 'unpaid' ? Number(rentRow.amount) : 0,
      status: rentRow ? rentRow.status : 'none',
      due_date: rentRow ? rentRow.due_date : null,
      detail: rentRow && rentRow.status === 'unpaid'
        ? `Due ${new Date(rentRow.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
        : '',
    };
  } catch (err) { console.error('sync rent failed:', err.message); }

  try {
    const pending = await BillPayment.find({ user: userId, month_year: month, status: 'pending' }).populate({
      path: 'bill', match: { is_active: true }, select: 'biller_name is_active',
    });
    const bills = pending.filter(p => p.bill);
    out.bills = {
      amount: bills.reduce((s, r) => s + (r.amount !== null ? Number(r.amount) : 0) + Number(r.extra_charges), 0),
      count: bills.length,
      detail: bills.filter(r => r.amount !== null)
        .map(r => `${r.bill.biller_name}: Rs ${(Number(r.amount) + Number(r.extra_charges)).toLocaleString()}`).join(', '),
    };
  } catch (err) { console.error('sync bills failed:', err.message); }

  try {
    const committees = await Committee.find({ user: userId, status: 'active' });
    const payments = await CommitteePayment.find({ user: userId, month_year: month });
    const paidIds = new Set(payments.filter(p => p.status === 'paid').map(p => p.committee.toString()));
    const dueCommittees = committees.filter(c => !paidIds.has(c._id.toString()));
    out.committees = {
      amount: dueCommittees.reduce((s, r) => s + Number(r.monthly_amount), 0),
      count: dueCommittees.length,
      detail: dueCommittees.map(r => `${r.name}: Rs ${Number(r.monthly_amount).toLocaleString()}`).join(', '),
    };
  } catch (err) { console.error('sync committees failed:', err.message); }

  return out;
}

async function getOrCreatePlan(userId, month) {
  const existing = await SalaryPlan.findOne({ user: userId, month_year: month });
  if (existing) return existing;
  return SalaryPlan.create({ user: userId, month_year: month, salary: 0 });
}

// GET /api/salary?month=YYYY-MM — the plan (salary figure) plus every
// allocation line item for that month, in one call.
router.get('/', async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month is required, e.g. ?month=2026-08' });

    const plan = await getOrCreatePlan(req.user.id, month);
    const items = await SalaryItem.find({ plan: plan._id, user: req.user.id }).sort({ sort_order: 1, _id: 1 });

    res.json({ plan, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load salary plan', detail: err.message });
  }
});

// PUT /api/salary — upsert the salary figure for a month
// body: { month, salary, calculate }  (calculate: true when saved via the
// explicit "Calculate & Save" button, stamps calculated_at so it shows up
// as finalized in the history panel)
router.put('/', async (req, res) => {
  try {
    const { month, salary, calculate } = req.body;
    if (!month || salary == null) return res.status(400).json({ error: 'month and salary are required' });

    const plan = await getOrCreatePlan(req.user.id, month);
    plan.salary = salary;
    plan.updated_at = new Date();
    if (calculate) plan.calculated_at = new Date();
    await plan.save();

    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save salary', detail: err.message });
  }
});

// GET /api/salary/sync-preview?month=YYYY-MM — how much is due for each
// syncable source this month, without writing anything. Powers the "Smart
// sync" cards on the Salary Calculator page.
router.get('/sync-preview', async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month is required' });
    const data = await computeSyncAmounts(req.user.id, month);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load sync preview', detail: err.message });
  }
});

// POST /api/salary/sync — pull one live source into this month's plan as a
// single row (adds it if missing, updates the amount if it changed, and
// removes it automatically once nothing is due).
// body: { month, source: 'loans_critical' | 'rent' | 'bills' | 'committees' }
router.post('/sync', async (req, res) => {
  try {
    const { month, source } = req.body;
    if (!month || !SYNC_META[source]) {
      return res.status(400).json({ error: `month and a valid source (${Object.keys(SYNC_META).join(', ')}) are required` });
    }

    const plan = await getOrCreatePlan(req.user.id, month);
    const data = await computeSyncAmounts(req.user.id, month);
    const info = data[source];

    const item = await upsertSyncedItem(req.user.id, plan, source, info.amount, info.detail);
    res.json({ item, info });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sync', detail: err.message });
  }
});

// GET /api/salary/history — every month that has a plan, most recent
// first, with its allocated total and remaining — the "store all salaries"
// view under the calculator.
router.get('/history', async (req, res) => {
  try {
    const plans = await SalaryPlan.find({ user: req.user.id, salary: { $gt: 0 } }).sort({ month_year: -1 });
    const items = await SalaryItem.find({ user: req.user.id });
    const allocatedByPlan = {};
    items.forEach(i => {
      const key = i.plan.toString();
      allocatedByPlan[key] = (allocatedByPlan[key] || 0) + i.amount;
    });

    res.json(plans.map(p => {
      const allocated = allocatedByPlan[p._id.toString()] || 0;
      return {
        month_year: p.month_year,
        salary: p.salary,
        allocated,
        remaining: p.salary - allocated,
        calculated_at: p.calculated_at,
        updated_at: p.updated_at,
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load salary history', detail: err.message });
  }
});

// POST /api/salary/items — add an allocation line to a month's plan
// body: { month, label, amount, icon, color }
router.post('/items', async (req, res) => {
  try {
    const { month, label, amount, icon, color } = req.body;
    if (!month || !label || amount == null) return res.status(400).json({ error: 'month, label, and amount are required' });

    const plan = await getOrCreatePlan(req.user.id, month);
    const count = await SalaryItem.countDocuments({ plan: plan._id, user: req.user.id });

    const item = await SalaryItem.create({
      user: req.user.id, plan: plan._id, label, amount,
      icon: icon || 'ti-tag', color: color || '#d4a24e', sort_order: count,
    });

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add item', detail: err.message });
  }
});

// PUT /api/salary/items/:id — edit a line item
router.put('/items/:id', async (req, res) => {
  try {
    const { label, amount, icon, color } = req.body;

    const item = await SalaryItem.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { label, amount, icon: icon || 'ti-tag', color: color || '#d4a24e', source: null, detail: null },
      { new: true, runValidators: true }
    );

    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item', detail: err.message });
  }
});

// DELETE /api/salary/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await SalaryItem.deleteOne({ _id: req.params.id, user: req.user.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item', detail: err.message });
  }
});

module.exports = router;
