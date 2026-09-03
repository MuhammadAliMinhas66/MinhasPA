-- Run this in SSMS, connected to the MinhasPA database

USE MinhasPA;
GO

IF OBJECT_ID('dbo.loans', 'U') IS NOT NULL
    DROP TABLE dbo.loans;
GO

CREATE TABLE dbo.loans (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    direction     VARCHAR(10)   NOT NULL CHECK (direction IN ('given','taken')),
    person_name   NVARCHAR(100) NOT NULL,
    amount        DECIMAL(12,2) NOT NULL,
    description   NVARCHAR(500) NULL,
    date_taken    DATE          NOT NULL,
    due_date      DATE          NULL,
    status        VARCHAR(10)   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
    created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

-- is_critical is computed on the fly (due within 7 days & still pending)
-- rather than stored, so it's always accurate without a background job.
