// scripts/migrate-mssql-to-mongo.js
//
// One-time data migration: reads every row out of the old SQL Server
// database and writes it into MongoDB through the app's own Mongoose
// models — so every collection is created and populated purely by code,
// with no manual Mongo setup involved.
//
// SAFE TO RE-RUN: it wipes the target Mongo collections before copying so
// running it twice never duplicates data. It does NOT touch the source
// SQL Server database at all (read-only).
//
// Requires the old SQL driver as a one-time dev dependency:
//   npm install --no-save mssql msnodesqlv8
// (kept out of the app's normal dependencies since production only needs
// MongoDB from here on)
//
// Usage:
//   1. Fill in OLD_DB_SERVER / OLD_DB_DATABASE and MONGODB_URI in .env
//   2. npm run migrate
//
// Uses Windows Integrated Authentication (Trusted_Connection), matching
// how this app's original db/connection.js talked to SQL Server. If your
// SQL Server instance uses SQL auth instead, set OLD_DB_USER/OLD_DB_PASSWORD
// below and switch to the commented-out config block.

require('dotenv').config();
const sql = require('mssql/msnodesqlv8');
const mongoose = require('mongoose');
const { connectDB } = require('../db/connection');
const {
  User, Loan, Rent, Expense, ExpenseCategory, Setting, Budget,
  Bill, BillCategory, BillCredential, BillPayment,
  Investment, MarketPrice, InvestmentPriceHistory,
  SalaryPlan, SalaryItem, SavingsEntry, Committee, CommitteePayment,
} = require('../models');

const OLD_DB_SERVER = process.env.OLD_DB_SERVER;
const OLD_DB_DATABASE = process.env.OLD_DB_DATABASE;

const sqlConfig = {
  connectionString:
    `Driver={ODBC Driver 17 for SQL Server};Server=${OLD_DB_SERVER};` +
    `Database=${OLD_DB_DATABASE};Trusted_Connection=Yes;`,
};

// If you use SQL Server authentication instead of Windows auth, comment
// the block above out and uncomment this one (needs plain `mssql`, not
// the msnodesqlv8 variant):
//
// const sqlConfigAlt = {
//   server: OLD_DB_SERVER,
//   database: OLD_DB_DATABASE,
//   user: process.env.OLD_DB_USER,
//   password: process.env.OLD_DB_PASSWORD,
//   options: { encrypt: false, trustServerCertificate: true },
// };

function nullish(v) {
  return v === undefined ? null : v;
}

async function run() {
  if (!OLD_DB_SERVER || !OLD_DB_DATABASE) {
    console.error('Set OLD_DB_SERVER and OLD_DB_DATABASE in .env before running the migration.');
    process.exit(1);
  }

  console.log('Connecting to the old SQL Server database (read-only)...');
  const pool = await sql.connect(sqlConfig);

  console.log('Connecting to MongoDB...');
  await connectDB();

  const stats = {};
  const count = (name, n) => { stats[name] = n; };

  try {
    // ===== 1. Users — every other table hangs off this id map =====
    console.log('\n[1/13] Migrating users...');
    await User.deleteMany({});
    const usersResult = await pool.request().query('SELECT * FROM dbo.users');
    const userIdMap = new Map(); // old INT id -> new Mongo ObjectId (string)

    for (const row of usersResult.recordset) {
      const doc = await User.create({
        full_name: row.full_name,
        username: row.username,
        email: row.email,
        password_hash: row.password_hash,
        role: row.role || 'user',
        plan: row.plan || 'free',
        is_active: row.is_active === undefined ? true : Boolean(row.is_active),
        // Old column was a comma-joined NVARCHAR; new field is a real array.
        disabled_features: row.disabled_features
          ? String(row.disabled_features).split(',').map(s => s.trim()).filter(Boolean)
          : [],
        created_at: row.created_at,
        last_login_at: nullish(row.last_login_at),
      });
      userIdMap.set(row.id, doc._id);
    }
    count('users', usersResult.recordset.length);
    console.log(`  -> ${usersResult.recordset.length} users migrated`);

    // ===== 2. Loans =====
    console.log('\n[2/13] Migrating loans...');
    await Loan.deleteMany({});
    const loansResult = await pool.request().query('SELECT * FROM dbo.loans');
    const loanIdMap = new Map();
    for (const row of loansResult.recordset) {
      const userMongoId = userIdMap.get(row.user_id);
      if (!userMongoId) { console.warn(`  skipping loan ${row.id}: unknown user_id ${row.user_id}`); continue; }
      const doc = await Loan.create({
        user: userMongoId, direction: row.direction, person_name: row.person_name,
        amount: row.amount, description: nullish(row.description),
        date_taken: row.date_taken, due_date: nullish(row.due_date),
        status: row.status, created_at: row.created_at,
      });
      loanIdMap.set(row.id, doc._id);
    }
    count('loans', loansResult.recordset.length);
    console.log(`  -> ${loansResult.recordset.length} loans migrated`);

    // ===== 3. Rent =====
    console.log('\n[3/13] Migrating rent...');
    await Rent.deleteMany({});
    const rentResult = await pool.request().query('SELECT * FROM dbo.rent');
    for (const row of rentResult.recordset) {
      const userMongoId = userIdMap.get(row.user_id);
      if (!userMongoId) { console.warn(`  skipping rent ${row.id}: unknown user_id ${row.user_id}`); continue; }
      await Rent.create({
        user: userMongoId, month_year: row.month_year, amount: row.amount,
        due_date: row.due_date, status: row.status, paid_date: nullish(row.paid_date),
        paid_by: row.paid_by, loan_name: nullish(row.loan_name), notes: nullish(row.notes),
        created_at: row.created_at,
      });
    }
    count('rent', rentResult.recordset.length);
    console.log(`  -> ${rentResult.recordset.length} rent records migrated`);

    // ===== 4. Expense categories (needed before expenses, for reference only —
    // expenses store the category KEY, not an id, so no FK remap needed there) =====
    console.log('\n[4/13] Migrating expense categories...');
    await ExpenseCategory.deleteMany({});
    const catResult = await pool.request().query('SELECT * FROM dbo.expense_categories');
    for (const row of catResult.recordset) {
      const userMongoId = userIdMap.get(row.user_id);
      if (!userMongoId) { console.warn(`  skipping category ${row.id}: unknown user_id ${row.user_id}`); continue; }
      await ExpenseCategory.create({
        user: userMongoId, key: row.key, label: row.label, icon: row.icon,
        color: row.color, is_default: Boolean(row.is_default), created_at: row.created_at,
      });
    }
    count('expense_categories', catResult.recordset.length);
    console.log(`  -> ${catResult.recordset.length} expense categories migrated`);

    // ===== 5. Expenses (linked_loan_id remapped via loanIdMap if the
    // column exists in your database — older installs may not have it) =====
    console.log('\n[5/13] Migrating expenses...');
    await Expense.deleteMany({});
    const expResult = await pool.request().query('SELECT * FROM dbo.expenses');
    for (const row of expResult.recordset) {
      const userMongoId = userIdMap.get(row.user_id);
      if (!userMongoId) { console.warn(`  skipping expense ${row.id}: unknown user_id ${row.user_id}`); continue; }
      const linkedLoanMongoId = row.linked_loan_id ? loanIdMap.get(row.linked_loan_id) : null;
      await Expense.create({
        user: userMongoId, category: row.category, amount: row.amount,
        expense_date: row.expense_date, paid_by: row.paid_by, payer_name: nullish(row.payer_name),
        note: nullish(row.note), status: row.status,
        linked_loan_id: nullish(linkedLoanMongoId), created_at: row.created_at,
      });
    }
    count('expenses', expResult.recordset.length);
    console.log(`  -> ${expResult.recordset.length} expenses migrated`);

    // ===== 6. Settings =====
    console.log('\n[6/13] Migrating settings...');
    await Setting.deleteMany({});
    const settingsResult = await pool.request().query('SELECT * FROM dbo.settings');
    for (const row of settingsResult.recordset) {
      const userMongoId = userIdMap.get(row.user_id);
      if (!userMongoId) { console.warn(`  skipping setting ${row.id}: unknown user_id ${row.user_id}`); continue; }
      await Setting.create({
        user: userMongoId, setting_key: row.setting_key, setting_value: row.setting_value,
        updated_at: row.updated_at,
      });
    }
    count('settings', settingsResult.recordset.length);
    console.log(`  -> ${settingsResult.recordset.length} settings migrated`);

    // ===== 7. Budgets (table only exists if the app created it) =====
    console.log('\n[7/13] Migrating budgets...');
    await Budget.deleteMany({});
    let budgetCount = 0;
    if (await tableExists(pool, 'budgets')) {
      const budgetsResult = await pool.request().query('SELECT * FROM dbo.budgets');
      for (const row of budgetsResult.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        if (!userMongoId) continue;
        await Budget.create({ user: userMongoId, category: row.category, monthly_limit: row.monthly_limit, updated_at: row.updated_at || new Date() });
        budgetCount += 1;
      }
    }
    count('budgets', budgetCount);
    console.log(`  -> ${budgetCount} budgets migrated`);

    // ===== 8. Bill categories, bills, bill credentials, bill payments =====
    console.log('\n[8/13] Migrating bill categories...');
    await BillCategory.deleteMany({});
    let billCatCount = 0;
    if (await tableExists(pool, 'bill_categories')) {
      const r = await pool.request().query('SELECT * FROM dbo.bill_categories');
      for (const row of r.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        if (!userMongoId) continue;
        await BillCategory.create({
          user: userMongoId, key: row.key, label: row.label, icon: row.icon,
          color: row.color, is_default: Boolean(row.is_default), created_at: row.created_at,
        });
        billCatCount += 1;
      }
    }
    count('bill_categories', billCatCount);
    console.log(`  -> ${billCatCount} bill categories migrated`);

    console.log('\n[9/13] Migrating bills, bill credentials, and bill payments...');
    await Bill.deleteMany({});
    await BillCredential.deleteMany({});
    await BillPayment.deleteMany({});
    let billCount = 0, credCount = 0, paymentCount = 0;
    const billIdMap = new Map();
    if (await tableExists(pool, 'bills')) {
      const billsResult = await pool.request().query('SELECT * FROM dbo.bills');
      for (const row of billsResult.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        if (!userMongoId) { console.warn(`  skipping bill ${row.id}: unknown user_id ${row.user_id}`); continue; }
        const doc = await Bill.create({
          user: userMongoId, category_key: row.category_key, biller_name: row.biller_name,
          due_day: row.due_day, default_amount: nullish(row.default_amount),
          is_fixed_amount: Boolean(row.is_fixed_amount), notes: nullish(row.notes),
          is_active: row.is_active === undefined ? true : Boolean(row.is_active),
          created_at: row.created_at,
        });
        billIdMap.set(row.id, doc._id);
        billCount += 1;
      }

      if (await tableExists(pool, 'bill_credentials')) {
        const credsResult = await pool.request().query('SELECT * FROM dbo.bill_credentials');
        for (const row of credsResult.recordset) {
          const billMongoId = billIdMap.get(row.bill_id);
          if (!billMongoId) continue;
          await BillCredential.create({
            bill: billMongoId, given_date: nullish(row.given_date),
            encrypted_data: nullish(row.encrypted_data), updated_at: row.updated_at,
          });
          credCount += 1;
        }
      }

      if (await tableExists(pool, 'bill_payments')) {
        const paymentsResult = await pool.request().query('SELECT * FROM dbo.bill_payments');
        for (const row of paymentsResult.recordset) {
          const billMongoId = billIdMap.get(row.bill_id);
          const userMongoId = userIdMap.get(row.user_id);
          if (!billMongoId || !userMongoId) continue;
          await BillPayment.create({
            bill: billMongoId, user: userMongoId, month_year: row.month_year,
            amount: nullish(row.amount), extra_charges: row.extra_charges || 0,
            due_date: row.due_date, status: row.status, paid_on: nullish(row.paid_on),
            paid_through: nullish(row.paid_through), created_at: row.created_at,
          });
          paymentCount += 1;
        }
      }
    }
    count('bills', billCount);
    count('bill_credentials', credCount);
    count('bill_payments', paymentCount);
    console.log(`  -> ${billCount} bills, ${credCount} credential sets, ${paymentCount} bill-payment months migrated`);

    // ===== 10. Investments + price history + market price cache =====
    console.log('\n[10/13] Migrating investments...');
    await Investment.deleteMany({});
    await InvestmentPriceHistory.deleteMany({});
    await MarketPrice.deleteMany({});
    const investIdMap = new Map();
    let investCount = 0;
    const investResult = await pool.request().query('SELECT * FROM dbo.investments');
    for (const row of investResult.recordset) {
      const userMongoId = userIdMap.get(row.user_id);
      if (!userMongoId) { console.warn(`  skipping investment ${row.id}: unknown user_id ${row.user_id}`); continue; }
      const doc = await Investment.create({
        user: userMongoId, type: row.type, name: row.name, description: nullish(row.description),
        invested_amount: row.invested_amount || 0, current_value: row.current_value,
        quantity: nullish(row.quantity), unit: nullish(row.unit), purchase_date: nullish(row.purchase_date),
        status: row.status, sold_value: nullish(row.sold_value), sold_date: nullish(row.sold_date),
        notes: nullish(row.notes),
        symbol: nullish(row.symbol), provider: nullish(row.provider),
        valuation_mode: row.valuation_mode || 'MANUAL',
        purchase_price: nullish(row.purchase_price), purchase_currency: row.purchase_currency || 'PKR',
        current_price: nullish(row.current_price), current_currency: row.current_currency || 'PKR',
        price_status: row.price_status || 'LIVE', price_updated_at: nullish(row.price_updated_at),
        interest_rate: nullish(row.interest_rate), interest_type: nullish(row.interest_type),
        maturity_date: nullish(row.maturity_date),
        created_at: row.created_at, updated_at: row.updated_at,
      });
      investIdMap.set(row.id, doc._id);
      investCount += 1;
    }
    count('investments', investCount);
    console.log(`  -> ${investCount} investments migrated`);

    console.log('\n[11/13] Migrating investment price history...');
    let histCount = 0;
    if (await tableExists(pool, 'investment_price_history')) {
      const histResult = await pool.request().query('SELECT * FROM dbo.investment_price_history');
      for (const row of histResult.recordset) {
        const investMongoId = investIdMap.get(row.investment_id);
        if (!investMongoId) continue;
        await InvestmentPriceHistory.create({
          investment: investMongoId, price: row.price, currency: row.currency,
          value_pkr: row.value_pkr, recorded_at: row.recorded_at, source: row.source,
        });
        histCount += 1;
      }
    }
    count('investment_price_history', histCount);
    console.log(`  -> ${histCount} price-history rows migrated`);

    console.log('\n[12/13] Migrating market price cache...');
    let marketCount = 0;
    if (await tableExists(pool, 'market_prices')) {
      const marketResult = await pool.request().query('SELECT * FROM dbo.market_prices');
      for (const row of marketResult.recordset) {
        await MarketPrice.create({
          provider: row.provider, asset_type: row.asset_type, symbol: row.symbol,
          price: row.price, currency: row.currency, status: row.status,
          fetched_at: row.fetched_at, expires_at: row.expires_at,
        });
        marketCount += 1;
      }
    }
    count('market_prices', marketCount);
    console.log(`  -> ${marketCount} cached market prices migrated`);

    // ===== 13. Salary plans/items, savings entries, committees, committee payments =====
    console.log('\n[13/13] Migrating salary plans/items, savings, and committees...');
    await SalaryPlan.deleteMany({});
    await SalaryItem.deleteMany({});
    await SavingsEntry.deleteMany({});
    await Committee.deleteMany({});
    await CommitteePayment.deleteMany({});

    let salaryPlanCount = 0, salaryItemCount = 0, savingsCount = 0, committeeCount = 0, committeePaymentCount = 0;
    const planIdMap = new Map();
    const committeeIdMap = new Map();

    if (await tableExists(pool, 'salary_plans')) {
      const r = await pool.request().query('SELECT * FROM dbo.salary_plans');
      for (const row of r.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        if (!userMongoId) continue;
        const doc = await SalaryPlan.create({
          user: userMongoId, month_year: row.month_year, salary: row.salary || 0,
          calculated_at: nullish(row.calculated_at), updated_at: row.updated_at || new Date(),
        });
        planIdMap.set(row.id, doc._id);
        salaryPlanCount += 1;
      }
    }
    if (await tableExists(pool, 'salary_items')) {
      const r = await pool.request().query('SELECT * FROM dbo.salary_items');
      for (const row of r.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        const planMongoId = planIdMap.get(row.plan_id);
        if (!userMongoId || !planMongoId) continue;
        await SalaryItem.create({
          user: userMongoId, plan: planMongoId, label: row.label, amount: row.amount,
          icon: row.icon || 'ti-tag', color: row.color || '#d4a24e', sort_order: row.sort_order || 0,
          source: nullish(row.source), detail: nullish(row.detail), created_at: row.created_at || new Date(),
        });
        salaryItemCount += 1;
      }
    }
    if (await tableExists(pool, 'savings_entries')) {
      const r = await pool.request().query('SELECT * FROM dbo.savings_entries');
      for (const row of r.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        if (!userMongoId) continue;
        await SavingsEntry.create({
          user: userMongoId, month_year: row.month_year, amount: row.amount,
          note: nullish(row.note), created_at: row.created_at || new Date(),
        });
        savingsCount += 1;
      }
    }
    if (await tableExists(pool, 'committees')) {
      const r = await pool.request().query('SELECT * FROM dbo.committees');
      for (const row of r.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        if (!userMongoId) continue;
        const doc = await Committee.create({
          user: userMongoId, name: row.name, monthly_amount: row.monthly_amount,
          members: nullish(row.members), payout_month: nullish(row.payout_month),
          started_date: nullish(row.started_date), status: row.status || 'active',
          created_at: row.created_at || new Date(),
        });
        committeeIdMap.set(row.id, doc._id);
        committeeCount += 1;
      }
    }
    if (await tableExists(pool, 'committee_payments')) {
      const r = await pool.request().query('SELECT * FROM dbo.committee_payments');
      for (const row of r.recordset) {
        const userMongoId = userIdMap.get(row.user_id);
        const committeeMongoId = committeeIdMap.get(row.committee_id);
        if (!userMongoId || !committeeMongoId) continue;
        await CommitteePayment.create({
          user: userMongoId, committee: committeeMongoId, month_year: row.month_year,
          status: row.status || 'unpaid', paid_date: nullish(row.paid_date),
          payment_method: nullish(row.payment_method), paid_by_other: Boolean(row.paid_by_other),
          payer_name: nullish(row.payer_name), reimbursed: Boolean(row.reimbursed),
          reimbursed_date: nullish(row.reimbursed_date), created_at: row.created_at || new Date(),
        });
        committeePaymentCount += 1;
      }
    }
    count('salary_plans', salaryPlanCount);
    count('salary_items', salaryItemCount);
    count('savings_entries', savingsCount);
    count('committees', committeeCount);
    count('committee_payments', committeePaymentCount);
    console.log(`  -> ${salaryPlanCount} salary plans, ${salaryItemCount} salary items, ${savingsCount} savings entries, ${committeeCount} committees, ${committeePaymentCount} committee payments migrated`);

    console.log('\n===== Migration complete =====');
    console.table(stats);
  } finally {
    await pool.close();
    await mongoose.connection.close();
  }
}

async function tableExists(pool, name) {
  const r = await pool.request()
    .input('name', sql.VarChar, name)
    .query(`SELECT OBJECT_ID('dbo.' + @name, 'U') AS obj`);
  return r.recordset[0].obj !== null;
}

run().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
