-- Run this in SSMS on MinhasPA. Each GO-separated block is its own batch —
-- required so SQL Server re-reads the table's column list before the next
-- block tries to use user_id (adding a column and querying it in the same
-- batch is what caused "Invalid column name 'user_id'").

USE MinhasPA;
GO

IF OBJECT_ID('dbo.settings', 'U') IS NOT NULL AND COL_LENGTH('dbo.settings', 'user_id') IS NULL
BEGIN
    ALTER TABLE dbo.settings ADD user_id INT NULL;
END
GO

DECLARE @firstUserId INT = (SELECT TOP 1 id FROM dbo.users ORDER BY id ASC);
IF @firstUserId IS NOT NULL
    UPDATE dbo.settings SET user_id = @firstUserId WHERE user_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.settings WHERE user_id IS NULL)
BEGIN
    ALTER TABLE dbo.settings ALTER COLUMN user_id INT NOT NULL;
END
GO

DECLARE @ucName NVARCHAR(200);
SELECT @ucName = kc.name FROM sys.key_constraints kc
  JOIN sys.tables t ON t.object_id = kc.parent_object_id
  WHERE t.name = 'settings' AND kc.type = 'UQ';
IF @ucName IS NOT NULL
    EXEC('ALTER TABLE dbo.settings DROP CONSTRAINT ' + @ucName);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_settings_users')
    ALTER TABLE dbo.settings ADD CONSTRAINT FK_settings_users FOREIGN KEY (user_id) REFERENCES dbo.users(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_settings_user_key')
    ALTER TABLE dbo.settings ADD CONSTRAINT UQ_settings_user_key UNIQUE (user_id, setting_key);
GO

SELECT * FROM dbo.settings;
