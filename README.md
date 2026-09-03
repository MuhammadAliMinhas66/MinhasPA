# Minhas Personal Assistant

Loan, rent, and daily-expense tracker with a Node/Express backend and MSSQL database.

## What's included right now — all four features are complete
- App shell — sidebar navigation, dashboard layout
- **Loans** — add/edit/delete, filter by direction/status/critical, monthly filter
- **Rent** — one record per month, mark paid/unpaid, yearly paid total
- **Daily expenses** — categorized (mobile, meals, grocery, travel, family, kameti/committee, others), monthly filter, doughnut chart by category
- **Savings insights** — set your monthly income, see obligations vs income, a this-month-vs-last-month category chart, and rule-based suggestions grounded in your actual data

### Database setup for Savings insights
Run `db/schema_settings.sql` in SSMS (connected to `MinhasPA`) — creates the `settings` table
(used to store your monthly income).

## Setup (Windows Authentication)

You're using a trusted connection, so no SQL login/password — but the driver
that makes this possible (`msnodesqlv8`) is native code and needs to compile
during `npm install`. Do the prerequisites once, then it's smooth after that.

### 0. One-time prerequisites (skip if already installed)
- **Python 3.x** — https://www.python.org/downloads/ (check "Add to PATH" during install)
- **Visual Studio Build Tools** — https://visualstudio.microsoft.com/visual-cpp-build-tools/
  During install, tick the **"Desktop development with C++"** workload.
- Confirm **SQL Server Browser** service is running (needed to find the named
  instance `SQLEXPRESS`): open `services.msc` → find "SQL Server Browser" →
  start it, and set it to Automatic if you'll use this often.
- In **SQL Server Configuration Manager** → SQL Server Network Configuration →
  Protocols for SQLEXPRESS → make sure **TCP/IP** is Enabled.

### 1. Create the database
Already done — `MinhasPA` exists in SSMS.

### 2. Run the loans schema
Open `db/schema_loans.sql` in SSMS (connected to `MinhasPA`) and execute it.
Creates the `loans` table.

### 3. Install dependencies
```
npm install
```
If this fails on `msnodesqlv8` with a `node-gyp` / MSBuild error, it almost
always means step 0 (Build Tools) isn't fully installed — reboot after
installing them if it still fails.

### 4. Configure `.env`
Copy `.env.example` to `.env`. Defaults should already match your setup:
```
DB_SERVER=localhost
DB_INSTANCE=SQLEXPRESS
DB_DATABASE=MinhasPA
```
No username or password needed — it runs as whatever Windows user starts the app.

### 5. Run it
```
npm start
```
Open http://localhost:3000

### 6. Check the connection
Visit http://localhost:3000/api/health, then go to the **Loans** page and try
adding one. If it fails to save, the error will point to either the driver
(recompile) or the SQL Server network config (TCP/IP or Browser service off).

## What's next
Loans module: schema (loans table), API routes, and the UI (list, filters, add/edit form).

---

## Investments — assets & capital tracking

Tracks anything you own that's meant to grow: stocks, crypto, gold, property,
business capital, vehicles, bonds/FDs, cash reserves, or anything else. Every
holding stores what you put in (`invested_amount`) and what it's worth now
(`current_value`), so gain/loss (amount and %) is always shown automatically.
Mark a holding **Sold** to record what it actually sold for — realized
gains/losses are totalled separately from your active portfolio. There's also
a one-click "update value" pencil on each row for when you just want to
refresh a price without opening the full edit form.

Like every other table in this app, `investments` is scoped to `user_id` from
the start — no migration needed for it specifically.

### Database setup
Run **`db/schema_investments.sql`** in SSMS, connected to `MinhasPA`. Creates
the `investments` table (it references `dbo.users`, so run this after the
multi-user migration).

### What it adds
- `db/schema_investments.sql` — table
- `routes/investments.js` — CRUD (`GET/POST/PUT/DELETE /api/investments`),
  `GET /api/investments/summary` (portfolio totals + breakdown by type +
  realized gains), and `PATCH /api/investments/:id/value` (quick value update)
- `public/investments.html`, `public/js/investments.js`,
  `public/css/investments.css` — the page itself, following the same
  patterns as Loans/Expenses (stat cards, doughnut breakdown chart, filter
  chips, add/edit modal)
- A new **Investments** link in the sidebar on every page

---

## Authentication & multi-user data isolation

Every page now requires login. Every table is scoped to `user_id` — nobody
sees, edits, or deletes another account's data, ever.

### One-time database migration (do this before starting the app)
Run **`db/migrate_multiuser.sql`** in SSMS, connected to `MinhasPA`. It's
safe to run even if some tables don't exist yet (e.g. `salary_plans` is
created lazily by the app on first use — the script skips it if it's not there).

This single script:
1. Adds a `role` column to `dbo.users`
2. Creates your super admin account:
   - **Username:** `MuhammadAliMinhas`
   - **Password:** `minhas@123.comXX88` (only ever stored as a bcrypt hash)
3. Adds `user_id` to every data table and attributes ALL your existing rows
   to that account (since it was all yours already)
4. Fixes the old "unique per month globally" constraints (rent, salary,
   budgets, categories) to be "unique per month **per user**" instead

After this runs, log in at `/login.html` with the username/password above.
Every *new* person who signs up via `/register.html` starts with zero rows
in every table — they only ever see what they create themselves.

### Configure `.env`
Add these two lines (a real random secret was generated for you separately —
see the chat where this was delivered):
```
JWT_SECRET=<your generated secret>
JWT_EXPIRES_IN=7d
```
Never commit the real `.env` file, and never reuse the example placeholder
in `.env.example` once you're hosting this publicly.

### How the isolation works, technically
- `middleware/auth.js` verifies the JWT on every `/api/*` request except
  `/api/auth/register` and `/api/auth/login`, and attaches `req.user.id`.
- Every route file (`loans.js`, `rent.js`, `expenses.js`, `categories.js`,
  `settings.js`, `salary.js`, `savings.js`, `dashboard.js`) filters every
  `SELECT`/`UPDATE`/`DELETE` by `WHERE user_id = @userId`, and every
  `INSERT` writes the logged-in user's id.
- `public/js/auth.js` attaches the JWT to every frontend `fetch()` call
  automatically (no other frontend file had to change) and bounces to
  `login.html` if a request ever comes back `401`.
- New accounts get their own private set of default expense categories at
  signup (`routes/auth.js`) — nothing is shared between accounts.

### Investments is now a Premium (paid) feature
Run **`db/schema_add_plan.sql`** — adds a `plan` column (`free`/`premium`) to
`dbo.users`, default `free`. Enforcement is server-side in
`middleware/requirePremium.js`, applied to `/api/investments` and
`/api/market` in `server.js` — free-plan users get a `403` even if they
hit the API directly. The Investments page itself shows an upgrade screen
instead of the dashboard for free users, and the sidebar link gets a small
"PRO" badge. `super_admin` accounts always have access regardless of plan.

To upgrade a user to Premium:
```sql
UPDATE dbo.users SET plan = 'premium' WHERE username = 'their_username';
```
They need to log out and back in afterward — plan is baked into the JWT at
login, same as role already was.

### Big numbers are now shown compactly
Rs 17,653,530.93 now renders as **Rs 1.77 Cr** (Lac/Crore notation) on the
Investments page — stat cards, chart, legend, realized panel, and table.
Hover any value to see the exact figure in a tooltip.
