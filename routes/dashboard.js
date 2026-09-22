const express = require('express');
const router = express.Router();
const { Types } = require('mongoose');
const { Loan, Rent, Expense, Budget } = require('../models');
const { monthRange, toMonthKey } = require('../utils/dateRange');

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ===== GET /api/dashboard/summary?month=YYYY-MM =====
// The four headline numbers, computed fresh — not copy-pasted from any page.
router.get('/summary', async (req, res) => {
  try {
    const month = req.query.month || thisMonth();
    const userId = req.user.id;
    const { start, end } = monthRange(month);

    const [owedByMeAgg, owedToMeAgg, rentDoc, spentAgg] = await Promise.all([
      Loan.aggregate([
        { $match: { user: new Types.ObjectId(userId), direction: 'taken', status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Loan.aggregate([
        { $match: { user: new Types.ObjectId(userId), direction: 'given', status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Rent.findOne({ user: userId, month_year: month }).select('amount status'),
      Expense.aggregate([
        { $match: { user: new Types.ObjectId(userId), expense_date: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    res.json({
      month,
      you_owe: owedByMeAgg[0] ? owedByMeAgg[0].total : 0,
      owed_to_you: owedToMeAgg[0] ? owedToMeAgg[0].total : 0,
      rent: rentDoc ? { amount: rentDoc.amount, status: rentDoc.status } : null,
      spent_this_month: spentAgg[0] ? spentAgg[0].total : 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard summary', detail: err.message });
  }
});

// ===== GET /api/dashboard/alerts =====
// The only things worth interrupting you for: loans due soon, expenses
// that have sat unpaid a while, and rent that isn't settled yet.
router.get('/alerts', async (req, res) => {
  try {
    const userId = req.user.id;
    const now = Date.now();

    const [loanDocs, expenseDocs, rentDocs] = await Promise.all([
      Loan.find({ user: userId, status: 'pending' }),
      Expense.find({ user: userId, status: 'unpaid' }),
      Rent.find({ user: userId, status: 'unpaid' }).sort({ due_date: -1 }).limit(1),
    ]);

    const loans = loanDocs
      .map(d => d.toJSON())
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return b.amount - a.amount;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        const diff = new Date(a.due_date) - new Date(b.due_date);
        return diff !== 0 ? diff : b.amount - a.amount;
      });

    const expenses = expenseDocs
      .map(d => {
        const ageDays = Math.floor((now - new Date(d.expense_date).getTime()) / 86400000);
        return { ...d.toJSON(), age_days: ageDays };
      })
      .filter(e => e.age_days >= 3)
      .sort((a, b) => new Date(a.expense_date) - new Date(b.expense_date));

    res.json({
      loans_due: loans,
      unpaid_expenses: expenses,
      rent_due: rentDocs[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load alerts', detail: err.message });
  }
});

// ===== GET /api/dashboard/trend?months=6 =====
// Money in vs out per month, combining all three sources — nothing else
// in the app shows this combined view.
router.get('/trend', async (req, res) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
    const userId = req.user.id;
    const now = new Date();
    const sinceDate = new Date(now.getFullYear(), now.getMonth() - months, 1);

    const [loanDocs, rentDocs, expenseDocs] = await Promise.all([
      Loan.find({ user: userId, date_taken: { $gte: sinceDate } }).select('date_taken direction amount'),
      Rent.find({ user: userId, status: 'paid' }).select('month_year amount'),
      Expense.find({ user: userId, expense_date: { $gte: sinceDate } }).select('expense_date amount'),
    ]);

    const labels = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const byMonth = {};
    labels.forEach(m => { byMonth[m] = { month: m, taken: 0, given: 0, rent: 0, spent: 0 }; });

    loanDocs.forEach(l => {
      const m = toMonthKey(l.date_taken);
      if (!byMonth[m]) return;
      if (l.direction === 'taken') byMonth[m].taken += l.amount;
      else byMonth[m].given += l.amount;
    });
    rentDocs.forEach(r => { if (byMonth[r.month_year]) byMonth[r.month_year].rent += r.amount; });
    expenseDocs.forEach(e => {
      const m = toMonthKey(e.expense_date);
      if (byMonth[m]) byMonth[m].spent += e.amount;
    });

    res.json(labels.map(m => byMonth[m]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load trend', detail: err.message });
  }
});

// ===== GET /api/dashboard/calendar?month=YYYY-MM =====
// Every due date in one month — loan due dates + rent due date — for the
// calendar widget.
router.get('/calendar', async (req, res) => {
  try {
    const month = req.query.month || thisMonth();
    const userId = req.user.id;
    const { start, end } = monthRange(month);

    const [loanDocs, rentDoc] = await Promise.all([
      Loan.find({ user: userId, due_date: { $gte: start, $lt: end } }),
      Rent.findOne({ user: userId, month_year: month }),
    ]);

    const loanEvents = loanDocs.map(d => ({
      id: d.id, type: 'loan', label: d.person_name, amount: d.amount, date: d.due_date, status: d.status,
    }));
    const rentEvents = rentDoc
      ? [{ id: rentDoc.id, type: 'rent', label: 'Rent', amount: rentDoc.amount, date: rentDoc.due_date, status: rentDoc.status }]
      : [];

    res.json([...loanEvents, ...rentEvents]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load calendar', detail: err.message });
  }
});

// ===== GET /api/dashboard/search?q=... =====
// One search box across loans, expenses, and rent notes.
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ loans: [], expenses: [], rent: [] });

    const userId = req.user.id;
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [loans, expenses, rent] = await Promise.all([
      Loan.find({ user: userId, $or: [{ person_name: rx }, { description: rx }] })
        .sort({ date_taken: -1 }).limit(8),
      Expense.find({ user: userId, $or: [{ category: rx }, { note: rx }] })
        .sort({ expense_date: -1 }).limit(8),
      Rent.find({ user: userId, $or: [{ notes: rx }, { month_year: rx }] })
        .sort({ month_year: -1 }).limit(8),
    ]);

    res.json({ loans, expenses, rent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed', detail: err.message });
  }
});

// ===== Budgets — monthly spending goals per category =====

// GET /api/dashboard/budgets — each budget + how much has actually been
// spent against it so far this month.
router.get('/budgets', async (req, res) => {
  try {
    const month = req.query.month || thisMonth();
    const userId = req.user.id;
    const { start, end } = monthRange(month);

    const [budgets, spentAgg] = await Promise.all([
      Budget.find({ user: userId }).sort({ category: 1 }).select('category monthly_limit'),
      Expense.aggregate([
        { $match: { user: new Types.ObjectId(userId), expense_date: { $gte: start, $lt: end } } },
        { $group: { _id: '$category', spent: { $sum: '$amount' } } },
      ]),
    ]);

    const spentMap = {};
    spentAgg.forEach(r => { spentMap[r._id] = r.spent; });

    res.json(budgets.map(b => ({
      category: b.category,
      monthly_limit: b.monthly_limit,
      spent: spentMap[b.category] || 0,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load budgets', detail: err.message });
  }
});

// POST /api/dashboard/budgets — upsert a budget for one category
router.post('/budgets', async (req, res) => {
  try {
    const category = (req.body.category || '').trim();
    const monthly_limit = Number(req.body.monthly_limit);

    if (!category || !monthly_limit || monthly_limit <= 0) {
      return res.status(400).json({ error: 'category and a positive monthly_limit are required' });
    }

    await Budget.findOneAndUpdate(
      { user: req.user.id, category },
      { monthly_limit, updated_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ category, monthly_limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save budget', detail: err.message });
  }
});

// DELETE /api/dashboard/budgets/:category
router.delete('/budgets/:category', async (req, res) => {
  try {
    await Budget.deleteOne({ user: req.user.id, category: req.params.category });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete budget', detail: err.message });
  }
});

// ===== GET /api/dashboard/activity?limit=8 =====
// The most recent entries across loans, expenses, and rent — a single
// timeline instead of checking three pages to see what you last logged.
router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 30);
    const userId = req.user.id;

    const [loanDocs, expenseDocs, rentDocs] = await Promise.all([
      Loan.find({ user: userId }).sort({ created_at: -1 }).limit(15),
      Expense.find({ user: userId }).sort({ created_at: -1 }).limit(15),
      Rent.find({ user: userId }).sort({ created_at: -1 }).limit(15),
    ]);

    const loans = loanDocs.map(d => ({
      id: d.id, type: 'loan', direction: d.direction, person_name: d.person_name, amount: d.amount,
      description: d.description, event_date: d.date_taken, created_at: d.created_at, status: d.status,
    }));
    const expenses = expenseDocs.map(d => ({
      id: d.id, type: 'expense', category: d.category, amount: d.amount, note: d.note,
      event_date: d.expense_date, created_at: d.created_at, status: d.status, paid_by: d.paid_by, payer_name: d.payer_name,
    }));
    const rent = rentDocs.map(d => ({
      id: d.id, type: 'rent', month_year: d.month_year, amount: d.amount,
      event_date: d.due_date, created_at: d.created_at, status: d.status,
    }));

    const all = [...loans, ...expenses, ...rent]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    res.json(all);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load activity', detail: err.message });
  }
});

module.exports = router;
