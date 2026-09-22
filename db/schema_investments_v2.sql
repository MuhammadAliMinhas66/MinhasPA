-- Run in SSMS on MinhasPA, AFTER the original schema_investments.sql has already run.
-- This migration extends the existing investments table (does NOT drop it —
-- your data is preserved) and adds the market-data cache + price-history tables.

USE MinhasPA;
GO

-- ===== 1. Extend dbo.investments =====
IF COL_LENGTH('dbo.investments', 'symbol') IS NULL
    ALTER TABLE dbo.investments ADD symbol NVARCHAR(30) NULL;               -- e.g. AAPL, bitcoin (CoinGecko id)
GO
IF COL_LENGTH('dbo.investments', 'provider') IS NULL
    ALTER TABLE dbo.investments ADD provider VARCHAR(20) NULL;             -- twelvedata | coingecko | goldapi | NULL for manual/calculated
GO
IF COL_LENGTH('dbo.investments', 'valuation_mode') IS NULL
    ALTER TABLE dbo.investments ADD valuation_mode VARCHAR(12) NOT NULL DEFAULT 'MANUAL'
        CONSTRAINT CK_investments_valuation_mode CHECK (valuation_mode IN ('MARKET','CALCULATED','MANUAL'));
GO
IF COL_LENGTH('dbo.investments', 'purchase_price') IS NULL
    ALTER TABLE dbo.investments ADD purchase_price DECIMAL(18,6) NULL;      -- price per unit at purchase, in purchase_currency
GO
IF COL_LENGTH('dbo.investments', 'purchase_currency') IS NULL
    ALTER TABLE dbo.investments ADD purchase_currency VARCHAR(6) NOT NULL DEFAULT 'PKR';
GO
IF COL_LENGTH('dbo.investments', 'current_price') IS NULL
    ALTER TABLE dbo.investments ADD current_price DECIMAL(18,6) NULL;       -- latest market price per unit, in current_currency
GO
IF COL_LENGTH('dbo.investments', 'current_currency') IS NULL
    ALTER TABLE dbo.investments ADD current_currency VARCHAR(6) NOT NULL DEFAULT 'PKR';
GO
IF COL_LENGTH('dbo.investments', 'price_status') IS NULL
    ALTER TABLE dbo.investments ADD price_status VARCHAR(10) NOT NULL DEFAULT 'LIVE'
        CONSTRAINT CK_investments_price_status CHECK (price_status IN ('LIVE','STALE','ERROR','MANUAL'));
GO
IF COL_LENGTH('dbo.investments', 'price_updated_at') IS NULL
    ALTER TABLE dbo.investments ADD price_updated_at DATETIME2 NULL;
GO
-- Bonds/FD specific (CALCULATED mode)
IF COL_LENGTH('dbo.investments', 'interest_rate') IS NULL
    ALTER TABLE dbo.investments ADD interest_rate DECIMAL(7,4) NULL;        -- annual %, e.g. 21.5
GO
IF COL_LENGTH('dbo.investments', 'interest_type') IS NULL
    ALTER TABLE dbo.investments ADD interest_type VARCHAR(12) NULL
        CONSTRAINT CK_investments_interest_type CHECK (interest_type IN ('simple','compound') OR interest_type IS NULL);
GO
IF COL_LENGTH('dbo.investments', 'maturity_date') IS NULL
    ALTER TABLE dbo.investments ADD maturity_date DATE NULL;
GO

-- ===== 2. Market price cache =====
-- One cached price per (provider, asset_type, symbol) — shared across ALL users,
-- so 100 users holding AAPL means 1 external API call, not 100.
IF OBJECT_ID('dbo.market_prices', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.market_prices (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        provider     VARCHAR(20)     NOT NULL,                 -- twelvedata | coingecko | goldapi | exchangerate
        asset_type   VARCHAR(20)     NOT NULL,                 -- stocks | crypto | gold | fx
        symbol       NVARCHAR(30)    NOT NULL,                 -- AAPL | bitcoin | XAU | USD_PKR
        price        DECIMAL(18,6)   NOT NULL,
        currency     VARCHAR(6)      NOT NULL,
        status       VARCHAR(10)     NOT NULL DEFAULT 'LIVE'
                     CONSTRAINT CK_market_prices_status CHECK (status IN ('LIVE','STALE','ERROR')),
        fetched_at   DATETIME2       NOT NULL DEFAULT SYSDATETIME(),
        expires_at   DATETIME2       NOT NULL,
        CONSTRAINT UQ_market_prices UNIQUE (provider, asset_type, symbol)
    );
    CREATE INDEX IX_market_prices_lookup ON dbo.market_prices(asset_type, symbol);
END
GO

-- ===== 3. Price history (for future 1D/1W/1M charts) =====
IF OBJECT_ID('dbo.investment_price_history', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.investment_price_history (
        id             INT IDENTITY(1,1) PRIMARY KEY,
        investment_id  INT             NOT NULL,
        price          DECIMAL(18,6)   NOT NULL,
        currency       VARCHAR(6)      NOT NULL,
        value_pkr      DECIMAL(14,2)   NOT NULL,               -- current_value snapshot at recorded_at, in PKR
        recorded_at    DATETIME2       NOT NULL DEFAULT SYSDATETIME(),
        source         VARCHAR(20)     NOT NULL,               -- provider name or 'manual'
        CONSTRAINT FK_price_history_investment FOREIGN KEY (investment_id) REFERENCES dbo.investments(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_price_history_investment ON dbo.investment_price_history(investment_id, recorded_at);
END
GO

-- Backfill valuation_mode for any rows that predate this migration
UPDATE dbo.investments SET valuation_mode = 'MARKET'     WHERE type IN ('stocks','crypto','gold') AND valuation_mode = 'MANUAL' AND current_price IS NULL AND provider IS NULL;
UPDATE dbo.investments SET valuation_mode = 'CALCULATED' WHERE type = 'bonds' AND valuation_mode = 'MANUAL';
GO
