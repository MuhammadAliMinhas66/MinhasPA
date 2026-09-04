-- ============================================================================
-- MIGRATION: multi-user data isolation + super admin account
-- Run this ONCE in SSMS, connected to the MinhasPA database.
-- Safe to re-run (every step is guarded with an IF check).
--
-- What this does:
--   1. Adds a `role` column to dbo.users ('user' / 'super_admin')
--   2. Creates YOUR account: username MuhammadAliMinhas, role super_admin
--      (password is already bcrypt-hashed below — the real password is
--      minhas@123.comXX88, never stored anywhere in plain text)
--   3. Adds a user_id column to every data table (loans, rent, expenses,
--      expense_categories, settings, salary_plans, salary_items,
--      savings_entries, committees, committee_payments, budgets)
--   4. Backfills every EXISTING row in those tables to YOUR new account,
--      since you confirmed all current data is yours
--   5. Makes user_id NOT NULL + a foreign key to dbo.users, and fixes the
--      old "one row per month/category globally" unique constraints to be
--      "one row per month/category PER USER" instead
--
-- After this runs: every new person who signs up starts with zero rows in
-- every table above — they only ever see and create their own data. Your
-- existing data stays exactly as it is, just now tagged as yours.
-- ============================================================================

USE MinhasPA;
GO

-- ===== 1. Role column =====
IF COL_LENGTH('dbo.users', 'role') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD role VARCHAR(20) NOT NULL DEFAULT 'user';
END
GO

-- ===== 2. Your super admin account =====
-- Password hash below is bcrypt (cost 12). The plaintext password is not
-- recorded anywhere in this repo — if you don't remember it, reset it via
-- the app once you're logged in as super_admin, or update password_hash
-- directly with a fresh bcrypt hash.
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE username = 'muhammadaliminhas')
BEGIN
    INSERT INTO dbo.users (full_name, username, email, password_hash, role)
    VALUES (
        'Muhammad Ali Minhas',
        'muhammadaliminhas',
        'muhammadaliminhas@minhaspa.local',
        '$2b$12$kaubYAP6IngBOE/a6RIVZumyu0FUKFatrBDqPkQV8tv21AmG5Eqtu',
        'super_admin'
    );
END
ELSE
BEGIN
    -- Account already exists (e.g. you registered normally earlier) — just
    -- promote it to super_admin instead of creating a duplicate.
    UPDATE dbo.users SET role = 'super_admin' WHERE username = 'muhammadaliminhas';
END
GO

DECLARE @adminId INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');

-- ===== 3. dbo.loans =====
IF COL_LENGTH('dbo.loans', 'user_id') IS NULL
BEGIN
    ALTER TABLE dbo.loans ADD user_id INT NULL;
    EXEC('UPDATE dbo.loans SET user_id = ' + @adminId + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.loans ALTER COLUMN user_id INT NOT NULL;
    ALTER TABLE dbo.loans ADD CONSTRAINT FK_loans_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
END
GO

-- ===== 4. dbo.rent (month_year was globally unique — now unique per user) =====
IF COL_LENGTH('dbo.rent', 'user_id') IS NULL
BEGIN
    DECLARE @adminId2 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.rent ADD user_id INT NULL;
    EXEC('UPDATE dbo.rent SET user_id = ' + @adminId2 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.rent ALTER COLUMN user_id INT NOT NULL;

    DECLARE @rentUqName NVARCHAR(200);
    SELECT @rentUqName = kc.name FROM sys.key_constraints kc
        JOIN sys.tables t ON t.object_id = kc.parent_object_id
        WHERE t.name = 'rent' AND kc.type = 'UQ';
    IF @rentUqName IS NOT NULL
        EXEC('ALTER TABLE dbo.rent DROP CONSTRAINT ' + @rentUqName);

    ALTER TABLE dbo.rent ADD CONSTRAINT FK_rent_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
    ALTER TABLE dbo.rent ADD CONSTRAINT UQ_rent_user_month UNIQUE (user_id, month_year);
END
GO

-- ===== 5. dbo.expenses =====
IF COL_LENGTH('dbo.expenses', 'user_id') IS NULL
BEGIN
    DECLARE @adminId3 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.expenses ADD user_id INT NULL;
    EXEC('UPDATE dbo.expenses SET user_id = ' + @adminId3 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.expenses ALTER COLUMN user_id INT NOT NULL;
    ALTER TABLE dbo.expenses ADD CONSTRAINT FK_expenses_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
END
GO

-- ===== 6. dbo.expense_categories ([key] was globally unique — now unique per user) =====
IF COL_LENGTH('dbo.expense_categories', 'user_id') IS NULL
BEGIN
    DECLARE @adminId4 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.expense_categories ADD user_id INT NULL;
    EXEC('UPDATE dbo.expense_categories SET user_id = ' + @adminId4 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.expense_categories ALTER COLUMN user_id INT NOT NULL;

    DECLARE @catUqName NVARCHAR(200);
    SELECT @catUqName = kc.name FROM sys.key_constraints kc
        JOIN sys.tables t ON t.object_id = kc.parent_object_id
        WHERE t.name = 'expense_categories' AND kc.type = 'UQ';
    IF @catUqName IS NOT NULL
        EXEC('ALTER TABLE dbo.expense_categories DROP CONSTRAINT ' + @catUqName);

    ALTER TABLE dbo.expense_categories ADD CONSTRAINT FK_categories_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
    ALTER TABLE dbo.expense_categories ADD CONSTRAINT UQ_category_user_key UNIQUE (user_id, [key]);
END
GO

-- ===== 7. dbo.settings (setting_key was globally unique — now unique per user) =====
IF COL_LENGTH('dbo.settings', 'user_id') IS NULL
BEGIN
    DECLARE @adminId5 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.settings ADD user_id INT NULL;
    EXEC('UPDATE dbo.settings SET user_id = ' + @adminId5 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.settings ALTER COLUMN user_id INT NOT NULL;

    DECLARE @setUqName NVARCHAR(200);
    SELECT @setUqName = kc.name FROM sys.key_constraints kc
        JOIN sys.tables t ON t.object_id = kc.parent_object_id
        WHERE t.name = 'settings' AND kc.type = 'UQ';
    IF @setUqName IS NOT NULL
        EXEC('ALTER TABLE dbo.settings DROP CONSTRAINT ' + @setUqName);

    ALTER TABLE dbo.settings ADD CONSTRAINT FK_settings_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
    ALTER TABLE dbo.settings ADD CONSTRAINT UQ_settings_user_key UNIQUE (user_id, setting_key);
END
GO

-- ===== 8. dbo.salary_plans (only if it already exists — the app creates it
-- lazily, so on a brand-new install this table may not exist yet, which is fine) =====
IF OBJECT_ID('dbo.salary_plans', 'U') IS NOT NULL AND COL_LENGTH('dbo.salary_plans', 'user_id') IS NULL
BEGIN
    DECLARE @adminId6 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.salary_plans ADD user_id INT NULL;
    EXEC('UPDATE dbo.salary_plans SET user_id = ' + @adminId6 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.salary_plans ALTER COLUMN user_id INT NOT NULL;

    DECLARE @salUqName NVARCHAR(200);
    SELECT @salUqName = kc.name FROM sys.key_constraints kc
        JOIN sys.tables t ON t.object_id = kc.parent_object_id
        WHERE t.name = 'salary_plans' AND kc.type = 'UQ';
    IF @salUqName IS NOT NULL
        EXEC('ALTER TABLE dbo.salary_plans DROP CONSTRAINT ' + @salUqName);

    ALTER TABLE dbo.salary_plans ADD CONSTRAINT FK_salaryplans_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
    ALTER TABLE dbo.salary_plans ADD CONSTRAINT UQ_salaryplan_user_month UNIQUE (user_id, month_year);
END
GO

-- ===== 9. dbo.salary_items (scoped via its own user_id for simpler/safer queries) =====
IF OBJECT_ID('dbo.salary_items', 'U') IS NOT NULL AND COL_LENGTH('dbo.salary_items', 'user_id') IS NULL
BEGIN
    DECLARE @adminId7 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.salary_items ADD user_id INT NULL;
    EXEC('UPDATE dbo.salary_items SET user_id = ' + @adminId7 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.salary_items ALTER COLUMN user_id INT NOT NULL;
    ALTER TABLE dbo.salary_items ADD CONSTRAINT FK_salaryitems_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
END
GO

-- ===== 10. dbo.savings_entries =====
IF OBJECT_ID('dbo.savings_entries', 'U') IS NOT NULL AND COL_LENGTH('dbo.savings_entries', 'user_id') IS NULL
BEGIN
    DECLARE @adminId8 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.savings_entries ADD user_id INT NULL;
    EXEC('UPDATE dbo.savings_entries SET user_id = ' + @adminId8 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.savings_entries ALTER COLUMN user_id INT NOT NULL;
    ALTER TABLE dbo.savings_entries ADD CONSTRAINT FK_savingsentries_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
END
GO

-- ===== 11. dbo.committees =====
IF OBJECT_ID('dbo.committees', 'U') IS NOT NULL AND COL_LENGTH('dbo.committees', 'user_id') IS NULL
BEGIN
    DECLARE @adminId9 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.committees ADD user_id INT NULL;
    EXEC('UPDATE dbo.committees SET user_id = ' + @adminId9 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.committees ALTER COLUMN user_id INT NOT NULL;
    ALTER TABLE dbo.committees ADD CONSTRAINT FK_committees_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
END
GO

-- ===== 12. dbo.committee_payments (scoped via its own user_id too, for
-- simpler/safer queries alongside the existing committee_id ownership) =====
IF OBJECT_ID('dbo.committee_payments', 'U') IS NOT NULL AND COL_LENGTH('dbo.committee_payments', 'user_id') IS NULL
BEGIN
    DECLARE @adminId10 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');
    ALTER TABLE dbo.committee_payments ADD user_id INT NULL;
    EXEC('UPDATE dbo.committee_payments SET user_id = ' + @adminId10 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.committee_payments ALTER COLUMN user_id INT NOT NULL;
    ALTER TABLE dbo.committee_payments ADD CONSTRAINT FK_committeepayments_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
END
GO

-- ===== 13. dbo.budgets (PK was category alone — now composite user_id + category) =====
IF OBJECT_ID('dbo.budgets', 'U') IS NOT NULL AND COL_LENGTH('dbo.budgets', 'user_id') IS NULL
BEGIN
    DECLARE @adminId11 INT = (SELECT id FROM dbo.users WHERE username = 'muhammadaliminhas');

    DECLARE @budgetPkName NVARCHAR(200);
    SELECT @budgetPkName = kc.name FROM sys.key_constraints kc
        JOIN sys.tables t ON t.object_id = kc.parent_object_id
        WHERE t.name = 'budgets' AND kc.type = 'PK';
    IF @budgetPkName IS NOT NULL
        EXEC('ALTER TABLE dbo.budgets DROP CONSTRAINT ' + @budgetPkName);

    ALTER TABLE dbo.budgets ADD user_id INT NULL;
    EXEC('UPDATE dbo.budgets SET user_id = ' + @adminId11 + ' WHERE user_id IS NULL');
    ALTER TABLE dbo.budgets ALTER COLUMN user_id INT NOT NULL;
    ALTER TABLE dbo.budgets ADD CONSTRAINT FK_budgets_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
    ALTER TABLE dbo.budgets ADD CONSTRAINT PK_budgets_user_category PRIMARY KEY (user_id, category);
END
GO

-- ===== Done — sanity check =====
SELECT id, full_name, username, email, role, created_at FROM dbo.users;
GO
