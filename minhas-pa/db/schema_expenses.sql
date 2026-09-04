-- Run this in SSMS, connected to the MinhasPA database

USE MinhasPA;
GO

IF OBJECT_ID('dbo.expenses', 'U') IS NOT NULL
    DROP TABLE dbo.expenses;
GO

-- category is now a free-text key (no CHECK list) so new categories can be
-- created on the fly from the UI — see schema_categories.sql for the table
-- that stores each category's label/icon/color.
CREATE TABLE dbo.expenses (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    category      VARCHAR(40)   NOT NULL,
    amount        DECIMAL(12,2) NOT NULL,
    expense_date  DATE          NOT NULL,
    paid_by       VARCHAR(10)   NOT NULL DEFAULT 'me' CHECK (paid_by IN ('me','other')),
    payer_name    NVARCHAR(100) NULL,
    note          NVARCHAR(300) NULL,
    status        VARCHAR(10)   NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','unpaid')),
    created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Run schema_categories.sql too (it seeds the default categories used above).

-- If you already have an expenses table with data and don't want to drop it,
-- run this instead of the block above:
-- ALTER TABLE dbo.expenses ADD paid_by VARCHAR(10) NOT NULL DEFAULT 'me' CHECK (paid_by IN ('me','other'));
-- ALTER TABLE dbo.expenses ADD payer_name NVARCHAR(100) NULL;
-- ALTER TABLE dbo.expenses ALTER COLUMN category VARCHAR(40) NOT NULL;
-- If your existing table has the old CHECK constraint on category, drop it first:
-- ALTER TABLE dbo.expenses DROP CONSTRAINT <constraint_name>; -- find name via sp_helpconstraint 'dbo.expenses'
