-- Run in SSMS on MinhasPA. Adds a `plan` column to control access to paid
-- features (currently: Investments). Safe to re-run.
--
-- Note: `plan` is bracketed as [plan] throughout — it's on SQL Server's
-- reserved/ODBC keyword list, so unquoted use of it as a column name can
-- throw "Incorrect syntax near the keyword 'plan'" on some drivers/clients.

USE MinhasPA;
GO

IF COL_LENGTH('dbo.users', 'plan') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD [plan] VARCHAR(20) NOT NULL DEFAULT 'free'
        CONSTRAINT CK_users_plan CHECK ([plan] IN ('free', 'premium'));
END
GO

-- To upgrade a specific user to Premium (unlocks Investments for them):
--   UPDATE dbo.users SET [plan] = 'premium' WHERE username = 'their_username';
--
-- To downgrade back to free:
--   UPDATE dbo.users SET [plan] = 'free' WHERE username = 'their_username';
--
-- Note: role = 'super_admin' accounts always have access regardless of plan.
-- After changing a user's plan, they need to log out and back in — their
-- plan is baked into their JWT at login time, same as their role already is.
