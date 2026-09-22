-- Run this in SSMS, connected to the MinhasPA database

USE MinhasPA;
GO

IF OBJECT_ID('dbo.rent', 'U') IS NOT NULL
    DROP TABLE dbo.rent;
GO

CREATE TABLE dbo.rent (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    month_year  VARCHAR(7)    NOT NULL UNIQUE,  -- 'YYYY-MM', one row per month
    amount      DECIMAL(12,2) NOT NULL,
    due_date    DATE          NOT NULL,
    status      VARCHAR(10)   NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','unpaid')),
    paid_date   DATE          NULL,
    paid_by     VARCHAR(10)   NOT NULL DEFAULT 'me' CHECK (paid_by IN ('me','loan')),
    loan_name   NVARCHAR(100) NULL,
    notes       NVARCHAR(300) NULL,
    created_at  DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

-- If you already have a rent table with data and don't want to drop it,
-- run this instead of the block above:
-- ALTER TABLE dbo.rent ADD paid_by VARCHAR(10) NOT NULL DEFAULT 'me' CHECK (paid_by IN ('me','loan'));
-- ALTER TABLE dbo.rent ADD loan_name NVARCHAR(100) NULL;
