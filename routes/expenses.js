const express = require('express');
const router = express.Router();
const { Expense, Loan } = require('../models');
const { monthRange, yearRange, dayRange } = require('../utils/dateRange');

// GET /api/expenses?month=2026-07&category=meals&date=2026-07-14&year=2026
// Priority when several are present: date > month > year.
router.get('/', async (req, res) => {
  try {
    const { month, category, date, year } = req.query;
    const filter = { user: req.user.id };

    if (date) {
      const { start, end } = dayRange(date);
      filter.expense_date = { $gte: start, $lt: end };
    } else if (month) {
      const { start, end } = monthRange(month);
      filter.expense_date = { $gte: start, $lt: end };
    } else if (year) {
      const { start, end } = yearRange(year);
      filter.expense_date = { $gte: start, $lt: end };
    }
    if (category) filter.category = category;

    // Expenses someone else paid for you surface first, then your own —
    // most recent first within each group.
    const docs = await Expense.find(filter);
    const sorted = docs
      .map(d => d.toJSON())
      .sort((a, b) => {
        const aOther = a.paid_by === 'other' ? 0 : 1;
        const bOther = b.paid_by === 'other' ? 0 : 1;
        if (aOther !== bOther) return aOther - bOther;
        const dateDiff = new Date(b.expense_date) - new Date(a.expense_date);
        if (dateDiff !== 0) return dateDiff;
        return b.id.localeCompare(a.id);
      });

    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// GET /api/expenses/summary?month=2026-07&date=2026-07-14&year=2026 — totals
// grouped by category, for the chart. Priority: date > month > year.
router.get('/summary', async (req, res) => {
  try {
    const { month, date, year } = req.query;
    const match = { user: req.user.id };

    if (date) {
      const { start, end } = dayRange(date);
      match.expense_date = { $gte: start, $lt: end };
    } else if (month) {
      const { start, end } = monthRange(month);
      match.expense_date = { $gte: start, $lt: end };
    } else if (year) {
      const { start, end } = yearRange(year);
      match.expense_date = { $gte: start, $lt: end };
    }

    const rows = await Expense.aggregate([
      { $match: match },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]);

    res.json(rows.map(r => ({ category: r._id, total: r.total })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch expense summary' });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  try {
    const { category, amount, expense_date, note } = req.body;
    const paid_by = req.body.paid_by === 'other' ? 'other' : 'me';
    const payer_name = paid_by === 'other' ? (req.body.payer_name || '').trim() : null;
    const status = req.body.status === 'unpaid' ? 'unpaid' : 'paid';

    if (!category || !amount || !expense_date) {
      return res.status(400).json({ error: 'category, amount, and expense_date are required' });
    }
    if (paid_by === 'other' && !payer_name) {
      return res.status(400).json({ error: 'payer_name is required when paid_by is "other"' });
    }

    const doc = await Expense.create({
      user: req.user.id, category, amount, expense_date, paid_by, payer_name, note: note || null, status,
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create expense', detail: err.message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  try {
    const { category, amount, expense_date, note } = req.body;
    const paid_by = req.body.paid_by === 'other' ? 'other' : 'me';
    const payer_name = paid_by === 'other' ? (req.body.payer_name || '').trim() : null;
    const status = req.body.status === 'unpaid' ? 'unpaid' : 'paid';

    if (paid_by === 'other' && !payer_name) {
      return res.status(400).json({ error: 'payer_name is required when paid_by is "other"' });
    }

    const updated = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { category, amount, expense_date, paid_by, payer_name, note: note || null, status },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Mirror of the loans-side sync: settling this expense also settles
    // the loan it's linked to, so the two never drift out of sync.
    if (status === 'paid' && updated.linked_loan_id) {
      await Loan.updateOne(
        { _id: updated.linked_loan_id, user: req.user.id, status: { $ne: 'done' } },
        { status: 'done' }
      );
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await Expense.findOneAndDelete({ _id: req.params.id, user: req.user.id });

    if (!result) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// ===== Link an expense to a loan — so the same debt isn't double-counted =====

// POST /api/expenses/:id/link-loan — creates a brand-new loan from this
// expense's details (person, amount, description) and links the two.
router.post('/:id/link-loan', async (req, res) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.id, user: req.user.id });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (expense.paid_by !== 'other' || !expense.payer_name) {
      return res.status(400).json({ error: 'Only expenses someone else paid for you can be linked to a loan' });
    }

    const loan = await Loan.create({
      user: req.user.id,
      direction: 'taken',
      person_name: expense.payer_name,
      amount: expense.amount,
      description: expense.note || 'Linked from an expense',
      date_taken: expense.expense_date,
      status: 'pending',
    });

    expense.linked_loan_id = loan._id;
    await expense.save();

    res.status(201).json({ expense, loan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to link expense to a new loan', detail: err.message });
  }
});

// PUT /api/expenses/:id/link-loan — links to an EXISTING loan instead of
// creating a new one (body: { loan_id }), for when you already logged it.
router.put('/:id/link-loan', async (req, res) => {
  try {
    const loan_id = req.body.loan_id;
    if (!loan_id) return res.status(400).json({ error: 'loan_id is required' });

    const loan = await Loan.findOne({ _id: loan_id, user: req.user.id }).select('_id');
    if (!loan) return res.status(404).json({ error: 'That loan does not exist' });

    const updated = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { linked_loan_id: loan_id },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Expense not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to link expense to loan', detail: err.message });
  }
});

// DELETE /api/expenses/:id/link-loan — unlinks only; the loan itself is
// untouched and stays on the Loans page exactly as it was.
router.delete('/:id/link-loan', async (req, res) => {
  try {
    const updated = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { linked_loan_id: null },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Expense not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unlink expense', detail: err.message });
  }
});

module.exports = router;
