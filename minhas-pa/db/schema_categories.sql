-- Run this in SSMS, connected to the MinhasPA database
-- Lets "Daily expenses" categories be extended by the user at any time
-- (previously the category list was frozen by a CHECK constraint).

USE MinhasPA;
GO

IF OBJECT_ID('dbo.expense_categories', 'U') IS NOT NULL
    DROP TABLE dbo.expense_categories;
GO

CREATE TABLE dbo.expense_categories (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    [key]       VARCHAR(40)   NOT NULL UNIQUE,
    label       NVARCHAR(60)  NOT NULL,
    icon        VARCHAR(40)   NOT NULL DEFAULT 'ti-tag',
    color       VARCHAR(10)   NOT NULL DEFAULT '#d4a24e',
    is_default  BIT           NOT NULL DEFAULT 0,
    created_at  DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

INSERT INTO dbo.expense_categories ([key], label, icon, color, is_default) VALUES
    ('mobile',  'Mobile package',      'ti-device-mobile',  '#d4a24e', 1),
    ('meals',   'Meals',               'ti-tools-kitchen-2', '#2dd4bf', 1),
    ('grocery', 'Grocery',             'ti-shopping-cart',  '#f2a93b', 1),
    ('travel',  'Travel',              'ti-plane',           '#7c9eff', 1),
    ('family',  'Family',              'ti-users',           '#e5484d', 1),
    ('kameti',  'Kameti / committee',  'ti-coins',           '#c084fc', 1),
    ('others',  'Others',              'ti-dots',            '#6b6960', 1);
GO

-- If you already have data and don't want to drop/recreate, run just the
-- CREATE TABLE + INSERT block above (skip the DROP) instead.
