const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { MessGroup, MessMember, MessMenu, MessAttendance, MessExpense, MessTask, MessContribution, User } = require('../models');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function genInviteCode() {
  return 'MESS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Loads the group and this user's active membership row onto req, or
// responds with an error. Every /groups/:groupId/* route below needs
// both, so this is the one place that logic lives.
async function loadGroupAndMembership(req, res, next) {
  try {
    const group = await MessGroup.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Mess group not found' });

    const membership = await MessMember.findOne({ group: group.id, user: req.user.id, status: 'active' });
    if (!membership) return res.status(403).json({ error: "You're not a member of this mess group" });

    req.messGroup = group;
    req.messMembership = membership;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load mess group' });
  }
}

function requireOwner(req, res, next) {
  if (req.messMembership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the group owner can do this' });
  }
  next();
}

// Small, consistent shape for a member row on every response — resolves
// the User doc so the frontend never has to make a second round trip.
async function serializeMembers(groupId) {
  const members = await MessMember.find({ group: groupId, status: 'active' }).sort({ joined_at: 1 });
  const users = await User.find({ _id: { $in: members.map(m => m.user) } }).select('full_name username');
  const userMap = new Map(users.map(u => [u.id, u]));
  return members.map(m => {
    const u = userMap.get(String(m.user));
    return {
      user_id: String(m.user),
      full_name: u ? u.full_name : 'Former member',
      username: u ? u.username : null,
      role: m.role,
      joined_at: m.joined_at,
    };
  });
}

// ===== Groups =====

// GET /api/mess/groups — every group I'm an active member of
router.get('/groups', async (req, res) => {
  try {
    const memberships = await MessMember.find({ user: req.user.id, status: 'active' });
    const groupIds = memberships.map(m => m.group);
    const groups = await MessGroup.find({ _id: { $in: groupIds } }).sort({ created_at: -1 });

    const counts = await MessMember.aggregate([
      { $match: { group: { $in: groups.map(g => g._id) }, status: 'active' } },
      { $group: { _id: '$group', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map(c => [String(c._id), c.count]));
    const roleMap = new Map(memberships.map(m => [String(m.group), m.role]));

    res.json(groups.map(g => ({
      id: g.id,
      name: g.name,
      currency: g.currency,
      invite_code: g.invite_code,
      status: g.status,
      member_count: countMap.get(g.id) || 0,
      my_role: roleMap.get(g.id) || 'member',
      created_at: g.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load mess groups' });
  }
});

// POST /api/mess/groups — create a new group; creator becomes owner
router.post('/groups', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Group name is required' });
    if (name.length > 80) return res.status(400).json({ error: 'Group name is too long' });

    let invite_code;
    // Vanishingly unlikely to collide, but loop just in case.
    for (let i = 0; i < 5; i++) {
      invite_code = genInviteCode();
      if (!(await MessGroup.findOne({ invite_code }))) break;
    }

    const group = await MessGroup.create({
      owner: req.user.id,
      name,
      currency: (req.body.currency || 'Rs').trim().slice(0, 10) || 'Rs',
      invite_code,
    });
    await MessMember.create({ group: group.id, user: req.user.id, role: 'owner', status: 'active' });

    res.status(201).json({ id: group.id, name: group.name, currency: group.currency, invite_code: group.invite_code, member_count: 1, my_role: 'owner', created_at: group.created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create mess group' });
  }
});

// POST /api/mess/join — join a group by invite code
router.post('/join', async (req, res) => {
  try {
    const code = (req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Enter an invite code' });

    const group = await MessGroup.findOne({ invite_code: code });
    if (!group) return res.status(404).json({ error: "That invite code doesn't match any mess group" });

    const existing = await MessMember.findOne({ group: group.id, user: req.user.id });
    if (existing) {
      if (existing.status === 'active') {
        return res.status(409).json({ error: "You're already in this group" });
      }
      existing.status = 'active';
      existing.joined_at = new Date();
      await existing.save();
    } else {
      await MessMember.create({ group: group.id, user: req.user.id, role: 'member', status: 'active' });
    }

    res.status(201).json({ id: group.id, name: group.name, currency: group.currency });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join mess group' });
  }
});

// GET /api/mess/groups/:groupId — details + member list
router.get('/groups/:groupId', loadGroupAndMembership, async (req, res) => {
  try {
    const members = await serializeMembers(req.messGroup.id);
    res.json({
      id: req.messGroup.id,
      name: req.messGroup.name,
      currency: req.messGroup.currency,
      invite_code: req.messGroup.invite_code,
      status: req.messGroup.status,
      contribution_target: req.messGroup.contribution_target,
      contribution_round: req.messGroup.contribution_round,
      my_role: req.messMembership.role,
      members,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load group' });
  }
});

// PUT /api/mess/groups/:groupId — rename / change currency (owner only)
router.put('/groups/:groupId', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Group name is required' });
      req.messGroup.name = name.slice(0, 80);
    }
    if (req.body.currency !== undefined) {
      req.messGroup.currency = String(req.body.currency).trim().slice(0, 10) || 'Rs';
    }
    if (req.body.contribution_target !== undefined) {
      const target = Number(req.body.contribution_target);
      if (!Number.isFinite(target) || target < 0) return res.status(400).json({ error: 'Enter a valid contribution amount' });
      req.messGroup.contribution_target = target;
    }
    await req.messGroup.save();
    res.json({ id: req.messGroup.id, name: req.messGroup.name, currency: req.messGroup.currency, contribution_target: req.messGroup.contribution_target });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// POST /api/mess/groups/:groupId/regenerate-code — owner only
router.post('/groups/:groupId/regenerate-code', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    let invite_code;
    for (let i = 0; i < 5; i++) {
      invite_code = genInviteCode();
      if (!(await MessGroup.findOne({ invite_code }))) break;
    }
    req.messGroup.invite_code = invite_code;
    await req.messGroup.save();
    res.json({ invite_code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

// DELETE /api/mess/groups/:groupId/leave — any member leaves (owner can't; must transfer or delete)
router.delete('/groups/:groupId/leave', loadGroupAndMembership, async (req, res) => {
  try {
    if (req.messMembership.role === 'owner') {
      return res.status(400).json({ error: "As the owner, you can't leave — remove the group instead, or promote another member first." });
    }
    req.messMembership.status = 'left';
    await req.messMembership.save();
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// DELETE /api/mess/groups/:groupId/members/:userId — owner removes a member
router.delete('/groups/:groupId/members/:userId', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: "You can't remove yourself as the owner." });
    }
    const member = await MessMember.findOne({ group: req.messGroup.id, user: req.params.userId, status: 'active' });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    member.status = 'removed';
    await member.save();
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ===== Mess fund: fixed per-person contributions (e.g. everyone puts in Rs 1500) =====

// POST /api/mess/groups/:groupId/round — owner starts a fresh collection
// round (e.g. next month) without losing who paid what in the old one.
router.post('/groups/:groupId/round', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    req.messGroup.contribution_round += 1;
    await req.messGroup.save();
    res.json({ contribution_round: req.messGroup.contribution_round });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start a new round' });
  }
});

// GET /api/mess/groups/:groupId/fund — per-member paid/remaining for the
// current round, plus lifetime totals so the fund balance always makes sense.
router.get('/groups/:groupId/fund', loadGroupAndMembership, async (req, res) => {
  try {
    const round = req.messGroup.contribution_round;
    const target = req.messGroup.contribution_target;

    const [members, roundContributions, allContributions, allExpenses] = await Promise.all([
      serializeMembers(req.messGroup.id),
      MessContribution.find({ group: req.messGroup.id, round }).sort({ created_at: -1 }),
      MessContribution.aggregate([{ $match: { group: req.messGroup._id } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      MessExpense.aggregate([{ $match: { group: req.messGroup._id } }, { $group: { _id: null, total: { $sum: '$cost' } } }]),
    ]);

    const paidThisRoundByMember = new Map();
    for (const c of roundContributions) {
      const key = String(c.member);
      paidThisRoundByMember.set(key, (paidThisRoundByMember.get(key) || 0) + c.amount);
    }

    const memberRows = members.map(m => {
      const paid = Math.round((paidThisRoundByMember.get(m.user_id) || 0) * 100) / 100;
      const remaining = Math.max(0, Math.round((target - paid) * 100) / 100);
      return { user_id: m.user_id, full_name: m.full_name, role: m.role, paid, remaining, status: remaining <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending') };
    });

    const totalCollectedLifetime = Math.round(((allContributions[0]?.total) || 0) * 100) / 100;
    const totalSpentLifetime = Math.round(((allExpenses[0]?.total) || 0) * 100) / 100;

    res.json({
      round,
      target,
      members: memberRows,
      recent_payments: roundContributions.slice(0, 15).map(c => ({
        id: c.id, member: String(c.member), amount: c.amount, date: c.date, notes: c.notes, created_at: c.created_at,
      })),
      totals: {
        collected_this_round: Math.round(memberRows.reduce((s, m) => s + m.paid, 0) * 100) / 100,
        total_collected_lifetime: totalCollectedLifetime,
        total_spent_lifetime: totalSpentLifetime,
        fund_balance: Math.round((totalCollectedLifetime - totalSpentLifetime) * 100) / 100,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load fund summary' });
  }
});

// POST /api/mess/groups/:groupId/contributions — owner records a payment coming in
router.post('/groups/:groupId/contributions', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });

    const isMember = await MessMember.findOne({ group: req.messGroup.id, user: req.body.member, status: 'active' });
    if (!isMember) return res.status(400).json({ error: 'That person is not an active member of this group' });

    const date = DATE_RE.test(req.body.date || '') ? req.body.date : todayStr();

    const contribution = await MessContribution.create({
      group: req.messGroup.id,
      member: req.body.member,
      amount,
      date,
      round: req.messGroup.contribution_round,
      notes: req.body.notes ? String(req.body.notes).trim().slice(0, 200) : null,
      recorded_by: req.user.id,
    });

    res.status(201).json({
      id: contribution.id, member: String(contribution.member), amount: contribution.amount,
      date: contribution.date, notes: contribution.notes, created_at: contribution.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// DELETE /api/mess/groups/:groupId/contributions/:contributionId — owner undoes a mistaken entry
router.delete('/groups/:groupId/contributions/:contributionId', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    const contribution = await MessContribution.findOne({ _id: req.params.contributionId, group: req.messGroup.id });
    if (!contribution) return res.status(404).json({ error: 'Payment record not found' });
    await MessContribution.deleteOne({ _id: contribution.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete payment record' });
  }
});

// ===== Daily menu, attendance and expenses =====

// GET /api/mess/groups/:groupId/days/:date — everything needed to render one day
router.get('/groups/:groupId/days/:date', loadGroupAndMembership, async (req, res) => {
  try {
    const date = req.params.date;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const [menu, expenses, absences, members, tasks] = await Promise.all([
      MessMenu.findOne({ group: req.messGroup.id, date }),
      MessExpense.find({ group: req.messGroup.id, date }).sort({ created_at: 1 }),
      MessAttendance.find({ group: req.messGroup.id, date }),
      serializeMembers(req.messGroup.id),
      MessTask.find({ group: req.messGroup.id, date }).sort({ created_at: 1 }),
    ]);

    const excludedIds = new Set(absences.map(a => String(a.member)));
    const memberRows = members.map(m => ({ ...m, eating: !excludedIds.has(m.user_id) }));

    const totalExpense = expenses.reduce((sum, e) => sum + e.cost, 0);
    const headcount = memberRows.filter(m => m.eating).length;
    const perHead = headcount > 0 ? totalExpense / headcount : 0;

    res.json({
      date,
      menu: menu ? { items: menu.items, notes: menu.notes, updated_at: menu.updated_at } : { items: [], notes: null, updated_at: null },
      expenses: expenses.map(e => ({
        id: e.id, item_name: e.item_name, category: e.category,
        cost: e.cost, paid_by: String(e.paid_by), notes: e.notes, created_at: e.created_at,
      })),
      tasks: tasks.map(t => ({
        id: t.id, task_name: t.task_name, assigned_to: t.assigned_to ? String(t.assigned_to) : null,
        status: t.status, notes: t.notes, created_at: t.created_at,
      })),
      members: memberRows,
      totals: { total_expense: totalExpense, headcount, per_head: Math.round(perHead * 100) / 100 },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load day' });
  }
});

// PUT /api/mess/groups/:groupId/days/:date/menu — only the group owner sets the menu
router.put('/groups/:groupId/days/:date/menu', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    const date = req.params.date;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const items = Array.isArray(req.body.items)
      ? req.body.items.map(s => String(s).trim()).filter(Boolean).slice(0, 40)
      : [];
    const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 300) : null;

    const menu = await MessMenu.findOneAndUpdate(
      { group: req.messGroup.id, date },
      { $set: { items, notes, updated_by: req.user.id, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true, new: true }
    );

    res.json({ items: menu.items, notes: menu.notes, updated_at: menu.updated_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save menu' });
  }
});

// POST /api/mess/groups/:groupId/days/:date/attendance — toggle a member's
// attendance for the day: { user_id, eating: true|false, reason? }
router.post('/groups/:groupId/days/:date/attendance', loadGroupAndMembership, async (req, res) => {
  try {
    const date = req.params.date;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const targetUserId = req.body.user_id || req.user.id;
    if (targetUserId !== req.user.id && req.messMembership.role !== 'owner') {
      return res.status(403).json({ error: 'Only the group owner can mark someone else absent' });
    }
    const member = await MessMember.findOne({ group: req.messGroup.id, user: targetUserId, status: 'active' });
    if (!member) return res.status(404).json({ error: 'That person is not a member of this group' });

    const eating = req.body.eating !== false; // default true

    if (eating) {
      await MessAttendance.deleteOne({ group: req.messGroup.id, date, member: targetUserId });
    } else {
      const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 120) : null;
      await MessAttendance.findOneAndUpdate(
        { group: req.messGroup.id, date, member: targetUserId },
        { $set: { reason } },
        { upsert: true }
      );
    }

    res.json({ user_id: String(targetUserId), eating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// POST /api/mess/groups/:groupId/days/:date/expenses — log an ingredient / purchased item
router.post('/groups/:groupId/days/:date/expenses', loadGroupAndMembership, async (req, res) => {
  try {
    const date = req.params.date;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const item_name = (req.body.item_name || '').trim();
    const cost = Number(req.body.cost);
    if (!item_name) return res.status(400).json({ error: 'Item name is required' });
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'Enter a valid cost' });

    const category = ['ingredient', 'purchased', 'other'].includes(req.body.category) ? req.body.category : 'ingredient';
    const paid_by = req.body.paid_by || req.user.id;

    const payerIsMember = await MessMember.findOne({ group: req.messGroup.id, user: paid_by, status: 'active' });
    if (!payerIsMember) return res.status(400).json({ error: 'Payer must be an active member of this group' });

    const expense = await MessExpense.create({
      group: req.messGroup.id,
      date,
      item_name: item_name.slice(0, 120),
      category,
      cost,
      paid_by,
      notes: req.body.notes ? String(req.body.notes).trim().slice(0, 300) : null,
      created_by: req.user.id,
    });

    res.status(201).json({
      id: expense.id, item_name: expense.item_name, category: expense.category,
      cost: expense.cost, paid_by: String(expense.paid_by), notes: expense.notes, created_at: expense.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

// PUT /api/mess/groups/:groupId/expenses/:expenseId — edit (payer or group owner)
router.put('/groups/:groupId/expenses/:expenseId', loadGroupAndMembership, async (req, res) => {
  try {
    const expense = await MessExpense.findOne({ _id: req.params.expenseId, group: req.messGroup.id });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const canEdit = req.messMembership.role === 'owner' || String(expense.created_by) === req.user.id || String(expense.paid_by) === req.user.id;
    if (!canEdit) return res.status(403).json({ error: 'Only the person who logged this, who paid it, or the group owner can edit it' });

    if (req.body.item_name !== undefined) {
      const item_name = String(req.body.item_name).trim();
      if (!item_name) return res.status(400).json({ error: 'Item name is required' });
      expense.item_name = item_name.slice(0, 120);
    }
    if (req.body.category !== undefined && ['ingredient', 'purchased', 'other'].includes(req.body.category)) {
      expense.category = req.body.category;
    }
    if (req.body.cost !== undefined) {
      const cost = Number(req.body.cost);
      if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'Enter a valid cost' });
      expense.cost = cost;
    }
    if (req.body.notes !== undefined) expense.notes = req.body.notes ? String(req.body.notes).trim().slice(0, 300) : null;
    if (req.body.paid_by !== undefined) {
      const payerIsMember = await MessMember.findOne({ group: req.messGroup.id, user: req.body.paid_by, status: 'active' });
      if (!payerIsMember) return res.status(400).json({ error: 'Payer must be an active member of this group' });
      expense.paid_by = req.body.paid_by;
    }

    await expense.save();
    res.json({
      id: expense.id, item_name: expense.item_name, category: expense.category,
      cost: expense.cost, paid_by: String(expense.paid_by), notes: expense.notes, created_at: expense.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// DELETE /api/mess/groups/:groupId/expenses/:expenseId
router.delete('/groups/:groupId/expenses/:expenseId', loadGroupAndMembership, async (req, res) => {
  try {
    const expense = await MessExpense.findOne({ _id: req.params.expenseId, group: req.messGroup.id });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const canDelete = req.messMembership.role === 'owner' || String(expense.created_by) === req.user.id || String(expense.paid_by) === req.user.id;
    if (!canDelete) return res.status(403).json({ error: 'Only the person who logged this, who paid it, or the group owner can delete it' });

    await MessExpense.deleteOne({ _id: expense.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// ===== Daily duties (who's cooking, washing dishes, bringing groceries) =====

// POST /api/mess/groups/:groupId/days/:date/tasks — add a duty for the day (owner only — Ali assigns who does what)
router.post('/groups/:groupId/days/:date/tasks', loadGroupAndMembership, requireOwner, async (req, res) => {
  try {
    const date = req.params.date;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const task_name = (req.body.task_name || '').trim();
    if (!task_name) return res.status(400).json({ error: 'Task name is required' });

    let assigned_to = req.body.assigned_to || null;
    if (assigned_to) {
      const isMember = await MessMember.findOne({ group: req.messGroup.id, user: assigned_to, status: 'active' });
      if (!isMember) return res.status(400).json({ error: 'Can only assign a task to an active member of this group' });
    }

    const task = await MessTask.create({
      group: req.messGroup.id,
      date,
      task_name: task_name.slice(0, 60),
      assigned_to,
      notes: req.body.notes ? String(req.body.notes).trim().slice(0, 200) : null,
      created_by: req.user.id,
    });

    res.status(201).json({
      id: task.id, task_name: task.task_name, assigned_to: task.assigned_to ? String(task.assigned_to) : null,
      status: task.status, notes: task.notes, created_at: task.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

// PUT /api/mess/groups/:groupId/tasks/:taskId — reassign/rename (owner only);
// the person a duty is assigned to can still flip it done/pending themselves.
router.put('/groups/:groupId/tasks/:taskId', loadGroupAndMembership, async (req, res) => {
  try {
    const task = await MessTask.findOne({ _id: req.params.taskId, group: req.messGroup.id });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isOwner = req.messMembership.role === 'owner';
    const isAssignee = task.assigned_to && String(task.assigned_to) === req.user.id;

    const wantsToRenameOrReassign = req.body.task_name !== undefined || req.body.assigned_to !== undefined || req.body.notes !== undefined;
    if (wantsToRenameOrReassign && !isOwner) {
      return res.status(403).json({ error: 'Only the group owner can reassign or edit a duty' });
    }
    if (req.body.status !== undefined && !isOwner && !isAssignee) {
      return res.status(403).json({ error: "Only the person it's assigned to, or the group owner, can mark this done" });
    }

    if (req.body.task_name !== undefined) {
      const task_name = String(req.body.task_name).trim();
      if (!task_name) return res.status(400).json({ error: 'Task name is required' });
      task.task_name = task_name.slice(0, 60);
    }
    if (req.body.assigned_to !== undefined) {
      if (req.body.assigned_to) {
        const isMember = await MessMember.findOne({ group: req.messGroup.id, user: req.body.assigned_to, status: 'active' });
        if (!isMember) return res.status(400).json({ error: 'Can only assign a task to an active member of this group' });
      }
      task.assigned_to = req.body.assigned_to || null;
    }
    if (req.body.status !== undefined && ['pending', 'done'].includes(req.body.status)) {
      task.status = req.body.status;
    }
    if (req.body.notes !== undefined) task.notes = req.body.notes ? String(req.body.notes).trim().slice(0, 200) : null;

    await task.save();
    res.json({
      id: task.id, task_name: task.task_name, assigned_to: task.assigned_to ? String(task.assigned_to) : null,
      status: task.status, notes: task.notes, created_at: task.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/mess/groups/:groupId/tasks/:taskId
router.delete('/groups/:groupId/tasks/:taskId', loadGroupAndMembership, async (req, res) => {
  try {
    const task = await MessTask.findOne({ _id: req.params.taskId, group: req.messGroup.id });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const canDelete = req.messMembership.role === 'owner' || String(task.created_by) === req.user.id;
    if (!canDelete) return res.status(403).json({ error: 'Only the group owner or whoever added this task can delete it' });

    await MessTask.deleteOne({ _id: task.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ===== Summary: who owes whom over a date range =====

// GET /api/mess/groups/:groupId/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Per member: how much they paid, how much their share of every day they
// ate actually came to, and the balance (paid - share). Positive balance
// = the group owes them; negative = they owe the group.
router.get('/groups/:groupId/summary', loadGroupAndMembership, async (req, res) => {
  try {
    const to = DATE_RE.test(req.query.to || '') ? req.query.to : todayStr();
    const from = DATE_RE.test(req.query.from || '') ? req.query.from : to.slice(0, 8) + '01'; // default: this month so far

    const [members, expenses, absences] = await Promise.all([
      serializeMembers(req.messGroup.id),
      MessExpense.find({ group: req.messGroup.id, date: { $gte: from, $lte: to } }),
      MessAttendance.find({ group: req.messGroup.id, date: { $gte: from, $lte: to } }),
    ]);

    const absentByDate = new Map(); // date -> Set(userId)
    for (const a of absences) {
      const key = a.date;
      if (!absentByDate.has(key)) absentByDate.set(key, new Set());
      absentByDate.get(key).add(String(a.member));
    }

    const expensesByDate = new Map(); // date -> total
    const paidByMember = new Map(members.map(m => [m.user_id, 0]));
    for (const e of expenses) {
      expensesByDate.set(e.date, (expensesByDate.get(e.date) || 0) + e.cost);
      const key = String(e.paid_by);
      paidByMember.set(key, (paidByMember.get(key) || 0) + e.cost);
    }

    const shareByMember = new Map(members.map(m => [m.user_id, 0]));
    let groupTotal = 0;
    let daysWithExpense = 0;

    for (const [date, dayTotal] of expensesByDate.entries()) {
      groupTotal += dayTotal;
      daysWithExpense += 1;
      const absentSet = absentByDate.get(date) || new Set();
      const eatingMembers = members.filter(m => !absentSet.has(m.user_id));
      const headcount = eatingMembers.length;
      if (headcount === 0) continue; // nobody marked as eating that day — can't attribute a per-head share
      const perHead = dayTotal / headcount;
      for (const m of eatingMembers) {
        shareByMember.set(m.user_id, shareByMember.get(m.user_id) + perHead);
      }
    }

    const rows = members.map(m => {
      const paid = Math.round((paidByMember.get(m.user_id) || 0) * 100) / 100;
      const share = Math.round((shareByMember.get(m.user_id) || 0) * 100) / 100;
      return {
        user_id: m.user_id,
        full_name: m.full_name,
        username: m.username,
        role: m.role,
        paid,
        share,
        balance: Math.round((paid - share) * 100) / 100,
      };
    });

    res.json({
      from, to,
      group_total: Math.round(groupTotal * 100) / 100,
      days_with_expense: daysWithExpense,
      members: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build summary' });
  }
});

module.exports = router;
