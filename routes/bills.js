const express = require('express');
const router = express.Router();
const { Bill, BillCategory, BillCredential, BillPayment } = require('../models');
const { encrypt, decrypt } = require('../utils/crypto');

async function ensureUserHasDefaultCategories(userId) {
  const existing = await BillCategory.exists({ user: userId });
  if (existing) return;

  await BillCategory.insertMany([
    { user: userId, key: 'electricity', label: 'Electricity', icon: 'ti-bolt', color: '#f2a93b', is_default: true },
    { user: userId, key: 'internet', label: 'Internet', icon: 'ti-wifi', color: '#7c9eff', is_default: true },
    { user: userId, key: 'others', label: 'Others', icon: 'ti-file-invoice', color: '#6b6960', is_default: true },
  ]);
}

function slugify(label) {
  return String(label).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'custom';
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Clamp a due_day (1-31) to a real date in the given month/year.
function dueDateFor(year, monthIndexZeroBased, dueDay) {
  const lastDay = new Date(year, monthIndexZeroBased + 1, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return new Date(Date.UTC(year, monthIndexZeroBased, day)).toISOString().slice(0, 10);
}

// Makes sure every active bill has a bill_payments row for the current
// month — this is the "every month refresh" the user asked for. Runs
// automatically whenever bills are listed, so there's nothing to schedule.
async function ensureCurrentMonthInstances(userId) {
  const month = thisMonth();
  const now = new Date();

  const bills = await Bill.find({ user: userId, is_active: true }).select('due_day default_amount is_fixed_amount');

  await Promise.all(bills.map(async (bill) => {
    const existing = await BillPayment.exists({ bill: bill._id, month_year: month });
    if (existing) return;

    const due = dueDateFor(now.getFullYear(), now.getMonth(), bill.due_day);
    // "Same bill every month" bills carry their fixed amount forward
    // automatically instead of coming up blank each new month.
    const amount = bill.is_fixed_amount ? bill.default_amount : null;
    await BillPayment.create({
      bill: bill._id, user: userId, month_year: month, due_date: due, status: 'pending', amount,
    });
  }));
}

// ===== GET /api/bills/categories =====
router.get('/categories', async (req, res) => {
  try {
    await ensureUserHasDefaultCategories(req.user.id);
    const docs = await BillCategory.find({ user: req.user.id }).sort({ is_default: -1, label: 1 });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bill categories', detail: err.message });
  }
});

// ===== POST /api/bills/categories =====
router.post('/categories', async (req, res) => {
  try {
    const label = (req.body.label || '').trim();
    const icon = (req.body.icon || 'ti-file-invoice').trim();
    const color = (req.body.color || '#d4a24e').trim();
    if (!label) return res.status(400).json({ error: 'label is required' });

    await ensureUserHasDefaultCategories(req.user.id);

    let key = slugify(label);
    let n = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await BillCategory.exists({ key, user: req.user.id })) {
      key = `${slugify(label)}_${n}`;
      n += 1;
    }

    const doc = await BillCategory.create({ user: req.user.id, key, label, icon, color, is_default: false });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create bill category', detail: err.message });
  }
});

// ===== GET /api/bills — every recurring bill + its current-month instance =====
router.get('/', async (req, res) => {
  try {
    await ensureUserHasDefaultCategories(req.user.id);
    await ensureCurrentMonthInstances(req.user.id);
    const month = req.query.month || thisMonth();

    const [bills, categories, payments] = await Promise.all([
      Bill.find({ user: req.user.id }),
      BillCategory.find({ user: req.user.id }),
      BillPayment.find({ user: req.user.id, month_year: month }),
    ]);
    const credentials = await BillCredential.find({ bill: { $in: bills.map(b => b._id) } });

    const categoryMap = {};
    categories.forEach(c => { categoryMap[c.key] = c; });
    const paymentMap = {};
    payments.forEach(p => { paymentMap[p.bill.toString()] = p; });
    const credMap = {};
    credentials.forEach(c => { credMap[c.bill.toString()] = c; });

    const shaped = bills
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        const aP = paymentMap[a._id.toString()];
        const bP = paymentMap[b._id.toString()];
        const aDue = aP ? new Date(aP.due_date).getTime() : Infinity;
        const bDue = bP ? new Date(bP.due_date).getTime() : Infinity;
        if (aDue !== bDue) return aDue - bDue;
        return a.biller_name.localeCompare(b.biller_name);
      })
      .map(b => {
        const cat = categoryMap[b.category_key];
        const p = paymentMap[b._id.toString()];
        const cred = credMap[b._id.toString()];
        return {
          id: b.id,
          category_key: b.category_key,
          category_label: cat ? cat.label : b.category_key,
          category_icon: cat ? cat.icon : 'ti-file-invoice',
          category_color: cat ? cat.color : '#6b6960',
          biller_name: b.biller_name,
          due_day: b.due_day,
          default_amount: b.default_amount !== null ? Number(b.default_amount) : null,
          is_fixed_amount: !!b.is_fixed_amount,
          notes: b.notes,
          is_active: b.is_active,
          created_at: b.created_at,
          has_credentials: !!cred,
          credentials_given_date: cred ? cred.given_date : null,
          current: p ? {
            payment_id: p.id,
            month_year: p.month_year,
            amount: p.amount !== null ? Number(p.amount) : null,
            extra_charges: Number(p.extra_charges),
            total: (p.amount !== null ? Number(p.amount) : 0) + Number(p.extra_charges),
            due_date: p.due_date,
            status: p.status,
            paid_on: p.paid_on,
            paid_through: p.paid_through,
          } : null,
        };
      });

    res.json(shaped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bills', detail: err.message });
  }
});

// ===== GET /api/bills/pending — every pending month-instance across all
// bills, soonest due date first. This is what the dashboard's "Bills due"
// widget shows at the top of the list. =====
router.get('/pending', async (req, res) => {
  try {
    await ensureCurrentMonthInstances(req.user.id);

    const payments = await BillPayment.find({ user: req.user.id, status: 'pending' })
      .populate({ path: 'bill', match: { is_active: true }, select: 'biller_name category_key is_active' })
      .sort({ due_date: 1 });

    const categories = await BillCategory.find({ user: req.user.id });
    const categoryMap = {};
    categories.forEach(c => { categoryMap[c.key] = c; });

    const todayStart = new Date(new Date().toDateString());

    res.json(
      payments.filter(p => p.bill).map(p => {
        const cat = categoryMap[p.bill.category_key];
        return {
          payment_id: p.id,
          bill_id: p.bill.id,
          month_year: p.month_year,
          amount: p.amount !== null ? Number(p.amount) : null,
          extra_charges: Number(p.extra_charges),
          total: (p.amount !== null ? Number(p.amount) : 0) + Number(p.extra_charges),
          due_date: p.due_date,
          biller_name: p.bill.biller_name,
          category_key: p.bill.category_key,
          category_label: cat ? cat.label : p.bill.category_key,
          category_icon: cat ? cat.icon : 'ti-file-invoice',
          category_color: cat ? cat.color : '#6b6960',
          overdue: new Date(p.due_date) < todayStart,
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending bills', detail: err.message });
  }
});

// ===== POST /api/bills — create a new recurring bill =====
router.post('/', async (req, res) => {
  try {
    const { category_key, biller_name, notes } = req.body;
    const due_day = Number(req.body.due_day);
    const default_amount = req.body.default_amount !== undefined && req.body.default_amount !== ''
      ? Number(req.body.default_amount) : null;
    const is_fixed_amount = !!req.body.is_fixed_amount;

    if (!category_key || !biller_name || !due_day || due_day < 1 || due_day > 31) {
      return res.status(400).json({ error: 'category_key, biller_name, and a due_day (1-31) are required' });
    }

    const bill = await Bill.create({
      user: req.user.id, category_key, biller_name: biller_name.trim(), due_day,
      default_amount, is_fixed_amount, notes: (notes || '').trim() || null,
    });

    // Create this month's instance right away — prefilled with the "first
    // month charges" amount if the user already knows it, so it shows up
    // in the pending list immediately instead of waiting for a background pass.
    const now = new Date();
    const due = dueDateFor(now.getFullYear(), now.getMonth(), due_day);
    await BillPayment.create({
      bill: bill._id, user: req.user.id, month_year: thisMonth(), due_date: due, status: 'pending', amount: default_amount,
    });

    // Optional credentials block, encrypted immediately if provided.
    if (req.body.credentials && typeof req.body.credentials === 'object') {
      await saveCredentials(bill._id, req.body.credentials);
    }

    res.status(201).json(bill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create bill', detail: err.message });
  }
});

// ===== PUT /api/bills/:id — edit a bill definition =====
router.put('/:id', async (req, res) => {
  try {
    const { category_key, biller_name, notes } = req.body;
    const due_day = Number(req.body.due_day);
    const default_amount = req.body.default_amount !== undefined && req.body.default_amount !== ''
      ? Number(req.body.default_amount) : null;
    const is_fixed_amount = !!req.body.is_fixed_amount;
    const is_active = req.body.is_active === undefined ? true : !!req.body.is_active;

    if (!category_key || !biller_name || !due_day || due_day < 1 || due_day > 31) {
      return res.status(400).json({ error: 'category_key, biller_name, and a due_day (1-31) are required' });
    }

    const bill = await Bill.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { category_key, biller_name: biller_name.trim(), due_day, default_amount, is_fixed_amount, notes: (notes || '').trim() || null, is_active },
      { new: true, runValidators: true }
    );

    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    // If "same amount every month" was just turned on with a known amount,
    // backfill this month's instance too if it's still blank.
    if (is_fixed_amount && default_amount !== null) {
      await BillPayment.updateOne(
        { bill: bill._id, month_year: thisMonth(), amount: null, status: 'pending' },
        { amount: default_amount }
      );
    }

    if (req.body.credentials && typeof req.body.credentials === 'object') {
      await saveCredentials(bill._id, req.body.credentials);
    }

    res.json(bill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bill', detail: err.message });
  }
});

// ===== DELETE /api/bills/:id =====
router.delete('/:id', async (req, res) => {
  try {
    const bill = await Bill.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    // Mirrors the old ON DELETE CASCADE — clean up dependent rows by code.
    await Promise.all([
      BillPayment.deleteMany({ bill: bill._id }),
      BillCredential.deleteMany({ bill: bill._id }),
    ]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete bill', detail: err.message });
  }
});

// ===== Credentials (fully encrypted) =====

async function ownsBill(billId, userId) {
  return Bill.exists({ _id: billId, user: userId });
}

async function saveCredentials(billId, creds) {
  const plain = {
    portal_email: creds.portal_email || '',
    portal_phone: creds.portal_phone || '',
    portal_password: creds.portal_password || '',
    given_email: creds.given_email || '',
    given_phone: creds.given_phone || '',
  };
  const hasAnything = Object.values(plain).some(v => v);
  const encrypted = hasAnything ? encrypt(JSON.stringify(plain)) : null;
  const given_date = creds.given_date || null;

  await BillCredential.findOneAndUpdate(
    { bill: billId },
    { given_date, encrypted_data: encrypted, updated_at: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// GET /api/bills/:id/credentials — decrypts on demand. Never included in
// the main bills list response on purpose.
router.get('/:id/credentials', async (req, res) => {
  try {
    if (!(await ownsBill(req.params.id, req.user.id))) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const row = await BillCredential.findOne({ bill: req.params.id });

    if (!row) {
      return res.json({ given_date: null, portal_email: '', portal_phone: '', portal_password: '', given_email: '', given_phone: '' });
    }

    let decrypted = {};
    try { decrypted = row.encrypted_data ? JSON.parse(decrypt(row.encrypted_data)) : {}; } catch (e) { decrypted = {}; }

    res.json({
      given_date: row.given_date,
      portal_email: decrypted.portal_email || '',
      portal_phone: decrypted.portal_phone || '',
      portal_password: decrypted.portal_password || '',
      given_email: decrypted.given_email || '',
      given_phone: decrypted.given_phone || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch credentials', detail: err.message });
  }
});

// PUT /api/bills/:id/credentials — set/replace, independent of the main edit form
router.put('/:id/credentials', async (req, res) => {
  try {
    if (!(await ownsBill(req.params.id, req.user.id))) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    await saveCredentials(req.params.id, req.body || {});
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save credentials', detail: err.message });
  }
});

// ===== GET /api/bills/:id/history — every month recorded for one bill =====
router.get('/:id/history', async (req, res) => {
  try {
    if (!(await ownsBill(req.params.id, req.user.id))) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    const payments = await BillPayment.find({ bill: req.params.id }).sort({ month_year: -1 });
    res.json(payments.map(p => ({
      payment_id: p.id,
      month_year: p.month_year,
      amount: p.amount !== null ? Number(p.amount) : null,
      extra_charges: Number(p.extra_charges),
      total: (p.amount !== null ? Number(p.amount) : 0) + Number(p.extra_charges),
      due_date: p.due_date,
      status: p.status,
      paid_on: p.paid_on,
      paid_through: p.paid_through,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bill history', detail: err.message });
  }
});

// ===== Month-instance actions (pay / edit / delete a single month) =====

// POST /api/bills/payments/:paymentId/pay
router.post('/payments/:paymentId/pay', async (req, res) => {
  try {
    const amount = req.body.amount !== undefined && req.body.amount !== '' ? Number(req.body.amount) : undefined;
    const extra_charges = req.body.extra_charges !== undefined && req.body.extra_charges !== '' ? Number(req.body.extra_charges) : 0;
    const paid_on = req.body.paid_on || new Date().toISOString().slice(0, 10);
    const paid_through = (req.body.paid_through || '').trim() || null;

    const update = { extra_charges, status: 'paid', paid_on, paid_through };
    // Only overwrite amount if the client actually sent one (so paying a
    // month that already had its amount set doesn't accidentally null it out).
    if (amount !== undefined) update.amount = amount;

    const payment = await BillPayment.findOneAndUpdate(
      { _id: req.params.paymentId, user: req.user.id },
      update,
      { new: true, runValidators: true }
    );

    if (!payment) return res.status(404).json({ error: 'Bill payment not found' });
    res.json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark bill as paid', detail: err.message });
  }
});

// PUT /api/bills/payments/:paymentId — full edit of one month's instance
router.put('/payments/:paymentId', async (req, res) => {
  try {
    const amount = req.body.amount !== undefined && req.body.amount !== '' ? Number(req.body.amount) : null;
    const extra_charges = Number(req.body.extra_charges) || 0;
    const due_date = req.body.due_date;
    const status = req.body.status === 'paid' ? 'paid' : 'pending';
    const paid_on = status === 'paid' ? (req.body.paid_on || new Date().toISOString().slice(0, 10)) : null;
    const paid_through = status === 'paid' ? ((req.body.paid_through || '').trim() || null) : null;

    if (!due_date) return res.status(400).json({ error: 'due_date is required' });

    const payment = await BillPayment.findOneAndUpdate(
      { _id: req.params.paymentId, user: req.user.id },
      { amount, extra_charges, due_date, status, paid_on, paid_through },
      { new: true, runValidators: true }
    );

    if (!payment) return res.status(404).json({ error: 'Bill payment not found' });
    res.json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bill payment', detail: err.message });
  }
});

// DELETE /api/bills/payments/:paymentId
router.delete('/payments/:paymentId', async (req, res) => {
  try {
    const result = await BillPayment.findOneAndDelete({ _id: req.params.paymentId, user: req.user.id });
    if (!result) return res.status(404).json({ error: 'Bill payment not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete bill payment', detail: err.message });
  }
});

module.exports = router;
