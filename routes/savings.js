const express = require('express');
const router = express.Router();
const { Types } = require('mongoose');
const { SavingsEntry, Committee, CommitteePayment } = require('../models');
const { requireFeature } = require('../middleware/requireFeature');

// 'savings' gates the Savings insights page: the summary card and the
// manual savings entries. Committees is gated separately below, right
// before its own routes, since it's a distinct feature in the UI.
router.use(['/summary', '/entries', '/entries/:id'], requireFeature('savings'));

// ===== Summary — the 2 headline numbers for the page =====
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;

    const [savingsAgg, committeesAgg, paidPayments] = await Promise.all([
      SavingsEntry.aggregate([
        { $match: { user: new Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Committee.aggregate([
        { $match: { user: new Types.ObjectId(userId), status: 'active' } },
        { $group: { _id: null, total: { $sum: '$monthly_amount' } } },
      ]),
      CommitteePayment.find({ user: userId, status: 'paid' }).populate('committee', 'monthly_amount'),
    ]);

    const committeesPaidTotal = paidPayments.reduce((s, p) => s + (p.committee ? Number(p.committee.monthly_amount) : 0), 0);

    res.json({
      actual_savings_total: savingsAgg[0] ? savingsAgg[0].total : 0,
      committees_monthly_total: committeesAgg[0] ? committeesAgg[0].total : 0,
      committees_paid_total: committeesPaidTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load savings summary', detail: err.message });
  }
});

// ===== Savings entries =====
router.get('/entries', async (req, res) => {
  try {
    const docs = await SavingsEntry.find({ user: req.user.id }).sort({ month_year: -1, _id: -1 });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load savings entries', detail: err.message });
  }
});

router.post('/entries', async (req, res) => {
  try {
    const { month_year, amount, note } = req.body;
    if (!month_year || !amount) return res.status(400).json({ error: 'month_year and amount are required' });

    const doc = await SavingsEntry.create({ user: req.user.id, month_year, amount, note: note || null });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add savings entry', detail: err.message });
  }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    await SavingsEntry.deleteOne({ _id: req.params.id, user: req.user.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete savings entry', detail: err.message });
  }
});

// ===== Committees =====
// NOTE: Committees is shown as its own nav item, separate from "Savings
// insights", so it gets its own feature flag ('committees') rather than
// inheriting 'savings'. Without this, disabling Savings insights for a
// user silently broke Committees too, since both used to share the
// requireFeature('savings') check at the router mount in server.js.
router.use('/committees', requireFeature('committees'));

router.get('/committees', async (req, res) => {
  try {
    const userId = req.user.id;
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const committees = await Committee.find({ user: userId }).sort({ status: 1, created_at: -1 });
    const payments = await CommitteePayment.find({ user: userId }).sort({ month_year: -1 });

    const rows = committees.map(c => {
      const cJson = c.toJSON();
      const allRows = payments.filter(p => p.committee.toString() === c._id.toString());
      const paidRows = allRows.filter(p => p.status === 'paid').map(p => p.toJSON());
      const thisMonthRow = allRows.find(p => p.month_year === thisMonth);
      return {
        ...cJson,
        months_paid: paidRows.length,
        total_paid: paidRows.length * Number(c.monthly_amount),
        paid_this_month: !!(thisMonthRow && thisMonthRow.status === 'paid'),
        // Full history so the UI can show an animated timeline without a
        // second round-trip per committee.
        payments: paidRows.sort((a, b) => b.month_year.localeCompare(a.month_year)),
      };
    });

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load committees', detail: err.message });
  }
});

router.post('/committees', async (req, res) => {
  try {
    const { name, monthly_amount, members, payout_month, started_date } = req.body;
    if (!name || !monthly_amount) return res.status(400).json({ error: 'name and monthly_amount are required' });

    const doc = await Committee.create({
      user: req.user.id, name, monthly_amount, members: members || null,
      payout_month: payout_month || null, started_date: started_date || null,
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add committee', detail: err.message });
  }
});

router.put('/committees/:id', async (req, res) => {
  try {
    const { name, monthly_amount, members, payout_month, started_date, status } = req.body;
    const doc = await Committee.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      {
        name, monthly_amount, members: members || null, payout_month: payout_month || null,
        started_date: started_date || null, status: status === 'completed' ? 'completed' : 'active',
      },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Committee not found' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update committee', detail: err.message });
  }
});

router.delete('/committees/:id', async (req, res) => {
  try {
    await CommitteePayment.deleteMany({ committee: req.params.id, user: req.user.id });
    await Committee.deleteOne({ _id: req.params.id, user: req.user.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete committee', detail: err.message });
  }
});

// POST /api/savings/committees/:id/payments
// body: { month_year, paid_date, payment_method, paid_by_other, payer_name }
// Records a payment for that month. If someone else covered it, that's
// tracked right here too — no need for a separate loan entry, since a
// committee payment is already tied to a specific month and committee.
router.post('/committees/:id/payments', async (req, res) => {
  try {
    const { month_year, paid_date, payment_method, paid_by_other, payer_name } = req.body;
    if (!month_year) return res.status(400).json({ error: 'month_year is required' });

    // Make sure this committee actually belongs to the requesting user
    // before recording anything against it.
    const ownedCommittee = await Committee.exists({ _id: req.params.id, user: req.user.id });
    if (!ownedCommittee) return res.status(404).json({ error: 'Committee not found' });

    const dateVal = paid_date || new Date().toISOString().slice(0, 10);
    const isOther = !!paid_by_other;
    const nameVal = isOther ? (payer_name || '').trim() || null : null;

    const doc = await CommitteePayment.findOneAndUpdate(
      { committee: req.params.id, month_year, user: req.user.id },
      {
        status: 'paid', paid_date: dateVal, payment_method: payment_method || null,
        paid_by_other: isOther, payer_name: nameVal,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment', detail: err.message });
  }
});

// PUT /api/savings/committees/:id/payments/:month/reimburse
// body: { reimbursed_date } — marks that you've paid back whoever covered
// this month's committee for you.
router.put('/committees/:id/payments/:month/reimburse', async (req, res) => {
  try {
    const { reimbursed_date } = req.body;

    const doc = await CommitteePayment.findOneAndUpdate(
      { committee: req.params.id, month_year: req.params.month, user: req.user.id },
      { reimbursed: true, reimbursed_date: reimbursed_date || new Date().toISOString().slice(0, 10) },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Payment not found' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark reimbursed', detail: err.message });
  }
});

// DELETE /api/savings/committees/:id/payments/:month — undo a recorded payment
router.delete('/committees/:id/payments/:month', async (req, res) => {
  try {
    await CommitteePayment.deleteOne({ committee: req.params.id, month_year: req.params.month, user: req.user.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove payment', detail: err.message });
  }
});

module.exports = router;
