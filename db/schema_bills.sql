-- Run this in SSMS, connected to the MinhasPA database.
-- This is a reference copy — routes/bills.js also creates all four tables
-- lazily on first use (same pattern as expense_categories/budgets elsewhere
-- in this app), so running this file is optional, not required.

USE MinhasPA;
GO

-- ===== Bill categories — Electricity / Internet / Others by default,
-- plus whatever custom types the user adds ("Gas", "Water", "Streaming"...) =====
IF OBJECT_ID('dbo.bill_categories', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bill_categories (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT           NOT NULL,
    [key]       VARCHAR(40)   NOT NULL,
    label       NVARCHAR(60)  NOT NULL,
    icon        VARCHAR(40)   NOT NULL DEFAULT 'ti-file-invoice',
    color       VARCHAR(10)   NOT NULL DEFAULT '#d4a24e',
    is_default  BIT           NOT NULL DEFAULT 0,
    created_at  DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_bill_categories_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT UQ_bill_category_user_key UNIQUE (user_id, [key])
  );
END
GO

-- ===== Bills — the recurring biller itself (Electricity from K-Electric,
-- Internet from PTCL, etc). One row per biller, not per month. =====
IF OBJECT_ID('dbo.bills', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bills (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    user_id         INT           NOT NULL,
    category_key    VARCHAR(40)   NOT NULL,
    biller_name     NVARCHAR(120) NOT NULL,
    due_day         INT           NOT NULL,      -- 1-31, day of month the bill is due; clamped to the real last day of short months
    default_amount  DECIMAL(12,2) NULL,           -- optional — prefills the first month; also the recurring amount when is_fixed_amount = 1
    is_fixed_amount BIT           NOT NULL DEFAULT 0, -- "same bill every month" — carries default_amount forward automatically each month
    notes           NVARCHAR(300) NULL,
    is_active       BIT           NOT NULL DEFAULT 1,
    created_at      DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_bills_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT CHK_bills_due_day CHECK (due_day BETWEEN 1 AND 31)
  );
END
GO

-- ===== Bill credentials — fully encrypted 1:1 with a bill. Everything
-- sensitive (portal login, password, the email/phone given to the ISP) is
-- stored as one AES-256-GCM blob (see utils/crypto.js) — never plaintext.
-- given_date is the only plain column since it's not sensitive and is
-- shown in the UI unencrypted (e.g. "connection given 12 Jan 2024"). =====
IF OBJECT_ID('dbo.bill_credentials', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bill_credentials (
    bill_id         INT           NOT NULL PRIMARY KEY,
    given_date      DATE          NULL,
    encrypted_data  NVARCHAR(MAX) NULL,   -- JSON {portal_email, portal_phone, portal_password, given_email, given_phone} encrypted as one blob
    updated_at      DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_bill_credentials_bills FOREIGN KEY (bill_id) REFERENCES dbo.bills(id) ON DELETE CASCADE
  );
END
GO

-- ===== Bill payments — one row per bill per month. Auto-created ("refreshed")
-- for the current month the first time /api/bills is hit that month. =====
IF OBJECT_ID('dbo.bill_payments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bill_payments (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    bill_id         INT           NOT NULL,
    user_id         INT           NOT NULL,
    month_year      VARCHAR(7)    NOT NULL,       -- 'YYYY-MM'
    amount          DECIMAL(12,2) NULL,           -- the actual bill amount for this month — filled in once known
    extra_charges   DECIMAL(12,2) NOT NULL DEFAULT 0, -- late fee / surcharge if paid late
    due_date        DATE          NOT NULL,
    status          VARCHAR(10)   NOT NULL DEFAULT 'pending', -- pending | paid
    paid_on         DATE          NULL,
    paid_through    NVARCHAR(60)  NULL,           -- e.g. "JazzCash", "Bank transfer", "Cash"
    created_at      DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_bill_payments_bills FOREIGN KEY (bill_id) REFERENCES dbo.bills(id) ON DELETE CASCADE,
    CONSTRAINT FK_bill_payments_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT UQ_bill_payment_month UNIQUE (bill_id, month_year)
  );
END
GO
