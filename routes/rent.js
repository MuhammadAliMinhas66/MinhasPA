const express = require('express');
const router = express.Router();
const { Rent } = require('../models');

// GET /api/rent  — full history, most recent month first
router.get('/', async (req, res) => {
  try {
    const docs = await Rent.find({ user: req.user.id }).sort({ month_year: -1 });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rent records' });
  }
});

// POST /api/rent
router.post('/', async (req, res) => {
  try {
    const { month_year, amount, due_date, status, notes } = req.body;
    const paid_by = req.body.paid_by === 'loan' ? 'loan' : 'me';
    const loan_name = paid_by === 'loan' ? (req.body.loan_name || '').trim() : null;
    const paid_date = status === 'paid' ? (req.body.paid_date || new Date().toISOString().slice(0, 10)) : null;

    if (!month_year || !amount || !due_date) {
      return res.status(400).json({ error: 'month_year, amount, and due_date are required' });
    }
    if (paid_by === 'loan' && !loan_name) {
      return res.status(400).json({ error: 'loan_name is required when paid_by is "loan"' });
    }

    const doc = await Rent.create({
      user: req.user.id, month_year, amount, due_date,
      status: status || 'unpaid', paid_date, paid_by, loan_name, notes: notes || null,
    });

    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000) { // unique index violation
      return res.status(409).json({ error: 'A rent entry for that month already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create rent record' });
  }
});

// PUT /api/rent/:id  — edit, or mark paid/unpaid
router.put('/:id', async (req, res) => {
  try {
    const { amount, due_date, status, notes } = req.body;
    const paid_date = status === 'paid' ? (req.body.paid_date || new Date().toISOString().slice(0, 10)) : null;
    const paid_by = req.body.paid_by === 'loan' ? 'loan' : 'me';
    const loan_name = paid_by === 'loan' ? (req.body.loan_name || '').trim() : null;

    if (paid_by === 'loan' && !loan_name) {
      return res.status(400).json({ error: 'loan_name is required when paid_by is "loan"' });
    }

    const doc = await Rent.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { amount, due_date, status, paid_date, paid_by, loan_name, notes: notes || null },
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({ error: 'Rent record not found' });
    }

    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update rent record' });
  }
});

// DELETE /api/rent/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await Rent.findOneAndDelete({ _id: req.params.id, user: req.user.id });

    if (!result) {
      return res.status(404).json({ error: 'Rent record not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete rent record' });
  }
});

module.exports = router;
