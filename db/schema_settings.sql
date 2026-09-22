-- Run this in SSMS, connected to the MinhasPA database

USE MinhasPA;
GO

IF OBJECT_ID('dbo.settings', 'U') IS NOT NULL
    DROP TABLE dbo.settings;
GO

CREATE TABLE dbo.settings (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    setting_key    VARCHAR(50)   NOT NULL UNIQUE,
    setting_value  NVARCHAR(200) NOT NULL,
    updated_at     DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO
