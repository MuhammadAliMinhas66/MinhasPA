-- Run in SSMS on MinhasPA. Adds what the admin dashboard needs:
--   1) is_active — lets an admin disable a whole account (blocks login)
--   2) disabled_features — a simple comma-list of feature keys turned OFF
--      for that specific user (e.g. 'investments,savings') — independent of
--      the [plan]/role gating already in place for Investments specifically.
-- Safe to re-run.

USE MinhasPA;
GO

IF COL_LENGTH('dbo.users', 'is_active') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD is_active BIT NOT NULL DEFAULT 1;
END
GO

IF COL_LENGTH('dbo.users', 'disabled_features') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD disabled_features NVARCHAR(400) NOT NULL DEFAULT '';
END
GO

-- To disable someone's account entirely (blocks login):
--   UPDATE dbo.users SET is_active = 0 WHERE username = 'their_username';
--
-- To turn off a specific feature for one user without banning them:
--   UPDATE dbo.users SET disabled_features = 'investments,savings' WHERE username = 'their_username';
--
-- Valid feature keys match the sidebar pages: loans, rent, expenses, savings,
-- investments, committees, salary. All of this is also driven from the
-- Admin dashboard UI once you're logged in as a super_admin — you shouldn't
-- need to run manual UPDATEs day-to-day.
