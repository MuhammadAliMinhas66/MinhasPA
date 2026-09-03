-- Run this in SSMS, connected to the MinhasPA database.
-- Safe to run on a fresh DB or to re-run (drops and recreates the table).

USE MinhasPA;
GO

IF OBJECT_ID('dbo.investments', 'U') IS NOT NULL
    DROP TABLE dbo.investments;
GO

CREATE TABLE dbo.investments (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    user_id          INT             NOT NULL,
    type             VARCHAR(20)     NOT NULL
                      CHECK (type IN ('stocks','crypto','gold','property','business','vehicle','bonds','cash','other')),
    name             NVARCHAR(150)   NOT NULL,        -- e.g. "Bitcoin", "House — DHA Phase 6", "Shop capital"
    description      NVARCHAR(500)   NULL,
    invested_amount  DECIMAL(14,2)   NOT NULL DEFAULT 0,   -- capital originally put in
    current_value    DECIMAL(14,2)   NOT NULL,             -- what it's worth today (you update this over time)
    quantity         DECIMAL(18,6)   NULL,                 -- optional: 0.05 BTC, 10 tola, 500 shares
    unit             NVARCHAR(20)    NULL,                 -- optional: "BTC", "tola", "shares", "sq ft"
    purchase_date    DATE            NULL,
    status           VARCHAR(10)     NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','sold')),
    sold_value       DECIMAL(14,2)   NULL,                 -- what it actually sold for (only when status = 'sold')
    sold_date        DATE            NULL,
    notes            NVARCHAR(1000)  NULL,
    created_at       DATETIME2       NOT NULL DEFAULT SYSDATETIME(),
    updated_at       DATETIME2       NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_investments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
GO

CREATE INDEX IX_investments_user ON dbo.investments(user_id);
GO

-- gain/loss is computed on the fly in the API (current_value - invested_amount)
-- rather than stored, so it's always accurate the moment you update a value.
