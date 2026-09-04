const express = require('express');
const router = express.Router();
const { Loan, Expense } = require('../models');
const { monthRange } = require('../utils/dateRange');

function withCritical(loanObj) {
  const isCritical = loanObj.status === 'pending'
    && loanObj.due_date
    && new Date(loanObj.due_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return { ...loanObj, is_critical: isCritical ? 1 : 0 };
}

// GET /api/loans?direction=taken&status=pending&month=2026-07&critical=true
router.get('/', async (req, res) => {
  try {
    const { direction, status, month, critical } = req.query;
    const filter = { user: req.user.id };
    if (direction) filter.direction = direction;
    if (status) filter.status = status;
    if (month) {
      const { start, end } = monthRange(month);
      filter.date_taken = { $gte: start, $lt: end };
    }

    const docs = await Loan.find(filter).sort({ amount: -1 });
    let rows = docs.map(d => withCritical(d.toJSON()));

    if (critical === 'true') {
      rows = rows.filter(r => r.is_critical === 1);
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

// POST /api/loans
router.post('/', async (req, res) => {
  try {
    const { direction, person_name, amount, description, date_taken, due_date } = req.body;

    if (!direction || !person_name || !amount || !date_taken) {
      return res.status(400).json({ error: 'direction, person_name, amount, and date_taken are required' });
    }

    const loan = await Loan.create({
      user: req.user.id, direction, person_name, amount,
      description: description || null, date_taken, due_date: due_date || null,
    });

    res.status(201).json(withCritical(loan.toJSON()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create loan' });
  }
});

// PUT /api/loans/:id  (edit fields and/or mark done/pending)
router.put('/:id', async (req, res) => {
  try {
    const { direction, person_name, amount, description, date_taken, due_date, status } = req.body;

    const loan = await Loan.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { direction, person_name, amount, description: description || null, date_taken, due_date: due_date || null, status },
      { new: true, runValidators: true }
    );

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    // Keep a linked expense in sync: settling the loan here also settles
    // whichever expense this same debt was logged as, so you only ever
    // have to mark it done in one place.
    if (status === 'done') {
      await Expense.updateMany(
        { linked_loan_id: loan._id, user: req.user.id, status: 'unpaid' },
        { status: 'paid' }
      );
    }

    res.json(withCritical(loan.toJSON()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update loan' });
  }
});

// DELETE /api/loans/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await Loan.findOneAndDelete({ _id: req.params.id, user: req.user.id });

    if (!result) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete loan' });
  }
});

module.exports = router;
